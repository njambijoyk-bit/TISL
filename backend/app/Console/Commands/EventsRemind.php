<?php

namespace App\Console\Commands;

use App\Services\Events\Reminders;
use Illuminate\Console\Command;

class EventsRemind extends Command
{
    protected $signature = 'events:remind {--dry-run : Only count who would be reminded}';

    protected $description = 'Remind ticket holders that their event is coming up (only when switched on in the events settings).';

    public function handle(Reminders $reminders): int
    {
        $r = $reminders->run((bool) $this->option('dry-run'));
        if ($r['sent']) {
            $this->info(($this->option('dry-run') ? "{$r['sent']} would be reminded" : "{$r['sent']} reminded") . " for {$r['dates']} date(s).");
        }

        return self::SUCCESS;
    }
}
