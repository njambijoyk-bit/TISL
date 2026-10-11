<?php

namespace App\Services\Menus;

use App\Models\AttendanceSetting;
use App\Models\Employee;
use App\Models\LeaveLog;
use App\Models\Menus\Chef;
use App\Models\Menus\DayOff;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

/**
 * Leave balances for chefs. A chef who has an employee record has a leave balance (HR keeps it, with its log): approved *leave* takes days off it, cancelling approved leave gives them back,
 * and every change is written to the same leave log HR uses. Sick days, days off and other time away do not touch the balance. Days are counted on the company's working days
 * (Attendance settings), so a weekend a chef is not expected at costs nothing. A chef with no employee record has no balance to keep and is never refused.
 */
class RotaLeave
{
    /** Is the balance kept (script 146 adds where the charge is remembered, so it can be given back)? */
    public static function active(): bool
    {
        return Schema::hasTable('employees') && Schema::hasColumn('employees', 'leave_balance') && Schema::hasColumn('menus_days_off', 'charged_days');
    }

    public function employeeFor(Chef $chef): ?Employee
    {
        return self::active() && $chef->user_id ? Employee::where('user_id', $chef->user_id)->first() : null;
    }

    /** The days left, or null when no balance is kept for this chef. */
    public function balance(Chef $chef): ?float
    {
        $e = $this->employeeFor($chef);

        return $e ? round((float) $e->leave_balance, 1) : null;
    }

    /** How many days a stretch costs: the days that are working days for the company. */
    public function chargeable(Carbon $from, Carbon $to): float
    {
        $work = Schema::hasTable('attendance_settings') ? AttendanceSetting::current()->days() : [0, 1, 2, 3, 4, 5, 6];
        $n = 0;
        for ($d = $from->copy()->startOfDay(); $d->lte($to); $d->addDay()) {
            if (in_array($d->dayOfWeek, $work, true)) {   // Carbon: 0 = Sunday, the same as the attendance settings
                $n++;
            }
        }

        return (float) $n;
    }

    /** Refuse leave that costs more than the balance. */
    public function assertEnough(Chef $chef, Carbon $from, Carbon $to): void
    {
        $bal = $this->balance($chef);
        if ($bal === null) {
            return;
        }
        $need = $this->chargeable($from, $to);
        if ($need > $bal + 0.0001) {
            throw new BooksException("{$chef->display_name} has {$bal} leave day(s) left and this needs {$need}.");
        }
    }

    /** Take the days off the balance when leave is approved (remembered on the time off so they can be given back). */
    public function charge(DayOff $off, Chef $chef, ?User $by = null): void
    {
        if ($off->kind !== 'leave' || ! ($e = $this->employeeFor($chef))) {
            return;
        }
        $days = $this->chargeable($off->from_date->copy(), $off->to_date->copy());
        if ($days <= 0) {
            $off->update(['charged_days' => 0]);

            return;
        }
        $before = (float) $e->leave_balance;
        if (! $e->useLeaveDays($days)) {
            throw new BooksException("{$chef->display_name} has only {$before} leave day(s) left and this needs {$days}.");
        }
        $off->update(['charged_days' => $days]);
        $this->log($e, 'use', $days, "Time off {$off->from_date->format('j M')} to {$off->to_date->format('j M')} (Menus rota)", $before, $by);
    }

    /** Give the days back when approved leave is cancelled. */
    public function refund(DayOff $off, Chef $chef, ?User $by = null): void
    {
        $days = (float) ($off->charged_days ?? 0);
        if ($days <= 0 || ! ($e = $this->employeeFor($chef))) {
            return;
        }
        $before = (float) $e->leave_balance;
        $e->addLeaveDays($days);
        $off->update(['charged_days' => 0]);
        $this->log($e, 'add', $days, "Leave {$off->from_date->format('j M')} to {$off->to_date->format('j M')} cancelled (Menus rota)", $before, $by);
    }

    private function log(Employee $e, string $action, float $days, string $reason, float $before, ?User $by): void
    {
        LeaveLog::create(['employee_id' => $e->id, 'action' => $action, 'days' => $days, 'reason' => $reason, 'balance_before' => $before, 'balance_after' => (float) $e->fresh()->leave_balance, 'actioned_by' => $by?->id]);
    }
}
