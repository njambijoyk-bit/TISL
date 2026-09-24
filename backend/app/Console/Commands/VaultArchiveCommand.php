<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\VaultArchiverConfig;
use App\Services\Vault\VaultArchiverService;

class VaultArchiveCommand extends Command
{
    protected $signature = 'vault:archive
                            {--config= : Run a specific config ID only}
                            {--seed    : Seed default log table configs and exit}
                            {--dry-run : Show what would be archived without doing anything}';

    protected $description = 'Archive log tables and generated documents into the Vault';

    public function __construct(protected VaultArchiverService $archiver)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        // ── Seed mode ─────────────────────────────────────────────────────
        if ($this->option('seed')) {
            $this->info('Seeding default archiver configs...');
            VaultArchiverService::seedDefaultConfigs();
            $this->info('Done.');
            return self::SUCCESS;
        }

        // ── Dry run ───────────────────────────────────────────────────────
        if ($this->option('dry-run')) {
            $this->dryRun();
            return self::SUCCESS;
        }

        // ── Single config ─────────────────────────────────────────────────
        if ($configId = $this->option('config')) {
            $config = VaultArchiverConfig::find($configId);

            if (!$config) {
                $this->error("Config #{$configId} not found.");
                return self::FAILURE;
            }

            $this->runSingle($config);
            return self::SUCCESS;
        }

        // ── Run all enabled ───────────────────────────────────────────────
        $this->info('Running all enabled vault archiver configs...');
        $this->newLine();

        $results = $this->archiver->runAll();

        $this->table(
            ['Config', 'Status', 'Rows', 'Size', 'Error'],
            array_map(fn($r) => [
                $r['config'],
                $r['status'],
                $r['rows']  ?? '—',
                isset($r['size']) ? $this->formatBytes($r['size']) : '—',
                $r['error'] ?? '—',
            ], $results)
        );

        $failed    = count(array_filter($results, fn($r) => $r['status'] === 'failed'));
        $completed = count(array_filter($results, fn($r) => $r['status'] === 'completed'));

        $this->newLine();
        $this->info("✓ {$completed} completed  ✗ {$failed} failed");

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    private function runSingle(VaultArchiverConfig $config): void
    {
        $this->info("Running: {$config->label}");

        try {
            $run = $this->archiver->run($config);
            $this->info("  ✓ {$run->rows_exported} rows — " . $this->formatBytes($run->file_size_bytes));
        } catch (\Throwable $e) {
            $this->error("  ✗ Failed: " . $e->getMessage());
        }
    }

    private function dryRun(): void
    {
        $this->warn('DRY RUN — nothing will be archived or deleted.');
        $this->newLine();

        $configs = VaultArchiverConfig::where('is_enabled', true)
            ->where('archiver_type', 'log_table')
            ->get();

        if ($configs->isEmpty()) {
            $this->warn('No enabled log_table configs found. Run with --seed first.');
            return;
        }

        $rows = [];

        foreach ($configs as $config) {
            $dateColumn = $this->resolveDateColumn($config->table_name);
            $cutoff     = now()->subDays($config->retention_days);

            try {
                $count = \Illuminate\Support\Facades\DB::table($config->table_name)
                    ->where($dateColumn, '<', $cutoff)
                    ->count();
            } catch (\Throwable) {
                $count = 'table error';
            }

            $rows[] = [
                $config->label,
                $config->table_name,
                $config->retention_days . 'd',
                $config->export_format,
                $count,
                $cutoff->format('Y-m-d'),
            ];
        }

        $this->table(
            ['Label', 'Table', 'Retention', 'Format', 'Rows to Archive', 'Cutoff Date'],
            $rows
        );
    }

    private function resolveDateColumn(string $table): string
    {
        return match($table) {
            'driver_location_pings' => 'pinged_at',
            default                 => 'created_at',
        };
    }

    private function formatBytes(int $bytes): string
    {
        if ($bytes >= 1073741824) return number_format($bytes / 1073741824, 2) . ' GB';
        if ($bytes >= 1048576)    return number_format($bytes / 1048576, 2)    . ' MB';
        if ($bytes >= 1024)       return number_format($bytes / 1024, 2)       . ' KB';
        return $bytes . ' B';
    }
}