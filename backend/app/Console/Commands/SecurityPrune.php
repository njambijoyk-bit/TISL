<?php

namespace App\Console\Commands;

use App\Models\Security\SecurityEvent;
use App\Services\Security\SecurityLog;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;

/** The security log keeps routine lines (sign-ins) for a short while and serious ones (alerts) for years: config/security.php → log.keep_days. Runs daily. */
class SecurityPrune extends Command
{
    protected $signature = 'security:prune';

    protected $description = 'Delete old security-log lines (routine ones first, alerts last)';

    public function handle(): int
    {
        if (! Schema::hasTable('security_events')) {
            $this->info('The security log is not set up yet.');

            return self::SUCCESS;
        }
        $total = 0;
        foreach ([SecurityLog::INFO, SecurityLog::NOTICE, SecurityLog::WARNING, SecurityLog::ALERT] as $severity) {
            $days = (int) config("security.log.keep_days.{$severity}", 365);
            if ($days > 0) {
                $total += SecurityEvent::where('severity', $severity)->where('created_at', '<', now()->subDays($days))->delete();
            }
        }
        $this->info("{$total} line(s) deleted.");

        return self::SUCCESS;
    }
}
