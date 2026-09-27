<?php

namespace App\Console\Commands;

use App\Models\BackupSetting;
use App\Services\Backup\BackupExporter;
use Carbon\Carbon;
use Illuminate\Console\Command;

/**
 * Runs a scheduled backup when the configured frequency is due.
 *
 * The Laravel scheduler calls this every hour; the command itself decides
 * whether today/now matches the client's frequency + time, so the schedule
 * entry stays simple and the admin controls cadence from the UI.
 *
 * Pass --force to run regardless (used by "Back up now" on the CLI / tests).
 */
class BackupRunCommand extends Command
{
    protected $signature = 'backup:run {--force : Run even if not scheduled/enabled}';

    protected $description = 'Run the data backup if it is due (frequency + time from settings)';

    public function handle(BackupExporter $exporter): int
    {
        $s = BackupSetting::current();

        if (!$this->option('force')) {
            if (!$s->enabled || $s->frequency === 'never') {
                $this->info('Backups disabled or set to never — nothing to do.');
                return self::SUCCESS;
            }
            if (!$this->isDue($s)) {
                $this->info('Not due yet.');
                return self::SUCCESS;
            }
        }

        $this->info('Running backup…');
        $result = $exporter->run('scheduled');
        $this->line($result['message']);

        return $result['ok'] ? self::SUCCESS : self::FAILURE;
    }

    /** Is a scheduled backup due within this hour, and not already done today? */
    private function isDue(BackupSetting $s): bool
    {
        $now = Carbon::now();

        // Time-of-day gate: run in the hour matching the configured time.
        if ($s->run_time) {
            $hour = (int) substr($s->run_time, 0, 2);
            if ($now->hour !== $hour) {
                return false;
            }
        }

        // Day gate for weekly/monthly.
        if ($s->frequency === 'weekly' && $s->run_day !== null && $now->dayOfWeek !== (int) $s->run_day) {
            return false;
        }
        if ($s->frequency === 'monthly' && $s->run_day !== null && $now->day !== (int) $s->run_day) {
            return false;
        }

        // Don't run twice in the same day.
        if ($s->last_run_at && $s->last_run_at->isSameDay($now)) {
            return false;
        }

        return true;
    }
}
