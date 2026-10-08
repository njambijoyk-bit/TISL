<?php

namespace App\Services\Insight\Packs;

use App\Models\AttendanceDay;
use App\Models\User;
use App\Services\Insight\InsightPack;
use App\Services\Insight\Lookback;
use Carbon\Carbon;

/** Attendance: this month against last, as shares of working days. Totals and weekday patterns only; no names, so it can never single anyone out. */
class AttendancePack implements InsightPack
{
    public function key(): string { return 'attendance.trend'; }

    public function title(): string { return 'Is attendance dropping?'; }

    public function module(): ?string { return null; }

    public function permission(): string { return 'books.view'; }   // attendance feeds payroll

    public function contexts(): array { return ['attendance']; }

    public function applies(array $context): bool { return true; }

    public function answer(array $context, Lookback $lb, User $user, int $example = 0): array
    {
        $this_ = Carbon::today()->startOfMonth(); $last = $this_->copy()->subMonth();
        $stat = function (Carbon $from, Carbon $to) {
            $rows = AttendanceDay::whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->whereNotIn('status', ['off', 'holiday', 'leave'])->get(['status', 'work_date', 'overtime_minutes', 'minutes_worked']);
            $n = $rows->count();
            $worked = $rows->whereIn('status', AttendanceDay::WORKED)->count();

            return ['n' => $n, 'worked' => $worked, 'absent' => $rows->where('status', 'absent')->count(), 'late' => $rows->where('status', 'late')->count(), 'early' => $rows->where('status', 'left_early')->count(),
                'overtime' => (int) $rows->sum('overtime_minutes'), 'rows' => $rows];
        };
        $a = $stat($this_, Carbon::today()); $p = $stat($last, $last->copy()->endOfMonth());
        if ($a['n'] === 0 && $p['n'] === 0) {
            return ['title' => 'Attendance', 'blocks' => [['type' => 'note', 'text' => 'No attendance has been marked this month or last.']], 'basis' => 'Read from attendance.'];
        }
        $pct = fn ($x, $n) => $n ? $x / $n * 100 : null;
        $f = fn ($v) => $v === null ? '—' : number_format($v, 1) . '%';
        $rows = [
            ['Attended', $f($pct($a['worked'], $a['n'])), $f($pct($p['worked'], $p['n']))],
            ['Absent', $f($pct($a['absent'], $a['n'])), $f($pct($p['absent'], $p['n']))],
            ['Late', $f($pct($a['late'], $a['n'])), $f($pct($p['late'], $p['n']))],
            ['Left early', $f($pct($a['early'], $a['n'])), $f($pct($p['early'], $p['n']))],
            ['Overtime', number_format($a['overtime'] / 60, 1) . ' h', number_format($p['overtime'] / 60, 1) . ' h'],
        ];
        $blocks = [['type' => 'table', 'title' => $this_->format('F Y') . ' so far against ' . $last->format('F Y'), 'columns' => ['', 'This month', 'Last month'], 'rows' => $rows]];
        $dow = collect($a['rows'])->groupBy(fn ($r) => Carbon::parse($r->work_date)->format('l'))->map(fn ($g) => $g->count() ? $g->where('status', 'absent')->count() / $g->count() * 100 : 0)->sortDesc();
        if ($dow->isNotEmpty() && $dow->first() > 0) {
            $blocks[] = ['type' => 'facts', 'title' => 'Pattern', 'rows' => [['Most absences fall on', $dow->keys()->first(), number_format($dow->first(), 1) . '% of that day\'s marked people were absent']]];
        }
        $da = $pct($a['worked'], $a['n']); $dp = $pct($p['worked'], $p['n']);
        $blocks[] = ['type' => 'verdict', 'tone' => ($da !== null && $dp !== null && $da < $dp - 2) ? 'warn' : 'good', 'text' => ($da !== null && $dp !== null)
            ? 'Attendance is ' . number_format($da, 1) . '% against ' . number_format($dp, 1) . '% last month: ' . (abs($da - $dp) < 1 ? 'about the same.' : ($da < $dp ? 'down ' . number_format($dp - $da, 1) . ' points.' : 'up ' . number_format($da - $dp, 1) . ' points.')) . ' The month is only part-way, so a day or two marked late can move this.'
            : 'There is not yet enough marked in both months to compare.'];

        return ['title' => 'Attendance', 'blocks' => $blocks, 'basis' => 'Read from marked attendance (days off, holidays and leave are not counted). Totals only: no names.'];
    }
}
