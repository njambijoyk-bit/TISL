<?php

namespace App\Services\Attendance;

use App\Models\AttendanceDay;
use App\Models\AttendanceDispute;
use App\Models\AttendanceMarker;
use App\Models\AttendanceSetting;
use App\Models\Employee;
use App\Models\User;
use App\Services\Books\BooksException;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Attendance is a record, not an accounting voucher: it never touches the books, but payroll only counts what has been verified.
 *  - A person signs in and out for themselves (and can do nothing else to their own day: they cannot mark themselves absent or confirm it).
 *  - Their manager (from the employee record), someone assigned, or an admin marks the day and verifies it — one day at a time or a whole month.
 *    The super admin may confirm their own days.
 *  - A forgotten sign-in is proposed from what the person did in the app that day (labelled inferred) and is confirmed or corrected by whoever verifies.
 *  - A colleague can dispute a day. The disputes are listed for everyone (who is disputed, the day, what); who reported them and when is kept for the super admin alone.
 */
class AttendanceService
{
    /** Tables whose rows say "this person did something in the app at this time": [table, user column, time column]. Used only to infer a forgotten sign-in. */
    private const ACTIVITY = [
        ['vouchers', 'created_by', 'created_at'], ['tax_activity_logs', 'user_id', 'created_at'], ['withholding_activity_logs', 'user_id', 'created_at'],
        ['product_activity_logs', 'user_id', 'created_at'], ['hamper_activity_logs', 'user_id', 'created_at'],
        ['delivery_activity_logs', 'user_id', 'created_at'], ['referral_activity_logs', 'user_id', 'created_at'], ['auction_order_activity_logs', 'user_id', 'created_at'],
    ];

    public static function ready(): bool
    {
        return Schema::hasTable('attendance_days') && Schema::hasTable('attendance_disputes');
    }

    private function need(): void
    {
        if (! self::ready()) {
            throw new BooksException('Run script 63_attendance.sql before using attendance.');
        }
    }

    public static function isSuper(?User $u): bool
    {
        return $u && $u->role === 'super_admin';
    }

    // ── who may do what ────────────────────────────────────────────────────

    /** May $actor mark and verify $subjectId's attendance? Never one's own, except the super admin. */
    public function canMark(User $actor, int $subjectId): bool
    {
        if ($actor->id === $subjectId) {
            return self::isSuper($actor);
        }
        if (in_array($actor->role, ['super_admin', 'admin'], true)) {
            return true;
        }
        $mgr = Employee::where('user_id', $subjectId)->value('manager_id');
        if ($mgr && (int) Employee::where('user_id', $actor->id)->value('id') === (int) $mgr) {
            return true;
        }

        return Schema::hasTable('attendance_markers') && AttendanceMarker::where('staff_user_id', $subjectId)->where('marker_user_id', $actor->id)->exists();
    }

    /** People whose attendance is tracked: staff with an employee record who have not left. */
    public function staff(): \Illuminate\Support\Collection
    {
        return User::whereHas('employee', fn ($e) => $e->whereNull('termination_date'))->orderBy('name')->get(['id', 'name', 'role']);
    }

    // ── days ───────────────────────────────────────────────────────────────

    private function workMinutes(?Carbon $in, ?Carbon $out, string $date): array
    {
        if (! $in || ! $out || $out->lte($in)) {
            return [0, 0];
        }
        $s = AttendanceSetting::current();
        $end = Carbon::parse($date . ' ' . $s->work_end);
        $worked = (int) $in->diffInMinutes($out);

        return [$worked, $out->gt($end) ? (int) $end->diffInMinutes($out) : 0];
    }

    private function row(int $userId, string $date): AttendanceDay
    {
        return AttendanceDay::firstOrNew(['user_id' => $userId, 'work_date' => $date]);
    }

    /** I am here. Only for myself, only for today. */
    public function signIn(User $u): AttendanceDay
    {
        $this->need();
        $today = today()->toDateString();
        $d = $this->row($u->id, $today);
        if ($d->sign_in_at) {
            throw new BooksException('You signed in at ' . $d->sign_in_at->format('H:i') . '.');
        }
        $s = AttendanceSetting::current();
        $late = now()->gt(Carbon::parse($today . ' ' . $s->work_start)->addMinutes((int) $s->grace_minutes));
        $d->fill(['sign_in_at' => now(), 'sign_source' => 'self', 'status' => $late ? 'late' : 'present', 'verify_status' => 'marked', 'verified_by' => null, 'verified_at' => null])->save();

        return $d;
    }

    public function signOut(User $u): AttendanceDay
    {
        $this->need();
        $today = today()->toDateString();
        $d = $this->row($u->id, $today);
        if (! $d->exists || ! $d->sign_in_at) {
            throw new BooksException('Sign in first.');
        }
        if ($d->sign_out_at) {
            throw new BooksException('You signed out at ' . $d->sign_out_at->format('H:i') . '.');
        }
        [$w, $ot] = $this->workMinutes($d->sign_in_at, now(), $today);
        $d->fill(['sign_out_at' => now(), 'minutes_worked' => $w, 'overtime_minutes' => $ot, 'verify_status' => 'marked', 'verified_by' => null, 'verified_at' => null])->save();

        return $d;
    }

    /**
     * Mark a day for someone else (or, as super admin, for yourself). $in: status, sign_in (HH:MM), sign_out (HH:MM), note.
     *
     * @throws BooksException
     */
    public function mark(User $actor, int $subjectId, string $date, array $in): AttendanceDay
    {
        $this->need();
        if (! $this->canMark($actor, $subjectId)) {
            throw new BooksException($actor->id === $subjectId ? 'You can sign in and out, but your manager marks the rest of your attendance.' : 'You are not assigned to mark this person\'s attendance.');
        }
        if ($date > today()->toDateString()) {
            throw new BooksException('A day that has not happened cannot be marked.');
        }
        $status = $in['status'] ?? 'present';
        if (! in_array($status, AttendanceDay::STATUSES, true)) {
            throw new BooksException('Choose a status.');
        }
        $d = $this->row($subjectId, $date);
        $mk = fn (?string $hm) => filled($hm) ? Carbon::parse($date . ' ' . $hm) : null;
        $inAt = array_key_exists('sign_in', $in) ? $mk($in['sign_in']) : $d->sign_in_at;
        $outAt = array_key_exists('sign_out', $in) ? $mk($in['sign_out']) : $d->sign_out_at;
        if (in_array($status, AttendanceDay::WORKED, true) && $inAt && $outAt && $outAt->lte($inAt)) {
            throw new BooksException('The sign-out must be after the sign-in.');
        }
        if (! in_array($status, AttendanceDay::WORKED, true)) {
            $inAt = $outAt = null;
        }
        [$w, $ot] = $this->workMinutes($inAt, $outAt, $date);
        $d->fill(['status' => $status, 'sign_in_at' => $inAt, 'sign_out_at' => $outAt, 'sign_source' => $d->sign_source === 'self' && $inAt == $d->sign_in_at ? 'self' : 'marker', 'minutes_worked' => $w, 'overtime_minutes' => $ot,
            'note' => $in['note'] ?? $d->note, 'marked_by' => $actor->id, 'marked_at' => now(), 'verify_status' => 'marked', 'verified_by' => null, 'verified_at' => null])->save();

        return $d;
    }

    /** What the person did in the app that day: [first, last] as Carbon or null. A hint for a forgotten sign-in, never a record. */
    public function inferred(int $userId, string $date): array
    {
        $from = Carbon::parse($date)->startOfDay();
        $to = Carbon::parse($date)->endOfDay();
        $first = $last = null;
        $see = function ($t) use (&$first, &$last) {
            if (! $t) {
                return;
            }
            $t = Carbon::parse($t);
            $first = $first && $first->lte($t) ? $first : $t;
            $last = $last && $last->gte($t) ? $last : $t;
        };
        foreach (self::ACTIVITY as [$table, $userCol, $timeCol]) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, $userCol) || ! Schema::hasColumn($table, $timeCol)) {
                continue;
            }
            $row = DB::table($table)->where($userCol, $userId)->whereBetween($timeCol, [$from, $to])->selectRaw("MIN({$timeCol}) a, MAX({$timeCol}) b")->first();
            $see($row?->a);
            $see($row?->b);
        }
        if (Schema::hasTable('personal_access_tokens')) {   // logging in, and the last request the session made
            $tok = DB::table('personal_access_tokens')->where('tokenable_type', User::class)->where('tokenable_id', $userId)->whereBetween('created_at', [$from, $to])->min('created_at');
            $use = DB::table('personal_access_tokens')->where('tokenable_type', User::class)->where('tokenable_id', $userId)->whereBetween('last_used_at', [$from, $to])->max('last_used_at');
            $see($tok);
            $see($use);
        }

        return [$first, $last];
    }

    /** Accept the inferred times as the sign-in/out (a marker's call, then verified like any other). */
    public function acceptInferred(User $actor, int $subjectId, string $date): AttendanceDay
    {
        [$a, $b] = $this->inferred($subjectId, $date);
        if (! $a) {
            throw new BooksException('There is no activity from that person on that day to go by.');
        }

        return $this->mark($actor, $subjectId, $date, ['status' => 'present', 'sign_in' => $a->format('H:i'), 'sign_out' => $b && $b->gt($a) ? $b->format('H:i') : null, 'note' => 'Inferred from activity in the app']);
    }

    /** Verify one day. A person cannot verify their own (the super admin can); a day with an open dispute is settled first. */
    public function verify(User $actor, int $subjectId, string $date, ?string $note = null): AttendanceDay
    {
        $this->need();
        if (! $this->canMark($actor, $subjectId)) {
            throw new BooksException($actor->id === $subjectId ? 'You cannot confirm your own attendance.' : 'You are not assigned to verify this person\'s attendance.');
        }
        $d = AttendanceDay::where('user_id', $subjectId)->where('work_date', $date)->first();
        if (! $d) {
            throw new BooksException('There is nothing marked for that day yet.');
        }
        if ($this->openDispute($subjectId, $date)) {
            throw new BooksException('This day is disputed. The super admin settles the dispute first.');
        }
        $d->fill(['verify_status' => 'verified', 'verified_by' => $actor->id, 'verified_at' => now(), 'verify_note' => $note])->save();

        return $d;
    }

    /** Verify every marked day of a month for one person; days with an open dispute are left. @return array{verified:int, disputed:int, unmarked:int} */
    public function verifyMonth(User $actor, int $subjectId, string $ym): array
    {
        $this->need();
        if (! $this->canMark($actor, $subjectId)) {
            throw new BooksException($actor->id === $subjectId ? 'You cannot confirm your own attendance.' : 'You are not assigned to verify this person\'s attendance.');
        }
        $from = Carbon::parse($ym . '-01')->startOfMonth();
        $to = $from->copy()->endOfMonth();
        $v = $dis = 0;
        foreach (AttendanceDay::where('user_id', $subjectId)->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->where('verify_status', 'marked')->get() as $d) {
            if ($this->openDispute($subjectId, $d->work_date->toDateString())) {
                $dis++;
                continue;
            }
            $d->fill(['verify_status' => 'verified', 'verified_by' => $actor->id, 'verified_at' => now()])->save();
            $v++;
        }

        return ['verified' => $v, 'disputed' => $dis, 'unmarked' => count($this->unmarkedWorkdays($subjectId, $from, $to))];
    }

    /** Working days with nothing marked yet (up to today). */
    public function unmarkedWorkdays(int $userId, Carbon $from, Carbon $to): array
    {
        $days = AttendanceSetting::current()->days();
        $have = AttendanceDay::where('user_id', $userId)->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->pluck('work_date')->map(fn ($d) => $d->toDateString())->all();
        $out = [];
        for ($d = $from->copy(); $d->lte($to) && $d->lte(today()); $d->addDay()) {
            if (in_array($d->dayOfWeek, $days, true) && ! in_array($d->toDateString(), $have, true)) {
                $out[] = $d->toDateString();
            }
        }

        return $out;
    }

    private function openDispute(int $subjectId, string $date): bool
    {
        return Schema::hasTable('attendance_disputes') && AttendanceDispute::where('subject_user_id', $subjectId)->where('work_date', $date)->where('status', 'open')->exists();
    }

    // ── the calendar ───────────────────────────────────────────────────────

    /** Everyone's attendance for a month, for the calendar every staff member can see. */
    public function calendar(User $viewer, string $ym): array
    {
        $from = Carbon::parse($ym . '-01')->startOfMonth();
        $to = $from->copy()->endOfMonth();
        $days = self::ready() ? AttendanceDay::whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->get()->groupBy('user_id') : collect();
        $disputed = self::ready() ? AttendanceDispute::where('status', 'open')->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->get()->groupBy('subject_user_id') : collect();
        $people = [];
        foreach ($this->staff() as $p) {
            $mine = ($days[$p->id] ?? collect())->mapWithKeys(fn ($d) => [$d->work_date->toDateString() => [
                'status' => $d->status, 'in' => $d->sign_in_at?->format('H:i'), 'out' => $d->sign_out_at?->format('H:i'), 'verified' => $d->verify_status === 'verified', 'overtime' => $d->overtime_minutes,
                'disputed' => ($disputed[$p->id] ?? collect())->contains(fn ($x) => $x->work_date->toDateString() === $d->work_date->toDateString()),
            ]]);
            // a disputed day with no record yet still shows as disputed
            foreach (($disputed[$p->id] ?? collect()) as $x) {
                $k = $x->work_date->toDateString();
                if (! $mine->has($k)) {
                    $mine[$k] = ['status' => null, 'in' => null, 'out' => null, 'verified' => false, 'overtime' => 0, 'disputed' => true];
                }
            }
            $people[] = ['user_id' => $p->id, 'name' => $p->name, 'is_me' => $p->id === $viewer->id, 'can_mark' => $this->canMark($viewer, $p->id), 'days' => $mine,
                'marked' => $mine->count(), 'verified' => $mine->where('verified', true)->count()];
        }

        return ['month' => $ym, 'workdays' => AttendanceSetting::current()->days(), 'people' => $people];
    }

    /** One day in full: the record, what the app says they did, who may change it. */
    public function day(User $viewer, int $subjectId, string $date): array
    {
        $d = self::ready() ? AttendanceDay::where('user_id', $subjectId)->where('work_date', $date)->first() : null;
        [$a, $b] = $this->inferred($subjectId, $date);
        $can = $this->canMark($viewer, $subjectId);

        return ['user_id' => $subjectId, 'name' => User::whereKey($subjectId)->value('name'), 'date' => $date, 'can_mark' => $can, 'is_me' => $viewer->id === $subjectId,
            'can_dispute' => $viewer->id !== $subjectId && $date <= today()->toDateString(),
            'record' => $d ? ['status' => $d->status, 'in' => $d->sign_in_at?->format('H:i'), 'out' => $d->sign_out_at?->format('H:i'), 'minutes' => $d->minutes_worked, 'overtime' => $d->overtime_minutes, 'note' => $d->note,
                'source' => $d->sign_source, 'verified' => $d->verify_status === 'verified', 'verified_by' => $d->verified_by ? User::whereKey($d->verified_by)->value('name') : null, 'marked_by' => $d->marked_by ? User::whereKey($d->marked_by)->value('name') : null] : null,
            'inferred' => $a ? ['first' => $a->format('H:i'), 'last' => $b && $b->gt($a) ? $b->format('H:i') : null] : null];
    }

    // ── disputes ───────────────────────────────────────────────────────────

    /** A colleague says a day was wrong. Not about yourself; once per day, kind and person. */
    public function dispute(User $reporter, int $subjectId, string $date, string $kind, ?string $note): AttendanceDispute
    {
        $this->need();
        if ($reporter->id === $subjectId) {
            throw new BooksException('You cannot dispute your own attendance.');
        }
        if (! array_key_exists($kind, AttendanceDispute::KINDS)) {
            throw new BooksException('Say what was wrong.');
        }
        if ($date > today()->toDateString()) {
            throw new BooksException('That day has not happened.');
        }
        if (! $this->staff()->contains('id', $subjectId)) {
            throw new BooksException('That person is not on the attendance list.');
        }
        if (AttendanceDispute::where('subject_user_id', $subjectId)->where('work_date', $date)->where('kind', $kind)->where('reporter_user_id', $reporter->id)->exists()) {
            throw new BooksException('You already reported that.');
        }

        return AttendanceDispute::create(['subject_user_id' => $subjectId, 'work_date' => $date, 'kind' => $kind, 'note' => $note, 'reporter_user_id' => $reporter->id, 'reported_at' => now()]);
    }

    /**
     * The disputes, for whoever is looking. Everyone sees who is disputed, the day, what and the outcome — nobody sees who reported it or when except the
     * super admin: the reporter is not shown to admins, finance, the person disputed, or the other reporters, or the reporter themself.
     */
    public function disputes(User $viewer, ?string $ym = null): array
    {
        if (! self::ready()) {
            return [];
        }
        $super = self::isSuper($viewer);
        $q = AttendanceDispute::query()->orderByRaw("status = 'open' desc")->orderByDesc('work_date')->orderByDesc('id');
        if ($ym) {
            $q->whereBetween('work_date', [Carbon::parse($ym . '-01')->startOfMonth()->toDateString(), Carbon::parse($ym . '-01')->endOfMonth()->toDateString()]);
        }

        return $q->limit(200)->get()->map(function ($x) use ($super) {
            $row = ['id' => $x->id, 'subject_user_id' => (int) $x->subject_user_id, 'subject' => User::whereKey($x->subject_user_id)->value('name'), 'date' => $x->work_date->toDateString(), 'kind' => $x->kind, 'kind_label' => AttendanceDispute::KINDS[$x->kind] ?? $x->kind,
                'note' => $x->note, 'status' => $x->status, 'resolution_note' => $x->resolution_note, 'resolved_at' => $x->resolved_at?->toIso8601String()];
            if ($super) {   // the one place the reporter is revealed
                $row['reporter'] = User::whereKey($x->reporter_user_id)->value('name');
                $row['reported_at'] = $x->reported_at?->toIso8601String();
            }

            return $row;
        })->all();
    }

    /** The super admin settles a dispute. Upheld changes the day (not attended → absent; left early → left early; no overtime → overtime removed) and verifies it. */
    public function resolve(User $actor, int $id, string $outcome, ?string $note): AttendanceDispute
    {
        $this->need();
        if (! self::isSuper($actor)) {
            throw new BooksException('Only the super admin settles attendance disputes.');
        }
        $x = AttendanceDispute::findOrFail($id);
        if ($x->status !== 'open') {
            throw new BooksException('That dispute is already settled.');
        }
        if (! in_array($outcome, ['upheld', 'dismissed'], true)) {
            throw new BooksException('Uphold or dismiss it.');
        }

        return DB::transaction(function () use ($x, $actor, $outcome, $note) {
            if ($outcome === 'upheld') {
                $d = $this->row((int) $x->subject_user_id, $x->work_date->toDateString());
                $d->user_id = $x->subject_user_id;
                $d->work_date = $x->work_date;
                match ($x->kind) {
                    'did_not_attend' => $d->fill(['status' => 'absent', 'sign_in_at' => null, 'sign_out_at' => null, 'minutes_worked' => 0, 'overtime_minutes' => 0]),
                    'left_early' => $d->fill(['status' => 'left_early']),
                    'no_overtime' => $d->fill(['overtime_minutes' => 0]),
                    default => null,
                };
                $d->fill(['marked_by' => $actor->id, 'marked_at' => now(), 'note' => trim(($d->note ? $d->note . ' · ' : '') . 'Dispute upheld' . ($note ? ": {$note}" : '')), 'verify_status' => 'verified', 'verified_by' => $actor->id, 'verified_at' => now()])->save();
            }
            $x->update(['status' => $outcome, 'resolved_by' => $actor->id, 'resolved_at' => now(), 'resolution_note' => $note]);

            return $x->fresh();
        });
    }
}
