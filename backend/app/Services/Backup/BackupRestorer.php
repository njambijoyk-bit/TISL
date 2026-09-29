<?php

namespace App\Services\Backup;

use App\Models\BackupSetting;
use App\Models\Installation;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;
use ZipArchive;

/**
 * Restores data from a .wnkjba backup.
 *
 * Always requires the backup's passphrase: a wrong one cannot derive the key,
 * the authenticated decryption fails, and the restore aborts before touching
 * the database. Every per-table SHA-256 in the manifest is verified too, so a
 * damaged file is rejected. The whole apply runs in one transaction, so a
 * failure rolls everything back.
 *
 * Licensing/system tables are never restored (the backup doesn't contain them,
 * and they're skipped defensively).
 */
class BackupRestorer
{
    private const MAGIC = 'WNKJBAK1';
    private const BATCH = 500;

    public function __construct(private BackupPlanner $planner) {}

    /** Restore from an uploaded .wnkjba file path. */
    public function restoreFromFile(string $sealedPath, string $passphrase, string $mode): array
    {
        $work = storage_path('app/backup-tmp/restore-' . Str::uuid());
        @mkdir($work, 0700, true);
        $zipPath = "$work/payload.zip";
        try {
            $this->open($sealedPath, $passphrase, $zipPath);
            return $this->apply($zipPath, $mode);
        } finally {
            $this->rmdir($work);
        }
    }

    /** Pull a named backup from the configured remote destination, then restore. */
    public function restoreFromDestination(string $filename, string $passphrase, string $mode): array
    {
        $settings = BackupSetting::current();
        if ($settings->destination_driver === 'local') {
            throw new RuntimeException('The Local destination keeps no server copy — upload the .wnkjba file instead.');
        }
        $disk = $this->disk($settings);
        if (!$disk->exists($filename)) {
            throw new RuntimeException('That backup was not found at the destination.');
        }

        $work = storage_path('app/backup-tmp/restore-' . Str::uuid());
        @mkdir($work, 0700, true);
        $sealed = "$work/download.wnkjba";
        try {
            file_put_contents($sealed, $disk->get($filename));
            return $this->restoreFromFile($sealed, $passphrase, $mode);
        } finally {
            $this->rmdir($work);
        }
    }

    /** Available backups at the remote destination (for the "pull" picker). */
    public function destinationFiles(): array
    {
        $settings = BackupSetting::current();
        if ($settings->destination_driver === 'local') {
            return [];
        }
        try {
            $disk = $this->disk($settings);
            return collect($disk->files())
                ->filter(fn ($f) => str_ends_with($f, '.wnkjba'))
                ->sortDesc()
                ->values()
                ->map(fn ($f) => ['filename' => $f, 'size' => $this->safeSize($disk, $f)])
                ->all();
        } catch (Throwable $e) {
            return [];
        }
    }

    // ── Decrypt ────────────────────────────────────────────────────────────

    private function open(string $sealedPath, string $passphrase, string $outZip): void
    {
        $in = fopen($sealedPath, 'rb');
        if (!$in) {
            throw new RuntimeException('Could not read the backup file.');
        }
        if (fread($in, 8) !== self::MAGIC) {
            fclose($in);
            throw new RuntimeException('That is not a WNKJ backup file.');
        }
        $hl = unpack('N', fread($in, 4))[1] ?? 0;
        $header = json_decode((string) fread($in, $hl), true);
        if (!is_array($header) || empty($header['salt']) || empty($header['ss_header'])) {
            fclose($in);
            throw new RuntimeException('The backup header is corrupt.');
        }

        $key = sodium_crypto_pwhash(
            SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES,
            $passphrase,
            base64_decode($header['salt']),
            $header['opslimit'] ?? SODIUM_CRYPTO_PWHASH_OPSLIMIT_MODERATE,
            $header['memlimit'] ?? SODIUM_CRYPTO_PWHASH_MEMLIMIT_MODERATE,
            SODIUM_CRYPTO_PWHASH_ALG_ARGON2ID13
        );

        $state = sodium_crypto_secretstream_xchacha20poly1305_init_pull(base64_decode($header['ss_header']), $key);
        $out = fopen($outZip, 'wb');

        while (!feof($in)) {
            $lenBytes = fread($in, 4);
            if ($lenBytes === '' || strlen($lenBytes) < 4) {
                break;
            }
            $len = unpack('N', $lenBytes)[1];
            $cipher = fread($in, $len);
            $res = sodium_crypto_secretstream_xchacha20poly1305_pull($state, $cipher);
            if ($res === false) {
                fclose($in);
                fclose($out);
                sodium_memzero($key);
                throw new RuntimeException('That passphrase does not match this backup (or the file is damaged).');
            }
            [$plain, $tag] = $res;
            fwrite($out, $plain);
            if ($tag === SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_FINAL) {
                break;
            }
        }
        fclose($in);
        fclose($out);
        sodium_memzero($key);
    }

    // ── Apply ────────────────────────────────────────────────────────────

    private function apply(string $zipPath, string $mode): array
    {
        $zip = new ZipArchive();
        if ($zip->open($zipPath) !== true) {
            throw new RuntimeException('The backup archive could not be opened.');
        }

        $manifest = json_decode((string) $zip->getFromName('manifest.json'), true);
        if (!is_array($manifest) || ($manifest['format'] ?? null) !== 'wnkj-backup') {
            throw new RuntimeException('The backup manifest is missing or invalid.');
        }

        // Guard against restoring another installation's data.
        $install = Installation::current();
        if ($install && !empty($manifest['client_uuid']) && $manifest['client_uuid'] !== $install->client_uuid) {
            throw new RuntimeException('This backup belongs to a different installation (' . ($manifest['business'] ?? 'unknown') . ').');
        }

        [$tableToModule, $excluded] = $this->planner->resolveMap();
        $report = [];

        DB::transaction(function () use ($zip, $manifest, $mode, $excluded, &$report) {
            DB::statement('SET FOREIGN_KEY_CHECKS=0');
            try {
                foreach ($manifest['modules'] ?? [] as $group) {
                    foreach ($group['tables'] ?? [] as $t) {
                        $table = $t['table'];
                        $entryName = "data/{$group['module']}/{$table}.jsonl";

                        if (in_array($table, $excluded, true)) {
                            $report[] = ['table' => $table, 'action' => 'skipped', 'reason' => 'excluded', 'rows' => 0];
                            continue;
                        }
                        if (!Schema::hasTable($table)) {
                            $report[] = ['table' => $table, 'action' => 'skipped', 'reason' => 'no such table here', 'rows' => 0];
                            continue;
                        }

                        $result = $this->restoreTable($zip, $entryName, $table, $t['sha256'] ?? null, $mode);
                        $report[] = ['table' => $table] + $result;
                    }
                }
            } finally {
                DB::statement('SET FOREIGN_KEY_CHECKS=1');
            }
        });

        $zip->close();

        $total = array_sum(array_map(fn ($r) => $r['rows'] ?? 0, $report));
        return [
            'ok'      => true,
            'message' => 'Restore complete — ' . number_format($total) . ' rows across ' . count($report) . ' tables.',
            'mode'    => $mode,
            'report'  => $report,
        ];
    }

    /** Stream one table from the archive into the DB, verifying its checksum. */
    private function restoreTable(ZipArchive $zip, string $entryName, string $table, ?string $expectSha, string $mode): array
    {
        $stream = $zip->getStream($entryName);
        if (!$stream) {
            // No data file for this table (e.g. it had zero rows and was still listed) — nothing to do.
            if ($mode === 'replace') {
                DB::table($table)->delete();
            }
            return ['action' => $mode, 'reason' => 'empty', 'rows' => 0];
        }

        // Columns we may actually write: real columns minus generated/computed ones,
        // and only those that still exist in this schema (drift-safe).
        $generated = $this->generatedColumns($table);
        $insertable = array_values(array_diff(Schema::getColumnListing($table), $generated));

        $pk = $mode === 'merge' ? array_values(array_intersect($this->primaryKey($table), $insertable)) : [];
        if ($mode === 'merge' && empty($pk)) {
            fclose($stream);
            return ['action' => 'skipped', 'reason' => 'no primary key (merge not possible)', 'rows' => 0];
        }

        if ($mode === 'replace') {
            DB::table($table)->delete();
        }

        $hash = hash_init('sha256');
        $batch = [];
        $rows = 0;

        while (($line = fgets($stream)) !== false) {
            hash_update($hash, $line);
            $trim = trim($line);
            if ($trim === '') {
                continue;
            }
            $decoded = json_decode($trim, true);
            if (!is_array($decoded)) {
                continue;
            }
            // Drop generated columns and anything not in this table's schema.
            $decoded = array_intersect_key($decoded, array_flip($insertable));
            if ($decoded === []) {
                continue;
            }
            $batch[] = $decoded;
            $rows++;
            if (count($batch) >= self::BATCH) {
                $this->writeBatch($table, $batch, $mode, $pk);
                $batch = [];
            }
        }
        if ($batch) {
            $this->writeBatch($table, $batch, $mode, $pk);
        }
        fclose($stream);

        $sha = hash_final($hash);
        if ($expectSha && !hash_equals($expectSha, $sha)) {
            throw new RuntimeException("Integrity check failed for '$table' — the backup is damaged.");
        }

        return ['action' => $mode, 'rows' => $rows];
    }

    private function writeBatch(string $table, array $rows, string $mode, array $pk): void
    {
        if ($mode === 'merge') {
            $update = array_values(array_diff(array_keys($rows[0]), $pk));
            DB::table($table)->upsert($rows, $pk, $update ?: array_keys($rows[0]));
        } else {
            DB::table($table)->insert($rows);
        }
    }

    /**
     * Virtual/stored generated columns — MySQL forbids writing values to these.
     * NOT "DEFAULT_GENERATED": that is what MySQL 8 reports for ordinary columns with
     * DEFAULT CURRENT_TIMESTAMP, which hold real data and must be restored (skipping
     * them stamped every row with "now" and broke unique keys such as
     * customer_algorithm_scores.idx_customer_latest).
     */
    private function generatedColumns(string $table): array
    {
        try {
            $rows = DB::select(
                "SELECT column_name AS name FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = ?
                   AND extra REGEXP '(VIRTUAL|STORED) GENERATED'",
                [$table]
            );
            return array_map(fn ($r) => $r->name, $rows);
        } catch (Throwable $e) {
            return [];
        }
    }

    private function primaryKey(string $table): array
    {
        try {
            $keys = DB::select("SHOW KEYS FROM `$table` WHERE Key_name = 'PRIMARY'");
            return array_map(fn ($k) => $k->Column_name, $keys);
        } catch (Throwable $e) {
            return [];
        }
    }

    // ── Destination (shared with exporter's shape) ─────────────────────────

    private function disk(BackupSetting $s): Filesystem
    {
        $cfg = $s->destination_config ?? [];

        return match ($s->destination_driver) {
            'ftp' => Storage::build(array_filter([
                'driver' => 'ftp', 'host' => $cfg['host'] ?? null, 'username' => $cfg['username'] ?? null,
                'password' => $cfg['password'] ?? null, 'port' => isset($cfg['port']) ? (int) $cfg['port'] : 21,
                'root' => $cfg['path'] ?? '',
            ], fn ($v) => $v !== null)),
            'sftp' => Storage::build(array_filter([
                'driver' => 'sftp', 'host' => $cfg['host'] ?? null, 'username' => $cfg['username'] ?? null,
                'password' => $cfg['password'] ?? null, 'port' => isset($cfg['port']) ? (int) $cfg['port'] : 22,
                'root' => $cfg['path'] ?? '',
            ], fn ($v) => $v !== null)),
            's3' => Storage::build([
                'driver' => 's3', 'key' => $cfg['access_key'] ?? null, 'secret' => $cfg['secret'] ?? null,
                'region' => $cfg['region'] ?? 'us-east-1', 'bucket' => $cfg['bucket'] ?? null,
                'endpoint' => $cfg['endpoint'] ?? null, 'root' => $cfg['path'] ?? '',
                'use_path_style_endpoint' => true,
            ]),
            default => throw new RuntimeException('Restore-from-destination needs a remote destination (FTP, SFTP or S3).'),
        };
    }

    private function safeSize(Filesystem $disk, string $file): ?int
    {
        try {
            return $disk->size($file);
        } catch (Throwable $e) {
            return null;
        }
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
