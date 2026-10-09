<?php

namespace App\Console\Commands;

use App\Models\NotificationDelivery;
use App\Models\NotificationSettingLog;
use Illuminate\Console\Command;

/**
 * The delivery log keeps what was sent for 12 months; after that the message text and link are blanked and the status, time and type stay (docs/NOTIFICATIONS_PLAN.md).
 * Runs daily. The action log (who changed what) is never pruned.
 */
class NotificationsPrune extends Command
{
    protected $signature = 'notifications:prune {--months=12 : How long message text is kept}';

    protected $description = 'Blank the text of old delivery-log rows (12 months by default); the status and time stay';

    public function handle(): int
    {
        $months = max(1, (int) $this->option('months'));
        $n = NotificationDelivery::where('created_at', '<', now()->subMonths($months))->where(fn ($q) => $q->whereNotNull('body')->orWhereNotNull('subject')->orWhereNotNull('wa_url'))
            ->update(['body' => null, 'subject' => null, 'wa_url' => null]);
        if ($n > 0) {
            NotificationSettingLog::write('log_pruned', null, null, null, "Message text blanked on {$n} delivery-log row" . ($n === 1 ? '' : 's') . " older than {$months} months.", ['rows' => $n]);
        }
        $this->info("{$n} row(s) blanked.");

        return self::SUCCESS;
    }
}
