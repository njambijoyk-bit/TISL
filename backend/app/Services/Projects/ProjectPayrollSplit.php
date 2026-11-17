<?php

namespace App\Services\Projects;

use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Splitting pay by timesheets (docs/PROJECTS_STAGE5_SPEC.md, build 5.9), for Payroll. Off until the work setting "split pay by timesheets" is on.
 *
 * When on, a payroll run asks for each person's split over its month. Their approved time on each piece of work (on the phase's own cost centre
 * when the entry's phase has one, else the work's) is divided by the minutes Attendance says they worked that month (owner's choice 2); that
 * share of their pay goes to those cost centres, and the rest follows their usual shares. Time beyond what they worked is scaled to 100%.
 * With the setting off, no approved time, or nothing in Attendance for the month, the usual split stands unchanged.
 */
class ProjectPayrollSplit
{
    public static function on(): bool
    {
        return ProjectsSetup::work() && (bool) app(ProjectSettings::class)->get('work')['payroll_split'];
    }

    /**
     * @param array<int, array{0: int, 1: float, 2: ?int}> $usual [[cost_centre_id, percent, location_id], ...] totalling 100
     * @return array<int, array{0: int, 1: float, 2: ?int}>|null the split to use, or null for the usual one
     */
    public function adjust(int $userId, string $from, string $to, array $usual): ?array
    {
        if (! self::on() || ! Schema::hasTable('attendance_days')) {
            return null;
        }
        $worked = (int) DB::table('attendance_days')->where('user_id', $userId)->whereBetween('work_date', [$from, $to])->sum('minutes_worked');
        if ($worked <= 0) {
            return null;
        }
        $time = DB::table('project_time as t')->join('projects as p', 'p.id', '=', 't.project_id')->leftJoin('project_phases as ph', 'ph.id', '=', 't.phase_id')
            ->where('t.user_id', $userId)->where('t.state', 'approved')->whereNull('t.deleted_at')->whereBetween('t.work_date', [$from, $to])
            ->selectRaw('COALESCE(ph.cost_centre_id, p.cost_centre_id) as cc, SUM(t.minutes) as m')->groupBy(DB::raw('COALESCE(ph.cost_centre_id, p.cost_centre_id)'))->get()
            ->filter(fn ($r) => $r->cc && $r->m > 0);
        if ($time->isEmpty()) {
            return null;
        }
        $logged = (int) $time->sum('m');
        $scale = $logged > $worked ? $worked / $logged : 1.0;   // more time than worked: the projects take it all, in proportion
        $loc = fn ($cc) => Schema::hasTable('cost_centres') ? DB::table('cost_centres')->where('id', $cc)->value('location_id') : null;
        $out = [];
        foreach ($time as $r) {
            $out[(int) $r->cc] = [(int) $r->cc, round($r->m * $scale / $worked * 100, 4), $loc((int) $r->cc) ? (int) $loc((int) $r->cc) : null];
        }
        $taken = array_sum(array_map(fn ($x) => $x[1], $out));
        $rest = max(0.0, 100 - $taken);
        if ($rest > 0.0001) {
            if (! $usual) {
                return null;   // nowhere to put the rest: leave the run as it is
            }
            foreach ($usual as [$cc, $pct, $l]) {
                $add = $rest * (float) $pct / 100;
                $out[(int) $cc] = isset($out[(int) $cc]) ? [(int) $cc, $out[(int) $cc][1] + $add, $out[(int) $cc][2]] : [(int) $cc, $add, $l];
            }
        }
        // percentages to two places that still add up to 100: the last one takes the rounding
        $out = array_values($out);
        $sum = 0.0;
        foreach ($out as $i => $x) {
            $out[$i][1] = $i === count($out) - 1 ? round(100 - $sum, 4) : round($x[1], 4);
            $sum += $out[$i][1];
        }

        return $out;
    }

    /** What the Configuration page and the Money tab can say about a person's month. @return array<string, mixed> */
    public function preview(int $userId, string $month): array
    {
        $from = Carbon::parse("{$month}-01")->startOfMonth()->toDateString();
        $to = Carbon::parse($from)->endOfMonth()->toDateString();

        return ['from' => $from, 'to' => $to, 'split' => $this->adjust($userId, $from, $to, [])];
    }
}
