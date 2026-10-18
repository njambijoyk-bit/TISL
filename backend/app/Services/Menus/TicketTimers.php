<?php

namespace App\Services\Menus;

use App\Models\Menus\Side;
use App\Models\Menus\Ticket;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

/**
 * The clock on a ticket (Menus, Kitchen): each side can say how long its short task at the pass takes (plating, reheating: Menus, Sides). The longest of them on a ticket is the ticket's own timer: it
 * starts when the cook starts the ticket and counts down on the kitchen screen, next to the station's target for the order as a whole. A ticket whose sides have no task time has no timer of its own.
 */
class TicketTimers
{
    private static ?bool $installed = null;

    /** Has script 214 been run? */
    public static function installed(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasColumn('menus_sides', 'task_minutes');
        }

        return self::$installed ??= Schema::hasColumn('menus_sides', 'task_minutes');
    }

    /**
     * @return ?array{minutes: int, side: string, due_at: ?string, seconds_left: ?int, overdue: bool} null when no side on the ticket has a task time
     */
    public function forTicket(Ticket $t, ?Carbon $now = null): ?array
    {
        if (! self::installed()) {
            return null;
        }
        $now ??= now();
        $ids = $t->lines->flatMap(fn ($l) => array_column((array) ($l->selection ?? []), 'side_id'))->filter()->unique()->all();
        if (! $ids) {
            return null;
        }
        $longest = Side::whereIn('id', $ids)->whereNotNull('task_minutes')->orderByDesc('task_minutes')->first();
        if (! $longest) {
            return null;
        }
        $minutes = (int) $longest->task_minutes;
        $due = $t->started_at && $t->status !== 'ready' ? $t->started_at->copy()->addMinutes($minutes) : null;
        $left = $due ? (int) $now->diffInSeconds($due, false) : null;

        return ['minutes' => $minutes, 'side' => $longest->name, 'due_at' => $due?->toIso8601String(), 'seconds_left' => $left, 'overdue' => $left !== null && $left < 0];
    }
}
