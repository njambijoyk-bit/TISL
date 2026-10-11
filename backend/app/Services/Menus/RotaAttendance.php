<?php

namespace App\Services\Menus;

use App\Models\AttendanceDay;
use App\Models\AttendanceSetting;
use App\Models\Menus\Chef;
use App\Models\Menus\Shift;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

/**
 * The rota checked against attendance sign-ins. For a published shift that has started, was the chef there? "late" is a sign-in after the grace period of the Attendance settings, "not_in" is
 * a shift running with nobody signed in, "no_show" is a shift that ended without a sign-in, and a sign-out well before the end is "left_early". The attendance record is one per person per
 * day, so lateness is judged on the first shift of the day only. Reading only: it never changes attendance.
 */
class RotaAttendance
{
    public const LABELS = ['on_time' => 'Signed in', 'late' => 'Late', 'not_in' => 'Not signed in', 'no_show' => 'Did not come', 'away' => 'Away', 'left_early' => 'Left early'];

    public static function ready(): bool
    {
        return Schema::hasTable('attendance_days') && Schema::hasTable('attendance_settings');
    }

    public function grace(): int
    {
        return self::ready() ? (int) AttendanceSetting::current()->grace_minutes : 15;
    }

    /**
     * @param Collection<int, Shift> $shifts published shifts
     * @return array<int, array{state: string, label: string, in: ?string, out: ?string, late_minutes: ?int, worked_minutes: int}> by shift id (shifts that have not started, or are inside the grace period, have none)
     */
    public function states(Collection $shifts, ?Carbon $now = null): array
    {
        if (! self::ready() || $shifts->isEmpty()) {
            return [];
        }
        $tz = (string) config('app.timezone', 'Africa/Nairobi');
        $now = ($now ?? now())->copy()->timezone($tz);
        $grace = $this->grace();
        $users = Chef::whereIn('id', $shifts->pluck('chef_id')->unique())->pluck('user_id', 'id');
        $days = AttendanceDay::whereIn('user_id', $users->filter()->values())->whereIn('work_date', $shifts->map(fn (Shift $s) => $s->shift_date->toDateString())->unique()->values())->get()
            ->keyBy(fn ($d) => $d->user_id.'|'.$d->work_date->toDateString());
        $firsts = $shifts->where('status', 'published')->sortBy(fn (Shift $s) => $s->starts_at)->groupBy(fn (Shift $s) => $s->chef_id.'|'.$s->shift_date->toDateString())->map(fn ($g) => $g->first()->id);

        $out = [];
        foreach ($shifts->where('status', 'published') as $s) {
            [$start, $end] = $s->span();
            if ($now->lt($start)) {
                continue;
            }
            $row = $days->get(($users[$s->chef_id] ?? 0).'|'.$s->shift_date->toDateString());
            $first = (int) ($firsts[$s->chef_id.'|'.$s->shift_date->toDateString()] ?? 0) === (int) $s->id;
            $in = $row?->sign_in_at?->copy()->timezone($tz);
            $outAt = $row?->sign_out_at?->copy()->timezone($tz);
            $state = null;
            $late = null;
            if (! $in) {
                if ($row && in_array($row->status, ['leave', 'off', 'holiday'], true)) {
                    $state = 'away';
                } elseif ($now->gt($end)) {
                    $state = 'no_show';
                } elseif ($now->gt($start->copy()->addMinutes($grace))) {
                    $state = 'not_in';
                }
            } else {
                $state = 'on_time';
                if ($first && $in->gt($start->copy()->addMinutes($grace))) {
                    $state = 'late';
                    $late = (int) round($start->diffInMinutes($in));
                }
                if ($outAt && $now->gt($end) && $outAt->lt($end->copy()->subMinutes($grace))) {
                    $state = 'left_early';
                }
            }
            if ($state) {
                $out[$s->id] = ['state' => $state, 'label' => self::LABELS[$state], 'in' => $in?->format('H:i'), 'out' => $outAt?->format('H:i'), 'late_minutes' => $late, 'worked_minutes' => (int) ($row?->minutes_worked ?? 0)];
            }
        }

        return $out;
    }

    /** Hours attended in a stretch of days, by chef id (from attendance). @return array<int, float> */
    public function attendedHours(Collection $chefs, Carbon $from, Carbon $to): array
    {
        if (! self::ready()) {
            return [];
        }
        $byUser = AttendanceDay::whereIn('user_id', $chefs->pluck('user_id')->filter()->values())->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->get()->groupBy('user_id');
        $out = [];
        foreach ($chefs as $c) {
            $out[$c->id] = round(($byUser[$c->user_id] ?? collect())->sum('minutes_worked') / 60, 1);
        }

        return $out;
    }

    /**
     * Tell the managers, once per shift, about a rostered chef who has not signed in (a shift running, or one that has ended). Returns how many shifts were reported.
     * Run by the scheduler every few minutes. Nothing happens until script 146 has been run or when the alerts are switched off.
     */
    public function watch(?Carbon $now = null): int
    {
        if (! self::ready() || ! RotaService::installed() || ! Schema::hasColumn('menus_shifts', 'watch_notified_at') || ! MenusSettings::all()['rota_no_show_alerts']) {
            return 0;
        }
        $tz = (string) config('app.timezone', 'Africa/Nairobi');
        $now = ($now ?? now())->copy()->timezone($tz);
        $today = Shift::where('status', 'published')->whereBetween('shift_date', [$now->copy()->subDay()->toDateString(), $now->toDateString()])->get();
        $states = $this->states($today, $now);
        $n = 0;
        foreach ($today->whereNull('watch_notified_at') as $s) {
            if (! in_array($states[$s->id]['state'] ?? '', ['not_in', 'no_show'], true) || ! ($chef = Chef::find($s->chef_id))) {
                continue;
            }
            $s->update(['watch_notified_at' => now()]);
            app(RotaNotices::class)->notIn($s, $chef, $states[$s->id]['state']);
            $n++;
        }

        return $n;
    }
}
