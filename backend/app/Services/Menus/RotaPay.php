<?php

namespace App\Services\Menus;

use App\Models\AttendanceDay;
use App\Models\AttendanceSetting;
use App\Models\Employee;
use App\Models\Menus\Chef;
use App\Models\Menus\Shift;
use App\Models\PayrollSetting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

/**
 * Pay and overtime from the rota. For each day a chef was rostered, the hours of the shifts are what they were expected to work; what they signed in for (Attendance) is what they worked.
 * Overtime is the time worked beyond the rostered hours (or all of it on a day nothing was rostered), once it is more than the grace minutes; short time is the rostered hours not worked on a day
 * that is over. Payroll can take a chef's overtime from here instead of from the company's working day (Menus settings: *rota*); either way it only counts days Attendance has verified.
 * Only reading and working out: nothing here changes attendance, the rota or payroll by itself.
 */
class RotaPay
{
    /** Does payroll take this person's overtime from the rota? Only when the setting says so and the person is a chef with a rota. */
    public function appliesTo(int $userId): bool
    {
        return MenusSettings::all()['rota_overtime_source'] === 'rota' && RotaService::installed() && Chef::where('user_id', $userId)->exists();
    }

    private function tz(): string
    {
        return (string) config('app.timezone', 'Africa/Nairobi');
    }

    /** Minutes rostered for a chef on a day (published shifts only: a draft is not a promise). */
    public function scheduledMinutes(int $chefId, string $date): int
    {
        return (int) Shift::where('chef_id', $chefId)->where('status', 'published')->where('shift_date', $date)->get()->sum(fn (Shift $s) => round($s->hours() * 60));
    }

    /** @return array{scheduled: int, worked: int, overtime: int, short: int} minutes for one day, given the attendance record (if any) */
    public function day(int $chefId, string $date, ?AttendanceDay $row, ?Carbon $now = null): array
    {
        $now ??= Carbon::now($this->tz());
        $sched = $this->scheduledMinutes($chefId, $date);
        $worked = $row && $row->sign_in_at && $row->sign_out_at ? (int) $row->minutes_worked : 0;
        $grace = (int) MenusSettings::all()['rota_overtime_grace'];
        $over = $worked - $sched;
        $overtime = $over > $grace ? $over : 0;
        $over_ = Carbon::parse($date, $this->tz())->endOfDay()->lt($now);   // the day is over: the hours not worked are short time
        $short = $over_ && $sched > $worked ? $sched - $worked : 0;

        return ['scheduled' => $sched, 'worked' => $worked, 'overtime' => $overtime, 'short' => $short];
    }

    /** Overtime minutes the rota gives for one verified attendance day (used by payroll). */
    public function dayOvertime(int $userId, string $date, ?AttendanceDay $row): int
    {
        $chef = Chef::where('user_id', $userId)->value('id');

        return $chef ? $this->day((int) $chef, $date, $row)['overtime'] : 0;
    }

    /**
     * What a chef paid per shift or per hour earns over a stretch (verified days only): null for a chef on salary (and for anyone who is not a chef).
     * Per shift: each rostered shift counts as worked when at least the set share (50% by default) of that day's rostered time was signed in, and pays the shift rate; unrostered work earns nothing.
     * Per hour: the hours worked up to the hours rostered each day (overtime beyond them is paid separately by payroll at the same rate and multiplier).
     *
     * @return array{mode: string, basic: float, shifts: int, hours: float, hourly: float}|null hourly: what an hour is worth for overtime and premiums (a shift rate over the average shift length)
     */
    public function contractPay(\App\Models\User $u, Carbon $from, Carbon $to, bool $verifiedOnly = true): ?array
    {
        if (! Schema::hasColumn('menus_chefs', 'pay_mode') || ! Schema::hasTable('attendance_days')) {
            return null;
        }
        $chef = Chef::where('user_id', $u->id)->first();
        $mode = $chef->pay_mode ?? 'salary';
        if (! $chef || $mode === 'salary') {
            return null;
        }
        $share = (int) MenusSettings::all()['rota_shift_min_share'];
        $rows = AttendanceDay::where('user_id', $u->id)->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->whereNotNull('sign_in_at')->whereNotNull('sign_out_at')
            ->when($verifiedOnly, fn ($q) => $q->where('verify_status', 'verified'))->get();
        $shifts = 0;
        $schedMin = 0;
        $paidMin = 0;
        foreach ($rows as $r) {
            $date = $r->work_date->toDateString();
            $count = Shift::where('chef_id', $chef->id)->where('status', 'published')->where('shift_date', $date)->count();
            $sched = $this->scheduledMinutes($chef->id, $date);
            if ($count === 0 || $sched <= 0) {
                continue;
            }
            $worked = (int) $r->minutes_worked;
            if ($worked * 100 >= $sched * $share) {
                $shifts += $count;
                $schedMin += $sched;
            }
            $paidMin += min($worked, $sched);
        }
        $shiftRate = (float) ($chef->shift_rate ?? 0);
        $hourRate = (float) ($chef->hour_rate ?? 0);
        if ($mode === 'per_shift') {
            $avgHours = $shifts > 0 ? $schedMin / 60 / $shifts : 8.0;

            return ['mode' => $mode, 'basic' => round($shifts * $shiftRate, 2), 'shifts' => $shifts, 'hours' => round($schedMin / 60, 2), 'hourly' => $avgHours > 0 ? round($shiftRate / $avgHours, 4) : 0.0];
        }

        return ['mode' => $mode, 'basic' => round($paidMin / 60 * $hourRate, 2), 'shifts' => $shifts, 'hours' => round($paidMin / 60, 2), 'hourly' => $hourRate];
    }

    /** What an hour is worth for this person: the monthly salary over the company's working days and hours, as payroll works it out. */
    public function hourlyRate(Employee $e, Carbon $from, Carbon $to): float
    {
        $att = AttendanceSetting::current();
        $days = $att->days();
        $work = 0;
        for ($d = $from->copy()->startOfMonth(); $d->lte($from->copy()->endOfMonth()); $d->addDay()) {
            $work += in_array($d->dayOfWeek, $days, true) ? 1 : 0;
        }
        $hours = max(1.0, round(Carbon::parse($att->work_start)->diffInMinutes(Carbon::parse($att->work_end)) / 60, 2));

        return $work > 0 ? ((float) $e->base_salary / $work) / $hours : 0.0;
    }

    /**
     * Hours for a stretch of days, one row per chef who was rostered or signed in. Pay figures (the hourly rate, the overtime worth) are only filled when $money is true.
     *
     * @param callable|null $scope narrows the shifts to the branches the person may see
     * @return array<int, array<string, mixed>>
     */
    public function report(Carbon $from, Carbon $to, bool $money = false, ?callable $scope = null, ?int $onlyChef = null): array
    {
        $from = $from->copy()->startOfDay();
        $to = $to->copy()->startOfDay();
        $q = Shift::where('status', 'published')->whereBetween('shift_date', [$from->toDateString(), $to->toDateString()])->when($onlyChef, fn ($x) => $x->where('chef_id', $onlyChef));
        if ($scope) {
            $scope($q);
        }
        $shifts = $q->get()->groupBy('chef_id');
        $chefs = Chef::when($onlyChef, fn ($x) => $x->whereKey($onlyChef))->orderBy('display_name')->get();
        $att = Schema::hasTable('attendance_days')
            ? AttendanceDay::whereIn('user_id', $chefs->pluck('user_id')->filter()->values())->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->get()->groupBy('user_id')
            : collect();
        $mult = (float) PayrollSetting::current()->overtime_multiplier;
        $now = Carbon::now($this->tz());
        $out = [];
        foreach ($chefs as $c) {
            $mine = $shifts->get($c->id, collect());
            if ($scope && $mine->isEmpty()) {
                continue;   // someone not rostered in the branches this person may see: their attendance is not theirs to read here
            }
            $rows = ($att->get($c->user_id) ?? collect())->keyBy(fn ($r) => $r->work_date->toDateString());
            $days = $mine->pluck('shift_date')->map(fn ($d) => $d->toDateString())->merge($rows->keys())->unique()->sort()->values();
            if ($days->isEmpty()) {
                continue;
            }
            $sched = $worked = $over = $short = $unverified = $noShows = $late = 0;
            $detail = [];
            foreach ($days as $date) {
                $r = $rows->get($date);
                $x = $this->day($c->id, $date, $r, $now);
                $sched += $x['scheduled'];
                $worked += $x['worked'];
                $over += $x['overtime'];
                $short += $x['short'];
                if ($x['scheduled'] > 0 && (! $r || $r->verify_status !== 'verified') && Carbon::parse($date, $this->tz())->endOfDay()->lt($now)) {
                    $unverified++;
                }
                if ($x['scheduled'] > 0 && ! ($r && $r->sign_in_at) && Carbon::parse($date, $this->tz())->endOfDay()->lt($now)) {
                    $noShows++;
                }
                if ($r && $r->status === 'late') {
                    $late++;
                }
                $detail[] = ['date' => $date, 'scheduled_h' => round($x['scheduled'] / 60, 2), 'worked_h' => round($x['worked'] / 60, 2), 'overtime_h' => round($x['overtime'] / 60, 2), 'short_h' => round($x['short'] / 60, 2),
                    'in' => $r?->sign_in_at?->copy()->timezone($this->tz())->format('H:i'), 'out' => $r?->sign_out_at?->copy()->timezone($this->tz())->format('H:i'), 'verified' => $r && $r->verify_status === 'verified'];
            }
            $row = ['chef_id' => $c->id, 'name' => $c->display_name, 'scheduled_h' => round($sched / 60, 2), 'worked_h' => round($worked / 60, 2), 'overtime_h' => round($over / 60, 2), 'short_h' => round($short / 60, 2),
                'unverified_days' => $unverified, 'no_shows' => $noShows, 'late_days' => $late, 'days' => $detail];
            $row['overtime_pending_h'] = 0.0;
            if (RotaOvertime::installed()) {
                $row['overtime_pending_h'] = round(\App\Models\Menus\OvertimeEntry::where('chef_id', $c->id)->where('status', 'pending')->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->sum('minutes') / 60, 2);
            }
            if ($money) {
                $e = $c->user_id ? Employee::where('user_id', $c->user_id)->first() : null;
                $rate = $e ? $this->hourlyRate($e, $from, $to) : null;
                $prem = $c->user_id && $rate !== null ? app(RotaPremium::class)->pay((int) $c->user_id, $from, $to, $rate, false) : ['hours' => 0.0, 'amount' => 0.0, 'lines' => []];
                $contract = $c->user_id ? $this->contractPay((new \App\Models\User())->forceFill(['id' => $c->user_id]), $from, $to, false) : null;
                if ($contract) {   // paid per shift or per hour: what the shifts and hours come to replaces the salary
                    $rate = $contract['hourly'];
                    $row += ['pay_mode' => $contract['mode'], 'contract_basic' => $contract['basic'], 'contract_shifts' => $contract['shifts']];
                }
                $row += ['hourly_rate' => $rate !== null ? round($rate, 2) : null, 'overtime_multiplier' => $mult, 'overtime_pay' => $rate !== null ? round($over / 60 * $rate * $mult, 2) : null,
                    'premium_hours' => $prem['hours'], 'premium_pay' => $prem['amount'], 'premium_lines' => $prem['lines']];
            }
            $out[] = $row;
        }

        return $out;
    }

    /** The report as a spreadsheet file (one line per chef). */
    public function csv(array $rows, bool $money): string
    {
        $h = ['Chef', 'Rostered hours', 'Worked hours', 'Overtime hours', 'Overtime waiting for approval (hours)', 'Short hours', 'Days not verified', 'Did not come', 'Late days'] + ($money ? [9 => 'Hourly rate', 10 => 'Overtime pay', 11 => 'Premium hours', 12 => 'Premium pay'] : []);
        $f = fopen('php://temp', 'w+');
        fputcsv($f, $h);
        foreach ($rows as $r) {
            fputcsv($f, [$this->safe($r['name']), $r['scheduled_h'], $r['worked_h'], $r['overtime_h'], $r['overtime_pending_h'] ?? 0, $r['short_h'], $r['unverified_days'], $r['no_shows'], $r['late_days']] + ($money ? [9 => $r['hourly_rate'], 10 => $r['overtime_pay'], 11 => $r['premium_hours'] ?? 0, 12 => $r['premium_pay'] ?? 0] : []));
        }
        rewind($f);

        return (string) stream_get_contents($f);
    }

    /** A name that starts like a formula must not run as one when the file is opened in a spreadsheet. */
    private function safe(string $v): string
    {
        return preg_match('/^[=+\-@\t\r]/', $v) ? "'".$v : $v;
    }
}
