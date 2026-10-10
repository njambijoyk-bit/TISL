<?php

namespace App\Services\Events;

use App\Models\Events\Event;
use App\Models\Events\EventSession;
use App\Models\Events\EventTicket;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * "Tomorrow: your event." Once a date comes within the reminder time (a day by default) every holder of a valid ticket for it is told once. Off until the company switches it on in the events
 * settings; a cancelled date or event, or one already over, is never reminded; a holder of a three-day pass is reminded before each day.
 */
final class Reminders
{
    public function __construct(private TicketHolds $holds, private EventNotices $notices)
    {
    }

    /** @return array{sent: int, dates: int} */
    public function run(bool $dry = false): array
    {
        $cfg = EventSettings::all();
        if (empty($cfg['reminders_on']) || ! Schema::hasTable('event_reminders')) {
            return ['sent' => 0, 'dates' => 0];
        }
        $until = now()->addHours((int) $cfg['reminder_hours']);
        $dates = EventSession::where('is_cancelled', false)->where('starts_at', '>', now())->where('starts_at', '<=', $until)
            ->whereIn('event_id', Event::where('status', Event::PUBLISHED)->select('id'))->orderBy('starts_at')->get();
        $sent = 0;
        foreach ($dates as $session) {
            $event = Event::with('sessions')->find($session->event_id);
            $by = $this->holds->sessionsByType($event->id);
            $tickets = EventTicket::where('event_id', $event->id)->where('state', EventTicket::VALID)->orderBy('id')->get()->filter(fn ($t) => TicketHolds::covers($by, $t->ticket_type_id, $session->id));
            foreach ($tickets->groupBy(fn ($t) => $t->customer_id ? 'c' . $t->customer_id : 'e' . strtolower((string) $t->buyer_email)) as $key => $group) {
                if (DB::table('event_reminders')->where('session_id', $session->id)->where('buyer_key', $key)->exists()) {
                    continue;
                }
                $sent++;
                if ($dry) {
                    continue;
                }
                DB::table('event_reminders')->insert(['session_id' => $session->id, 'buyer_key' => $key, 'sent_at' => now()]);   // remembered first: a failure to send is not retried into a double reminder
                $this->notices->reminder($event, $session, $group);
            }
        }

        return ['sent' => $sent, 'dates' => $dates->count()];
    }
}
