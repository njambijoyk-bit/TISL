<?php

namespace App\Services\Projects;

use App\Models\AttendanceSetting;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Free-time search for a meeting (docs/PROJECTS_STAGE6_SPEC.md, build 6.6): the times in the next two weeks when every staff attendee is free,
 * inside company hours and working days (Attendance settings), skipping days off and leave (attendance days marked leave, off or a holiday; staff
 * whose employee record says on leave; time off on their calendars), and anything already on their calendars at that time.
 */
class ProjectFreeTime
{
    public const DAYS = 14;
    public const STEP = 30;

    /**
     * @param int[] $people user ids
     * @return array{slots: array<int, array{starts_at: string, ends_at: string}>, hours: array{start: string, end: string, days: int[]}, away: array<int, array{name: string, why: string}>}
     */
    public function find(array $people, int $minutes, ?Carbon $from = null, ?int $exceptMeeting = null, int $limit = 24): array
    {
        $minutes = max(15, min(480, $minutes));
        $s = AttendanceSetting::current();
        $days = $s->days();
        $from = ($from ?? now())->copy();
        $to = $from->copy()->startOfDay()->addDays(self::DAYS);
        $people = array_values(array_unique(array_map('intval', $people)));

        $busy = $this->busy($people, $from, $to, $exceptMeeting);
        [$blocked, $away] = $this->away($people, $from, $to);
        $slots = [];
        for ($d = $from->copy()->startOfDay(); $d->lt($to) && count($slots) < $limit; $d->addDay()) {
            if (! in_array($d->dayOfWeek, $days, true) || isset($blocked['*'][$d->toDateString()])) {
                continue;
            }
            if (array_filter($people, fn ($u) => isset($blocked[$u][$d->toDateString()]) || isset($blocked[$u]['*']))) {
                continue;   // someone is away all day
            }
            $open = Carbon::parse($d->toDateString() . ' ' . $s->work_start);
            $close = Carbon::parse($d->toDateString() . ' ' . $s->work_end);
            for ($t = $open->copy(); $t->copy()->addMinutes($minutes)->lte($close) && count($slots) < $limit; $t->addMinutes(self::STEP)) {
                if ($t->lt($from)) {
                    continue;
                }
                $end = $t->copy()->addMinutes($minutes);
                $clash = false;
                foreach ($busy as $b) {
                    if ($b[0]->lt($end) && $b[1]->gt($t)) {
                        $clash = true;
                        break;
                    }
                }
                if (! $clash) {
                    $slots[] = ['starts_at' => $t->format('Y-m-d H:i:s'), 'ends_at' => $end->format('Y-m-d H:i:s')];
                }
            }
        }

        return ['slots' => $slots, 'hours' => ['start' => substr((string) $s->work_start, 0, 5), 'end' => substr((string) $s->work_end, 0, 5), 'days' => $days], 'away' => $away];
    }

    /** Timed entries on any attendee's calendar in the window. @return array<int, array{0: Carbon, 1: Carbon}> */
    private function busy(array $people, Carbon $from, Carbon $to, ?int $exceptMeeting): array
    {
        if (! $people || ! Schema::hasTable('calendar_entries')) {
            return [];
        }

        return DB::table('calendar_entries')->whereIn('user_id', $people)->where('all_day', 0)->where('starts_at', '<', $to)
            ->where(fn ($q) => $q->whereNull('status')->orWhereNotIn('status', ['cancelled', 'declined']))
            ->when($exceptMeeting, fn ($q) => $q->where(fn ($w) => $w->where('source_type', '!=', ProjectMeetings::SOURCE)->orWhere('source_id', '!=', $exceptMeeting)))
            ->get(['starts_at', 'ends_at'])
            ->map(fn ($e) => [Carbon::parse($e->starts_at), $e->ends_at ? Carbon::parse($e->ends_at) : Carbon::parse($e->starts_at)->addHour()])
            ->filter(fn ($b) => $b[1]->gt($from))->values()->all();
    }

    /** Whole days people are away. @return array{0: array<int|string, array<string, true>>, 1: array<int, array{name: string, why: string}>} */
    private function away(array $people, Carbon $from, Carbon $to): array
    {
        $blocked = [];
        $away = [];
        $names = DB::table('users')->whereIn('id', $people ?: [0])->pluck('name', 'id');
        if (Schema::hasTable('attendance_days')) {
            foreach (DB::table('attendance_days')->whereIn('user_id', $people ?: [0])->whereIn('status', ['leave', 'off', 'holiday'])
                ->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->get(['user_id', 'work_date', 'status']) as $a) {
                $blocked[(int) $a->user_id][substr((string) $a->work_date, 0, 10)] = true;
                $away[(int) $a->user_id] ??= ['name' => $names[$a->user_id] ?? 'Someone', 'why' => $a->status === 'leave' ? 'on leave some days' : 'off some days'];
            }
        }
        if (Schema::hasTable('employees') && Schema::hasColumn('employees', 'user_id')) {
            foreach (DB::table('employees')->whereIn('user_id', $people ?: [0])->where('status', 'on_leave')->pluck('user_id') as $u) {
                $blocked[(int) $u]['*'] = true;
                $away[(int) $u] = ['name' => $names[$u] ?? 'Someone', 'why' => 'on leave now'];
            }
        }
        if (Schema::hasTable('calendar_entries')) {
            foreach (DB::table('calendar_entries')->whereIn('user_id', $people ?: [0])->where('kind', 'time_off')->where('all_day', 1)
                ->whereBetween('starts_at', [$from->copy()->startOfDay(), $to])->get(['user_id', 'starts_at']) as $e) {
                $blocked[(int) $e->user_id][substr((string) $e->starts_at, 0, 10)] = true;
                $away[(int) $e->user_id] ??= ['name' => $names[$e->user_id] ?? 'Someone', 'why' => 'has time off some days'];
            }
        }

        return [$blocked, array_values($away)];
    }
}
