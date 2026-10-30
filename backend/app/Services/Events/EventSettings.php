<?php

namespace App\Services\Events;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Settings → Events: one row. Works with the defaults until script 120 is run. */
final class EventSettings
{
    public const DEFAULTS = [
        'hold_minutes' => 15,              // how long seats are kept for a buyer who has not paid
        'sales_ledger_id' => null,         // where ticket sales are booked when the event names none
        'reminders_on' => false,           // send ticket holders a reminder before each date (off until the company switches it on)
        'reminder_hours' => 24,            // the reminder goes this long before the date starts
        'ticket_note' => '',               // a line printed on every ticket and in the ticket email
        'organiser_payable_ledger_id' => null, // the liability account for ticket money owed to outside organisers
        'commission_percent' => 10,        // what TISL keeps of ticket sales for an outside organiser, unless the organiser has its own rate
        'require_approval' => true,        // an outside organiser's event is checked by TISL before it can be published
    ];

    public static function ready(): bool
    {
        return Schema::hasTable('event_settings');
    }

    /** @return array<string, mixed> */
    public static function all(): array
    {
        $saved = [];
        if (self::ready()) {
            $row = DB::table('event_settings')->where('id', 1)->value('settings');
            $saved = $row ? (json_decode((string) $row, true) ?: []) : [];
        }

        return array_replace(self::DEFAULTS, array_intersect_key($saved, self::DEFAULTS));
    }

    /** @param array<string, mixed> $in @return array<string, mixed> */
    public static function save(array $in, ?int $by): array
    {
        if (! self::ready()) {
            throw new EventException('Events are not set up yet: run database script 120_events.sql first.');
        }
        $cur = self::all();
        if (array_key_exists('hold_minutes', $in)) {
            $m = (int) $in['hold_minutes'];
            if ($m < 5 || $m > 120) {
                throw new EventException('Seats can be held for 5 to 120 minutes.');
            }
            $cur['hold_minutes'] = $m;
        }
        if (array_key_exists('commission_percent', $in)) {
            $c = (float) $in['commission_percent'];
            if ($c < 0 || $c > 100) {
                throw new EventException('A commission is between 0 and 100 percent.');
            }
            $cur['commission_percent'] = $c;
        }
        if (array_key_exists('require_approval', $in)) {
            $cur['require_approval'] = (bool) $in['require_approval'];
        }
        if (array_key_exists('reminders_on', $in)) {
            $cur['reminders_on'] = (bool) $in['reminders_on'];
        }
        if (array_key_exists('reminder_hours', $in)) {
            $h = (int) $in['reminder_hours'];
            if ($h < 1 || $h > 168) {
                throw new EventException('The reminder goes 1 to 168 hours before.');
            }
            $cur['reminder_hours'] = $h;
        }
        if (array_key_exists('sales_ledger_id', $in)) {
            $cur['sales_ledger_id'] = $in['sales_ledger_id'] ? (int) $in['sales_ledger_id'] : null;
        }
        if (array_key_exists('organiser_payable_ledger_id', $in)) {
            $cur['organiser_payable_ledger_id'] = $in['organiser_payable_ledger_id'] ? (int) $in['organiser_payable_ledger_id'] : null;
        }
        if (array_key_exists('ticket_note', $in)) {
            $cur['ticket_note'] = mb_substr(trim((string) $in['ticket_note']), 0, 300);
        }
        $exists = DB::table('event_settings')->where('id', 1)->exists();
        $row = ['settings' => json_encode($cur), 'updated_by' => $by, 'updated_at' => now()];
        $exists ? DB::table('event_settings')->where('id', 1)->update($row) : DB::table('event_settings')->insert(['id' => 1, 'created_at' => now()] + $row);

        return $cur;
    }
}
