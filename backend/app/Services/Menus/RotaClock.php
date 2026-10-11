<?php

namespace App\Services\Menus;

use App\Models\AttendanceDay;
use App\Models\Menus\Chef;
use App\Models\Menus\Shift;
use App\Models\User;
use App\Services\Attendance\AttendanceService;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;

/**
 * Clocking in and out from the rota page. It is the very same sign-in as Attendance (one record per person per day; nothing is kept separately), offered where the chef sees their shift.
 * A chef can clock in only for a published shift today, from a little before it starts (Menus settings) until it ends, and only for themselves. Lateness is judged against the shift's
 * start (and the Attendance grace period), not the company's working day. Clocking out is allowed once clocked in.
 */
class RotaClock
{
    public function __construct(private AttendanceService $attendance, private RotaAttendance $watch)
    {
    }

    private function tz(): string
    {
        return (string) config('app.timezone', 'Africa/Nairobi');
    }

    private function row(User $u): ?AttendanceDay
    {
        return AttendanceDay::where('user_id', $u->id)->where('work_date', Carbon::now($this->tz())->toDateString())->first();
    }

    /** The shift this chef can clock in for now: one that is running, or opens within the early minutes. */
    private function openShift(Chef $c, Carbon $now): ?Shift
    {
        $early = (int) MenusSettings::all()['rota_clock_early'];

        return Shift::where('chef_id', $c->id)->where('status', 'published')->where('shift_date', $now->toDateString())->orderBy('starts_at')->get()
            ->first(function (Shift $s) use ($now, $early) { [$a, $b] = $s->span(); return $now->gte($a->copy()->subMinutes($early)) && $now->lt($b); });
    }

    /** @return array<string, mixed> what the clock card shows */
    public function status(User $u): array
    {
        $chef = Chef::where('user_id', $u->id)->first();
        $on = MenusSettings::all()['rota_clock_from_rota'] && RotaAttendance::ready() && AttendanceService::ready();
        if (! $chef || ! $on) {
            return ['available' => false, 'chef' => (bool) $chef];
        }
        $now = Carbon::now($this->tz());
        $row = $this->row($u);
        $today = Shift::where('chef_id', $chef->id)->where('status', 'published')->where('shift_date', $now->toDateString())->orderBy('starts_at')->get();
        $open = $this->openShift($chef, $now);
        $next = $open ?? $today->first(fn (Shift $s) => $s->span()[0]->gt($now));
        $in = $row?->sign_in_at;
        $out = $row?->sign_out_at;
        $canIn = ! $in && $open !== null;
        $canOut = $in && ! $out;
        $message = null;
        if (! $in && ! $open) {
            $message = $today->isEmpty() ? 'You have no shift today.' : ($next ? 'Your shift starts at '.substr((string) $next->starts_at, 0, 5).'; you can clock in from '.$next->span()[0]->copy()->subMinutes((int) MenusSettings::all()['rota_clock_early'])->format('H:i').'.' : 'Your shifts today are over.');
        }

        return ['available' => true, 'chef' => true, 'shifts' => $today->map(fn (Shift $s) => ['id' => $s->id, 'starts_at' => substr((string) $s->starts_at, 0, 5), 'ends_at' => substr((string) $s->ends_at, 0, 5)])->values()->all(),
            'in' => $in?->copy()->timezone($this->tz())->format('H:i'), 'out' => $out?->copy()->timezone($this->tz())->format('H:i'), 'can_in' => $canIn, 'can_out' => (bool) $canOut, 'message' => $message];
    }

    public function clockIn(User $u): AttendanceDay
    {
        $chef = Chef::where('user_id', $u->id)->first() ?? throw new BooksException('You do not have a chef profile.');
        if (! MenusSettings::all()['rota_clock_from_rota']) {
            throw new BooksException('Clocking in from the rota is switched off: use the Attendance page.');
        }
        $now = Carbon::now($this->tz());
        $shift = $this->openShift($chef, $now);
        if (! $shift) {
            $s = $this->status($u);
            throw new BooksException($s['message'] ?? 'You can not clock in right now.');
        }
        $day = $this->attendance->signIn($u);   // the same sign-in as the Attendance page (refuses a second one)
        [$start] = $shift->span();
        $late = $now->gt($start->copy()->addMinutes($this->watch->grace()));
        $day->update(['status' => $late ? 'late' : 'present']);   // judged against the shift, not the company's working day

        return $day->fresh();
    }

    public function clockOut(User $u): AttendanceDay
    {
        Chef::where('user_id', $u->id)->first() ?? throw new BooksException('You do not have a chef profile.');
        if (! MenusSettings::all()['rota_clock_from_rota']) {
            throw new BooksException('Clocking out from the rota is switched off: use the Attendance page.');
        }

        return $this->attendance->signOut($u);
    }
}
