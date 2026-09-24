<?php

namespace App\Services\Vault;

use App\Models\User;
use App\Models\VaultFolder;
use App\Models\VaultDocument;
use App\Models\VaultDocumentVersion;
use App\Models\VaultArchiverConfig;
use App\Models\VaultArchiveRun;
use App\Models\VaultArchivedItem;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class VaultArchiverService
{
    public function __construct(protected VaultPolicyService $policy) {}

    // =========================================================================
    // MAIN ENTRY — run a single config (manual or scheduler)
    // =========================================================================

    /**
     * @param bool $purge  When false, exports to vault but does NOT delete source rows.
     *                     When true (default), deletes rows after successful export.
     */
    public function run(VaultArchiverConfig $config, ?User $triggeredBy = null, bool $purge = true): VaultArchiveRun
    {
        if (!$config->is_enabled) {
            abort(422, "Archiver config '{$config->label}' is disabled.");
        }

        $run = VaultArchiveRun::create([
            'config_id'            => $config->id,
            'table_name'           => $config->table_name,
            'status'               => 'running',
            'triggered_by'         => $triggeredBy ? 'manual' : 'scheduler',
            'triggered_by_user_id' => $triggeredBy?->id,
            'started_at'           => now(),
            'created_at'           => now(),
        ]);

        try {
            $result = match($config->archiver_type) {
                'log_table'          => $this->runLogTableArchive($config, $run, $purge),
                'document_generator' => $this->runGeneratorArchive($config, $run, $triggeredBy),
                default              => throw new \InvalidArgumentException("Unknown archiver type: {$config->archiver_type}"),
            };

            $run->update([
                'status'             => 'completed',
                'rows_exported'      => $result['rows']             ?? 0,
                'file_size_bytes'    => $result['size']             ?? 0,
                'file_path'          => $result['file_path']        ?? null,
                'vault_document_id'  => $result['vault_document_id'] ?? null,
                'date_range_start'   => $result['date_range_start']  ?? null,
                'date_range_end'     => $result['date_range_end']    ?? null,
                'completed_at'       => now(),
            ]);

            $config->update([
                'last_archived_at'   => now(),
                'last_rows_archived' => $result['rows'] ?? 0,
                'last_size_bytes'    => $result['size'] ?? 0,
            ]);

            if ($triggeredBy) {
                $this->policy->log($triggeredBy, 'archive_run', 'archiver', $config->id, [
                    'run_id' => $run->id,
                    'status' => 'completed',
                    'rows'   => $result['rows'] ?? 0,
                    'purge'  => $purge,
                ]);
            }

        } catch (\Throwable $e) {
            $run->update([
                'status'        => 'failed',
                'error_message' => $e->getMessage(),
                'completed_at'  => now(),
            ]);

            throw $e;
        }

        return $run->fresh(['config', 'document']);
    }

    // =========================================================================
    // RUN MULTIPLE — for bulk manual triggers from the UI
    // =========================================================================

    /**
     * Run a specific set of configs by ID.
     * Returns array of per-config results.
     */
    public function runMultiple(array $configIds, ?User $triggeredBy = null, bool $purge = true): array
    {
        $configs = VaultArchiverConfig::whereIn('id', $configIds)
            ->where('is_enabled', true)
            ->get();

        $results = [];

        foreach ($configs as $config) {
            try {
                $run = $this->run($config, $triggeredBy, $purge);
                $results[] = [
                    'config_id' => $config->id,
                    'config'    => $config->label,
                    'status'    => 'completed',
                    'rows'      => $run->rows_exported,
                    'size'      => $run->file_size_bytes,
                    'run_id'    => $run->id,
                ];
            } catch (\Throwable $e) {
                $results[] = [
                    'config_id' => $config->id,
                    'config'    => $config->label,
                    'status'    => 'failed',
                    'error'     => $e->getMessage(),
                ];
            }
        }

        return $results;
    }

    // =========================================================================
    // RUN ALL ENABLED CONFIGS — for scheduler
    // =========================================================================

    public function runAll(): array
    {
        $configs = VaultArchiverConfig::where('is_enabled', true)
            ->where('archiver_type', 'log_table')
            ->get();

        $results = [];

        foreach ($configs as $config) {
            try {
                $run = $this->run($config, null, true); // scheduler always purges
                $results[] = [
                    'config' => $config->label,
                    'status' => 'completed',
                    'rows'   => $run->rows_exported,
                    'size'   => $run->file_size_bytes,
                ];
            } catch (\Throwable $e) {
                $results[] = [
                    'config' => $config->label,
                    'status' => 'failed',
                    'error'  => $e->getMessage(),
                ];
            }
        }

        return $results;
    }

    // =========================================================================
    // FLOW 1 — LOG TABLE ARCHIVE
    // =========================================================================

    private function runLogTableArchive(VaultArchiverConfig $config, VaultArchiveRun $run, bool $purge = true): array
    {
        $table         = $config->table_name;
        $retentionDays = $config->retention_days;
        $cutoffDate    = now()->subDays($retentionDays);
        $dateColumn    = $this->resolveDateColumn($table);

        $range = DB::table($table)
            ->where($dateColumn, '<', $cutoffDate)
            ->selectRaw("MIN({$dateColumn}) as date_start, MAX({$dateColumn}) as date_end, COUNT(*) as total")
            ->first();

        if (!$range || $range->total === 0) {
            return [
                'rows'             => 0,
                'size'             => 0,
                'date_range_start' => null,
                'date_range_end'   => null,
            ];
        }

        $exportPath = $this->exportTable(
            table:      $table,
            dateColumn: $dateColumn,
            before:     $cutoffDate,
            format:     $config->export_format,
            label:      $config->label,
        );

        $fileSize = Storage::size($exportPath);

        $vaultDocument = $this->storeAsVaultDocument(
            filePath:  $exportPath,
            fileSize:  $fileSize,
            config:    $config,
            label:     $config->label,
            dateStart: $range->date_start,
            dateEnd:   $range->date_end,
            rowCount:  $range->total,
        );

        VaultArchivedItem::create([
            'vault_document_id'   => $vaultDocument->id,
            'source_type'         => 'log_table',
            'source_reference'    => null,
            'source_table'        => $table,
            'archived_by_user_id' => null,
            'archived_at'         => now(),
            'original_location'   => "table:{$table}",
            'is_cold'             => true,
            'compressed_path'     => null,
            'notes'               => ($purge ? 'Auto-archived' : 'Archived (no purge)') . " {$range->total} rows older than {$retentionDays} days",
            'created_at'          => now(),
        ]);

        // Only purge source rows if $purge = true
        if ($purge) {
            DB::table($table)
                ->where($dateColumn, '<', $cutoffDate)
                ->delete();
        }

        return [
            'rows'              => $range->total,
            'size'              => $fileSize,
            'file_path'         => $exportPath,
            'vault_document_id' => $vaultDocument->id,
            'date_range_start'  => $range->date_start,
            'date_range_end'    => $range->date_end,
        ];
    }

    // =========================================================================
    // FLOW 2 — GENERATED DOCUMENT ARCHIVE
    // =========================================================================

    private function runGeneratorArchive(VaultArchiverConfig $config, VaultArchiveRun $run, ?User $user): array
    {
        if (!$config->generator_class) {
            throw new \RuntimeException("No generator_class set for config: {$config->label}");
        }

        if (!class_exists($config->generator_class)) {
            throw new \RuntimeException("Generator class not found: {$config->generator_class}");
        }

        $generator = app($config->generator_class);
        $result    = $generator->generate($user);

        $vaultDocument = $this->storeAsVaultDocument(
            filePath:  $result['file_path'],
            fileSize:  $result['file_size'],
            config:    $config,
            label:     $config->label,
            dateStart: null,
            dateEnd:   null,
            rowCount:  0,
            metadata:  $result['metadata'] ?? [],
        );

        VaultArchivedItem::create([
            'vault_document_id'   => $vaultDocument->id,
            'source_type'         => 'generated_document',
            'source_reference'    => $result['source_reference'] ?? null,
            'source_table'        => $result['source_table']     ?? null,
            'archived_by_user_id' => $user?->id,
            'archived_at'         => now(),
            'original_location'   => null,
            'is_cold'             => false,
            'compressed_path'     => null,
            'notes'               => $result['notes'] ?? null,
            'created_at'          => now(),
        ]);

        return [
            'rows'              => 0,
            'size'              => $result['file_size'],
            'file_path'         => $result['file_path'],
            'vault_document_id' => $vaultDocument->id,
        ];
    }

    // =========================================================================
    // EXPORT ENGINE
    // =========================================================================

    private function exportTable(
        string $table,
        string $dateColumn,
        \Carbon\Carbon $before,
        string $format,
        string $label,
    ): string {
        $directory = 'vault/system-logs/' . Str::slug($table) . '/' . now()->format('Y/m');
        $filename  = Str::slug($label) . '-' . now()->format('Ymd-His') . '.' . $this->formatExtension($format);
        $fullPath  = $directory . '/' . $filename;

        Storage::makeDirectory($directory);

        $absolutePath = Storage::path($fullPath);

        match($format) {
            'csv'   => $this->exportAsCsv($table, $dateColumn, $before, $absolutePath),
            'json'  => $this->exportAsJson($table, $dateColumn, $before, $absolutePath),
            'excel' => $this->exportAsExcel($table, $dateColumn, $before, $absolutePath),
        };

        return $fullPath;
    }

    private function exportAsCsv(string $table, string $dateColumn, \Carbon\Carbon $before, string $path): void
    {
        $handle  = fopen($path, 'w');
        $headers = false;
        $chunk   = 500;
        $offset  = 0;

        do {
            $rows = DB::table($table)
                ->where($dateColumn, '<', $before)
                ->orderBy($dateColumn)
                ->limit($chunk)
                ->offset($offset)
                ->get();

            if ($rows->isEmpty()) break;

            if (!$headers) {
                fputcsv($handle, array_keys((array) $rows->first()));
                $headers = true;
            }

            foreach ($rows as $row) {
                fputcsv($handle, array_values((array) $row));
            }

            $offset += $chunk;

        } while ($rows->count() === $chunk);

        fclose($handle);
    }

    private function exportAsJson(string $table, string $dateColumn, \Carbon\Carbon $before, string $path): void
    {
        $handle = fopen($path, 'w');
        fwrite($handle, '[');

        $chunk  = 500;
        $offset = 0;
        $first  = true;

        do {
            $rows = DB::table($table)
                ->where($dateColumn, '<', $before)
                ->orderBy($dateColumn)
                ->limit($chunk)
                ->offset($offset)
                ->get();

            if ($rows->isEmpty()) break;

            foreach ($rows as $row) {
                if (!$first) fwrite($handle, ',');
                fwrite($handle, json_encode($row));
                $first = false;
            }

            $offset += $chunk;

        } while ($rows->count() === $chunk);

        fwrite($handle, ']');
        fclose($handle);
    }

    private function exportAsExcel(string $table, string $dateColumn, \Carbon\Carbon $before, string $path): void
    {
        $spreadsheet = new \PhpOffice\PhpSpreadsheet\Spreadsheet();
        $sheet       = $spreadsheet->getActiveSheet();

        $chunk   = 500;
        $offset  = 0;
        $row     = 1;
        $headers = false;

        do {
            $rows = DB::table($table)
                ->where($dateColumn, '<', $before)
                ->orderBy($dateColumn)
                ->limit($chunk)
                ->offset($offset)
                ->get();

            if ($rows->isEmpty()) break;

            if (!$headers) {
                $col = 1;
                foreach (array_keys((array) $rows->first()) as $header) {
                    $sheet->setCellValueByColumnAndRow($col++, $row, $header);
                }
                $row++;
                $headers = true;
            }

            foreach ($rows as $record) {
                $col = 1;
                foreach ((array) $record as $value) {
                    $sheet->setCellValueByColumnAndRow($col++, $row, $value);
                }
                $row++;
            }

            $offset += $chunk;

        } while ($rows->count() === $chunk);

        $writer = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($spreadsheet);
        $writer->save($path);
    }

    // =========================================================================
    // STORE AS VAULT DOCUMENT
    // =========================================================================

    private function storeAsVaultDocument(
        string  $filePath,
        int     $fileSize,
        VaultArchiverConfig $config,
        string  $label,
        ?string $dateStart,
        ?string $dateEnd,
        int     $rowCount,
        array   $metadata = [],
    ): VaultDocument {

        $folder    = $this->resolveDestinationFolder($config);
        $extension = $this->formatExtension($config->export_format);
        $name      = $label . ' — ' . now()->format('d M Y H:i');

        $document = VaultDocument::create([
            'folder_id'         => $folder?->id,
            'name'              => $name,
            'original_filename' => Str::slug($label) . '-' . now()->format('Ymd') . '.' . $extension,
            'mime_type'         => $this->formatMime($config->export_format),
            'extension'         => $extension,
            'file_path'         => $filePath,
            'file_size'         => $fileSize,
            'document_type'     => 'system_log_archive',
            'sensitivity_level' => 'confidential',
            'is_cold'           => true,
            'is_locked'         => false,
            'version_count'     => 1,
            'uploaded_by'       => 1,
            'metadata'          => array_merge([
                'table'           => $config->table_name,
                'rows_exported'   => $rowCount,
                'date_start'      => $dateStart,
                'date_end'        => $dateEnd,
                'archiver_config' => $config->id,
            ], $metadata),
        ]);

        VaultDocumentVersion::create([
            'document_id'    => $document->id,
            'file_path'      => $filePath,
            'file_size'      => $fileSize,
            'version_number' => 1,
            'change_note'    => 'Auto-archived by system',
            'uploaded_by'    => 1,
            'created_at'     => now(),
        ]);

        return $document;
    }

    // =========================================================================
    // SEEDER
    // =========================================================================

    public static function seedDefaultConfigs(): void
    {
        $defaults = [
            // table_name                        label                              retention  format
            ['driver_location_pings',            'Driver Location Pings',           30,        'csv' ],
            ['delivery_activity_logs',           'Delivery Activity Logs',          90,        'json'],
            ['order_activity_logs',              'Order Activity Logs',             90,        'json'],
            ['booking_activity_logs',            'Booking Activity Logs',           90,        'json'],
            ['hamper_activity_logs',             'Hamper Activity Logs',            90,        'json'],
            ['referral_activity_logs',           'Referral Activity Logs',          90,        'json'],
            ['auction_order_activity_logs',      'Auction Order Activity Logs',     90,        'json'],
            ['mimi_query_logs',                  'Mimi Query Logs',                 60,        'csv' ],
            ['mimi_sessions',                    'Mimi Sessions',                   60,        'csv' ],
            ['search_events',                    'Search Events',                   30,        'csv' ],
            ['ai_analytics_sessions',            'AI Analytics Sessions',           90,        'json'],
            ['ai_analytics_outputs',             'AI Analytics Outputs',            90,        'json'],
            ['shipping_activities',              'Shipping Activities',             90,        'json'],
            ['inventory_lifecycle_movements',    'Inventory Lifecycle Movements',   90,        'json'],
            ['inventory_location_movements',     'Inventory Location Movements',    90,        'json'],
            ['bug_report_status_history',        'Bug Report Status History',       180,       'json'],
            ['application_status_history',       'Application Status History',      180,       'json'],
            ['policy_change_logs',               'Policy Change Logs',              365,       'json'],
            ['reconciliation_lines',             'Reconciliation Lines',            365,       'json'],

            // ── Additional tables ─────────────────────────────────────────────────────
            ['dev_access_key_logs',              'Dev Access Key Logs',             30,        'json'],
            ['project_activities',               'Project Activities',              90,        'json'],
            ['customer_tier_activities',         'Customer Tier Activities',        90,        'json'],
            ['inventory_export_logs',            'Inventory Export Logs',           90,        'json'],
            ['leave_logs',                       'Employee Leave Logs',             365,       'json'],
            ['loyalty_point_transactions',       'Loyalty Point Transactions',      365,       'json'],
            ['vault_access_logs',                'Vault Access Logs',               90,        'json'],
            ['notifications',                    'Notifications',                   30,        'json'],
            ['sessions',                         'User Sessions',                   30,        'csv' ],
            ['cache',                            'Cache Entries',                   7,         'csv' ],
            ['failed_jobs',                      'Failed Jobs',                     30,        'json'],
            ['inventory_repairs',                'Inventory Repairs Log',           180,       'json'],
            ['inventory_disputes',               'Inventory Disputes Log',          180,       'json'],
            ['delivery_activity_logs',           'Delivery Activity Logs',          90,        'json'],
            ['referral_code_usage',              'Referral Code Usage',             180,       'json'],
            ['policy_acceptances',               'Policy Acceptances',              365,       'json'],
            ['customer_algorithm_scores',        'Customer Algorithm Scores',       90,        'csv' ],
            ['store_credit_transactions',        'Store Credit Transactions',       365,       'json'],
            ['customer_credit_transactions',     'Customer Credit Transactions',    365,       'json'],
            ['product_reviews',                  'Product Reviews',                 365,       'json'],
            ['review_helpful_votes',             'Review Helpful Votes',            180,       'json'],
        ];

        foreach ($defaults as [$table, $label, $retention, $format]) {
            VaultArchiverConfig::firstOrCreate(
                ['table_name' => $table, 'archiver_type' => 'log_table'],
                [
                    'label'                    => $label,
                    'retention_days'           => $retention,
                    'export_format'            => $format,
                    'destination_folder_id'    => null,
                    'is_enabled'               => true,
                    'auto_archive_on_generate' => false,
                ]
            );
        }
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    private function resolveDestinationFolder(VaultArchiverConfig $config): ?VaultFolder
    {
        if ($config->destination_folder_id) {
            return VaultFolder::find($config->destination_folder_id);
        }

        $root = VaultFolder::firstOrCreate(
            ['slug' => 'system-logs', 'parent_id' => null],
            [
                'name'              => 'System Logs',
                'slug'              => 'system-logs',
                'folder_type'       => 'system_logs',
                'sensitivity_level' => 'confidential',
                'is_locked'         => false,
                'owner_user_id'     => 1,
            ]
        );

        $label = Str::slug($config->label ?? $config->table_name);

        $tableFolder = VaultFolder::firstOrCreate(
            ['slug' => $label, 'parent_id' => $root->id],
            [
                'name'              => $config->label ?? $config->table_name,
                'slug'              => $label,
                'folder_type'       => 'system_logs',
                'sensitivity_level' => 'confidential',
                'is_locked'         => false,
                'owner_user_id'     => 1,
                'parent_id'         => $root->id,
            ]
        );

        $monthSlug = now()->format('Y-m');

        return VaultFolder::firstOrCreate(
            ['slug' => $monthSlug, 'parent_id' => $tableFolder->id],
            [
                'name'              => now()->format('F Y'),
                'slug'              => $monthSlug,
                'folder_type'       => 'system_logs',
                'sensitivity_level' => 'confidential',
                'is_locked'         => false,
                'owner_user_id'     => 1,
                'parent_id'         => $tableFolder->id,
            ]
        );
    }

    private function resolveDateColumn(string $table): string
    {
        $map = [
            'driver_location_pings' => 'pinged_at',
            'policy_change_logs'    => 'changed_at',
            'search_events'         => 'occurred_at',
            'mimi_sessions'         => 'started_at',
            'mimi_query_logs'       => 'queried_at',
        ];

        return $map[$table] ?? 'created_at';
    }

    private function formatExtension(string $format): string
    {
        return match($format) {
            'excel' => 'xlsx',
            default => $format,
        };
    }

    private function formatMime(string $format): string
    {
        return match($format) {
            'csv'   => 'text/csv',
            'json'  => 'application/json',
            'excel' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            default => 'application/octet-stream',
        };
    }
}