<?php

namespace App\Services\Backup;

use App\Models\BackupRun;
use App\Models\BackupSetting;
use App\Models\Installation;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;
use ZipArchive;

/**
 * Builds an encrypted .wnkjba backup of the active modules' data.
 *
 * Two ways out:
 *  - Local destination  → prepareDownload(): the file is streamed to the
 *    admin's own computer (never kept on the server).
 *  - FTP / SFTP / S3     → run(): the file is shipped to that remote disk
 *    (this is what scheduled backups use).
 *
 * File format (.wnkjba):
 *   "WNKJBAK1"                     8-byte magic
 *   uint32 BE header length
 *   header JSON { v, cipher, kdf, salt, opslimit, memlimit, ss_header }
 *   framed secretstream chunks: [uint32 BE len][ciphertext] …  (last = FINAL)
 * The sealed payload is a ZIP of: manifest.json + data/<module>/<table>.jsonl
 *
 * Encryption: XChaCha20-Poly1305 secretstream, key = Argon2id(passphrase, salt).
 * Independent of the module/license keys and pepper. The passphrase is never
 * stored in the file; a wrong passphrase cannot decrypt (authenticated).
 */
class BackupExporter
{
    private const MAGIC = 'WNKJBAK1';
    private const EXT = '.wnkjba';
    private const CHUNK = 65536; // 64 KiB plaintext chunks

    public function __construct(private BackupPlanner $planner) {}

    /**
     * Ship a backup to the configured remote destination (ftp/sftp/s3).
     * Local is download-only, so it is rejected here.
     *
     * @return array{ok:bool, message:string, run_id?:int, filename?:string, size?:int}
     */
    public function run(string $trigger = 'manual', ?int $userId = null): array
    {
        $settings = BackupSetting::current();
        if (blank($settings->passphrase)) {
            return ['ok' => false, 'message' => 'Set a backup passphrase before running a backup.'];
        }
        if ($settings->destination_driver === 'local') {
            return ['ok' => false, 'message' => 'The Local destination downloads to your computer — use "Back up now" on the page. Pick FTP, SFTP or S3 for automatic/remote backups.'];
        }

        $run = $this->newRun($settings, $trigger, $userId);
        $work = $this->workDir($run);
        try {
            $a = $this->assemble($run, $settings, $work);

            $disk = $this->disk($settings);
            $stream = fopen($a['path'], 'rb');
            $disk->put($a['filename'], $stream);
            if (is_resource($stream)) {
                fclose($stream);
            }

            $this->finish($run, $settings, $a);
            $this->prune($disk, $settings->retention_count);

            return ['ok' => true, 'message' => $this->message($a), 'run_id' => $run->id, 'filename' => $a['filename'], 'size' => $a['size']];
        } catch (Throwable $e) {
            $this->failRun($run, $settings, $e);
            return ['ok' => false, 'message' => 'Backup failed: ' . $e->getMessage(), 'run_id' => $run->id];
        } finally {
            $this->rmdir($work);
        }
    }

    /**
     * Build a backup for immediate download to the admin's machine. The caller
     * streams the returned path and deletes it afterwards.
     *
     * @return array{ok:bool, message?:string, path?:string, filename?:string, run_id?:int}
     */
    public function prepareDownload(?int $userId = null): array
    {
        $settings = BackupSetting::current();
        if (blank($settings->passphrase)) {
            return ['ok' => false, 'message' => 'Set a backup passphrase before running a backup.'];
        }

        $run = $this->newRun($settings, 'manual', $userId);
        $work = $this->workDir($run);
        try {
            $a = $this->assemble($run, $settings, $work);
            // Move the sealed file out of the work dir so we can clean the rest now.
            $flat = storage_path('app/backup-tmp/' . $a['filename']);
            @rename($a['path'], $flat);

            $this->finish($run, $settings, $a);
            $this->rmdir($work);

            return ['ok' => true, 'path' => $flat, 'filename' => $a['filename'], 'run_id' => $run->id];
        } catch (Throwable $e) {
            $this->failRun($run, $settings, $e);
            $this->rmdir($work);
            return ['ok' => false, 'message' => 'Backup failed: ' . $e->getMessage()];
        }
    }

    // ── Shared build ──────────────────────────────────────────────────────

    private function newRun(BackupSetting $s, string $trigger, ?int $userId): BackupRun
    {
        return BackupRun::create([
            'uuid'               => (string) Str::uuid(),
            'status'             => BackupRun::RUNNING,
            'trigger'            => $trigger,
            'destination_driver' => $s->destination_driver,
            'previous_run_id'    => BackupRun::lastSuccessful()?->id,
            'started_at'         => now(),
            'started_by'         => $userId,
        ]);
    }

    private function workDir(BackupRun $run): string
    {
        $dir = storage_path('app/backup-tmp/' . $run->uuid);
        @mkdir($dir, 0700, true);
        return $dir;
    }

    /** @return array{path:string, filename:string, checksum:string, size:int, tables:int, rows:int} */
    private function assemble(BackupRun $run, BackupSetting $settings, string $work): array
    {
        $zipPath = "$work/payload.zip";
        $filename = $this->filename($run->uuid);
        $sealedPath = "$work/$filename";

        [$tableCount, $rowCount] = $this->buildZip($zipPath, $settings);
        $this->seal($zipPath, $sealedPath, $settings->passphrase);
        @unlink($zipPath);

        return [
            'path'     => $sealedPath,
            'filename' => $filename,
            'checksum' => hash_file('sha256', $sealedPath),
            'size'     => filesize($sealedPath),
            'tables'   => $tableCount,
            'rows'     => $rowCount,
        ];
    }

    private function finish(BackupRun $run, BackupSetting $settings, array $a): void
    {
        $run->update([
            'status'      => BackupRun::OK,
            'filename'    => $a['filename'],
            'size_bytes'  => $a['size'],
            'table_count' => $a['tables'],
            'row_count'   => $a['rows'],
            'checksum'    => $a['checksum'],
            'finished_at' => now(),
        ]);
        $settings->update(['last_run_at' => now(), 'last_status' => BackupRun::OK]);
    }

    private function failRun(BackupRun $run, BackupSetting $settings, Throwable $e): void
    {
        $run->update(['status' => BackupRun::FAILED, 'finished_at' => now(), 'error' => $e->getMessage()]);
        $settings->update(['last_run_at' => now(), 'last_status' => BackupRun::FAILED]);
    }

    private function message(array $a): string
    {
        return "Backup complete — {$a['tables']} tables, " . number_format($a['rows']) . ' rows.';
    }

    // ── Build the ZIP payload (manifest + per-table JSONL) ────────────────

    /** @return array{0:int,1:int} [tableCount, rowCount] */
    private function buildZip(string $zipPath, BackupSetting $settings): array
    {
        $plan = $this->planner->plan();
        $install = Installation::current();

        $zip = new ZipArchive();
        if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Could not create the backup archive.');
        }

        $manifest = [
            'format'      => 'wnkj-backup',
            'version'     => 1,
            'created_at'  => now()->toIso8601String(),
            'client_uuid' => $install?->client_uuid,
            'business'    => $install?->business_name,
            'modules'     => [],
        ];
        $tableCount = 0;
        $rowCount = 0;
        $temps = [];

        foreach ($plan['included'] as $group) {
            $moduleEntry = ['module' => $group['module'], 'name' => $group['name'], 'tables' => []];
            foreach ($group['tables'] as $table) {
                $tmp = tempnam(sys_get_temp_dir(), 'tbl');
                $temps[] = $tmp;
                [$rows, $sha] = $this->dumpTable($table, $tmp);
                $zip->addFile($tmp, "data/{$group['module']}/{$table}.jsonl");
                $moduleEntry['tables'][] = ['table' => $table, 'rows' => $rows, 'sha256' => $sha];
                $tableCount++;
                $rowCount += $rows;
            }
            $manifest['modules'][] = $moduleEntry;
        }

        $manifest['table_count'] = $tableCount;
        $manifest['row_count'] = $rowCount;
        $zip->addFromString('manifest.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

        if ($zip->close() !== true) {
            throw new RuntimeException('Could not finalise the backup archive.');
        }
        foreach ($temps as $t) {
            @unlink($t);
        }

        return [$tableCount, $rowCount];
    }

    /** Stream one table to a JSONL file. Returns [rowCount, sha256]. */
    private function dumpTable(string $table, string $outPath): array
    {
        $fh = fopen($outPath, 'wb');
        $hash = hash_init('sha256');
        $rows = 0;

        foreach (DB::table($table)->cursor() as $row) {
            $line = json_encode((array) $row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
            fwrite($fh, $line);
            hash_update($hash, $line);
            $rows++;
        }

        fclose($fh);

        return [$rows, hash_final($hash)];
    }

    // ── Seal the ZIP into .wnkjba (XChaCha20-Poly1305 secretstream) ───────

    private function seal(string $zipPath, string $outPath, string $passphrase): void
    {
        $salt = random_bytes(SODIUM_CRYPTO_PWHASH_SALTBYTES);
        $opslimit = SODIUM_CRYPTO_PWHASH_OPSLIMIT_MODERATE;
        $memlimit = SODIUM_CRYPTO_PWHASH_MEMLIMIT_MODERATE;
        $key = sodium_crypto_pwhash(
            SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES,
            $passphrase, $salt, $opslimit, $memlimit, SODIUM_CRYPTO_PWHASH_ALG_ARGON2ID13
        );

        [$state, $ssHeader] = sodium_crypto_secretstream_xchacha20poly1305_init_push($key);

        $header = json_encode([
            'v'         => 1,
            'cipher'    => 'xchacha20poly1305',
            'kdf'       => 'argon2id',
            'salt'      => base64_encode($salt),
            'opslimit'  => $opslimit,
            'memlimit'  => $memlimit,
            'ss_header' => base64_encode($ssHeader),
        ], JSON_UNESCAPED_SLASHES);

        $in = fopen($zipPath, 'rb');
        $out = fopen($outPath, 'wb');
        fwrite($out, self::MAGIC);
        fwrite($out, pack('N', strlen($header)));
        fwrite($out, $header);

        while (!feof($in)) {
            $chunk = fread($in, self::CHUNK);
            if ($chunk === '' || $chunk === false) {
                if (feof($in)) {
                    break;
                }
                continue;
            }
            $tag = feof($in)
                ? SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_FINAL
                : SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_MESSAGE;
            $cipher = sodium_crypto_secretstream_xchacha20poly1305_push($state, $chunk, '', $tag);
            fwrite($out, pack('N', strlen($cipher)));
            fwrite($out, $cipher);
        }

        fclose($in);
        fclose($out);
        sodium_memzero($key);
    }

    // ── Destination + retention (remote drivers only) ─────────────────────

    private function disk(BackupSetting $s): Filesystem
    {
        $cfg = $s->destination_config ?? [];

        return match ($s->destination_driver) {
            'ftp' => Storage::build(array_filter([
                'driver'   => 'ftp',
                'host'     => $cfg['host'] ?? null,
                'username' => $cfg['username'] ?? null,
                'password' => $cfg['password'] ?? null,
                'port'     => isset($cfg['port']) ? (int) $cfg['port'] : 21,
                'root'     => $cfg['path'] ?? '',
            ], fn ($v) => $v !== null)),
            'sftp' => Storage::build(array_filter([
                'driver'   => 'sftp',
                'host'     => $cfg['host'] ?? null,
                'username' => $cfg['username'] ?? null,
                'password' => $cfg['password'] ?? null,
                'port'     => isset($cfg['port']) ? (int) $cfg['port'] : 22,
                'root'     => $cfg['path'] ?? '',
            ], fn ($v) => $v !== null)),
            's3' => Storage::build([
                'driver'   => 's3',
                'key'      => $cfg['access_key'] ?? null,
                'secret'   => $cfg['secret'] ?? null,
                'region'   => $cfg['region'] ?? 'us-east-1',
                'bucket'   => $cfg['bucket'] ?? null,
                'endpoint' => $cfg['endpoint'] ?? null,
                'root'     => $cfg['path'] ?? '',
                'use_path_style_endpoint' => true,
            ]),
            default => throw new RuntimeException('Unknown backup destination.'),
        };
    }

    private function prune(Filesystem $disk, int $keep): void
    {
        try {
            $files = collect($disk->files())
                ->filter(fn ($f) => str_ends_with($f, self::EXT))
                ->sortDesc()
                ->values();
            foreach ($files->slice(max(1, $keep)) as $old) {
                $disk->delete($old);
            }
        } catch (Throwable $e) {
            // Pruning failure never fails the backup.
        }
    }

    private function filename(string $uuid): string
    {
        return 'wnkj-backup-' . now()->format('Ymd-His') . '-' . substr($uuid, 0, 8) . self::EXT;
    }

    private function rmdir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        foreach (scandir($dir) ?: [] as $f) {
            if ($f === '.' || $f === '..') {
                continue;
            }
            $p = "$dir/$f";
            is_dir($p) ? $this->rmdir($p) : @unlink($p);
        }
        @rmdir($dir);
    }
}
