<?php

namespace App\Services\Calendar;

use App\Models\BookableResource;
use App\Models\CalendarEntry;
use App\Models\ResourceHour;
use App\Models\ResourceTimeOff;
use Carbon\Carbon;

/**
 * When can a resource be booked: inside its weekly working hours, not in time off, and with fewer bookings at that time than its capacity
 * (each booking taking its buffer before and after). A resource with no working hours set is not bookable at all — the screen says so.
 */
class AvailabilityService
{
    /** Is the whole of [start, end) inside one stretch of the resource's working week? */
    public function withinHours(BookableResource $r, Carbon $start, Carbon $end): bool
    {
        if ($start->toDateString() !== $end->toDateString()) {
            return false;   // a booking does not run past midnight
        }
        $day = ResourceHour::where('resource_id', $r->id)->where('weekday', $start->dayOfWeek)->get();
        $s = $start->format('H:i:s');
        $e = $end->format('H:i:s');

        return $day->contains(fn ($h) => $h->starts_at <= $s && $h->ends_at >= $e);
    }

    public function inTimeOff(BookableResource $r, Carbon $start, Carbon $end): bool
    {
        return ResourceTimeOff::where('resource_id', $r->id)->where('starts_at', '<', $end)->where('ends_at', '>', $start)->exists();
    }

    /** How many bookings already occupy the resource at any moment of [start, end) (buffers included). */
    public function busyCount(BookableResource $r, Carbon $start, Carbon $end, ?int $exceptSourceId = null): int
    {
        $from = $start->copy()->subMinutes($r->buffer_after_min);
        $to = $end->copy()->addMinutes($r->buffer_before_min);

        return CalendarEntry::where('resource_id', $r->id)->where('source_type', 'booking')->where('starts_at', '<', $to)->where('ends_at', '>', $from)
            ->when($exceptSourceId, fn ($q) => $q->where('source_id', '!=', $exceptSourceId))
            ->whereNotIn('status', ['cancelled', 'no_show'])->count();
    }

    /** Why [start, end) cannot be booked, or null when it can. */
    public function problem(BookableResource $r, Carbon $start, Carbon $end, ?int $exceptSourceId = null): ?string
    {
        if (! $r->is_active) {
            return "{$r->name} is not taking bookings.";
        }
        if (! $this->withinHours($r, $start, $end)) {
            return "{$r->name} does not work then.";
        }
        if ($this->inTimeOff($r, $start, $end)) {
            return "{$r->name} is not available then (time off).";
        }
        if ($this->busyCount($r, $start, $end, $exceptSourceId) >= max(1, $r->capacity)) {
            return "{$r->name} is already booked then.";
        }

        return null;
    }

    /** The start times on a day that a booking of this length can begin, every $step minutes. @return array<int,string> HH:MM */
    public function freeSlots(BookableResource $r, Carbon $date, int $durationMin, int $step = 15): array
    {
        $out = [];
        $day = $date->copy()->startOfDay();
        foreach (ResourceHour::where('resource_id', $r->id)->where('weekday', $day->dayOfWeek)->orderBy('starts_at')->get() as $h) {
            $t = $day->copy()->setTimeFromTimeString($h->starts_at);
            $close = $day->copy()->setTimeFromTimeString($h->ends_at);
            for (; $t->copy()->addMinutes($durationMin)->lte($close); $t->addMinutes($step)) {
                $end = $t->copy()->addMinutes($durationMin);
                if ($t->gt(now()) && $this->problem($r, $t->copy(), $end) === null) {
                    $out[] = $t->format('H:i');
                }
            }
        }

        return $out;
    }
}
