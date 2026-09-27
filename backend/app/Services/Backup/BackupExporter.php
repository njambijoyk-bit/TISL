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
 * Builds an encrypted .wnkjbak backup of the active modules' data and ships it
 * to the configured destination.
 *
 * File format (.wnkjbak):
 *   "WNKJBAK1"                     8-byte magic
 *   uint32 BE header length
 *   header JSON { v, cipher, kdf, salt, opslimit, memlimit, ss_header }
 *   framed secretstream chunks: [uint32 BE len][ciphertext] …  (last = FINAL)
 * The sealed payload is a ZIP of: manifest.json + data/<module>/<table>.jsonl
 *
 * Encryption is xchacha20poly1305 secretstream, key = Argon2id(passphrase,salt).
 * Independent of the module/license keys and pepper.
 */
class BackupExporter
{
    private const MAGIC = 'WNKJBAK1';
    private const CHUNK = 65536; // 64 KiB plaintext chunks

    public function __construct(private BackupPlanner $planner) {}

    /**
     * @return array{ok:bool, message:string, run_id?:int, filename?:string, size?:int}
     */
    public function run(string $trigger = 'manual', ?int $userId = null): array
    {
        $settings = BackupSetting::current();
        $pass = $settings->passphrase;
        if (blank($pass)) {
            return ['ok' => false, 'message' => 'Set a backup passphrase before running a backup.'];
        }

        $prev = BackupRun::lastSuccessful();
        $run = BackupRun::create([
            'uuid'               => (string) Str::uuid(),
            'status'             => BackupRun::RUNNING,
            'trigger'            => $trigger,
            'destination_driver' => $settings->destination_driver,
            'previous_run_id'    => $prev?->id,
            'started_at'         => now(),
            'started_by'         => $userId,
        ]);

        $work = storage_path('app/backup-tmp/' . $run->uuid);
        @mkdir($work, 0700, true);
        $zipPath = "$work/payload.zip";
        $sealedPath = "$work/backup.wnkjbak";

        try {
            [$tableCount, $rowCount] = $this->buildZip($zipPath, $settings);
            $this->seal($zipPath, $sealedPath, $pass);

            $checksum = hash_file('sha256', $sealedPath);
            $size = filesize($sealedPath);
            $filename = $this->filename($run->uuid);

            $disk = $this->disk($settings);
            $stream = fopen($sealedPath, 'rb');
            $disk->put($filename, $stream);
            if (is_resource($stream)) {
                fclose($stream);
            }

            $run->update([
                'status'      => BackupRun::OK,
                'filename'    => $filename,
                'size_bytes'  => $size,
                'table_count' => $tableCount,
                'row_count'   => $rowCount,
                'checksum'    => $checksum,
                'finished_at' => now(),
            ]);
            $settings->update([
                'last_run_at' => now(),
                'last_status' => BackupRun::OK,
            ]);

            $this->prune($disk, $settings->retention_count);

            return [
                'ok'       => true,
                'message'  => "Backup complete — $tableCount tables, " . number_format($rowCount) . ' rows.',
                'run_id'   => $run->id,
                'filename' => $filename,
                'size'     => $size,
            ];
        } catch (Throwable $e) {
            $run->update(['status' => BackupRun::FAILED, 'finished_at' => now(), 'error' => $e->getMessage()]);
            $settings->update(['last_run_at' => now(), 'last_status' => BackupRun::FAILED]);

            return ['ok' => false, 'message' => 'Backup failed: ' . $e->getMessage(), 'run_id' => $run->id];
        } finally {
            $this->rmdir($work);
        }
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

        foreach ($plan['included'] as $group) {
            $moduleEntry = ['module' => $group['module'], 'name' => $group['name'], 'tables' => []];
            foreach ($group['tables'] as $table) {
                $tmp = tempnam(sys_get_temp_dir(), 'tbl');
                [$rows, $sha] = $this->dumpTable($table, $tmp);
                $zip->addFile($tmp, "data/{$group['module']}/{$table}.jsonl");
                // Keep temp files until close() writes them.
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

        return [$tableCount, $rowCount];
    }

    /**
     * Stream one table to a JSONL file. Returns [rowCount, sha256].
     * Uses a lazy cursor so large tables don't load into memory.
     */
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

    // ── Seal the ZIP into .wnkjbak (xchacha20poly1305 secretstream) ───────

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

    // ── Destination + retention ───────────────────────────────────────────

    private function disk(BackupSetting $s): Filesystem
    {
        $cfg = $s->destination_config ?? [];

        return match ($s->destination_driver) {
            'local' => Storage::build([
                'driver' => 'local',
                'root'   => $cfg['path'] ?: storage_path('app/backups'),
            ]),
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

    /** Keep only the newest N .wnkjbak files at the destination. */
    private function prune(Filesystem $disk, int $keep): void
    {
        try {
            $files = collect($disk->files())
                ->filter(fn ($f) => str_ends_with($f, '.wnkjbak'))
                ->sortDesc()   // filenames are timestamped, so name sort = time sort
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
        return 'wnkj-backup-' . now()->format('Ymd-His') . '-' . substr($uuid, 0, 8) . '.wnkjbak';
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
