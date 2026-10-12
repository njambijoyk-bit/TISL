<?php

namespace App\Services\Courses;

use App\Models\Courses\Access;
use App\Models\Courses\ClassSession;
use App\Models\Courses\LiveSession;
use App\Models\Courses\Offering;
use App\Models\Courses\RegisterEntry;
use App\Models\Location;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The register. An offering has dated classes (sessions); a teacher marks who was there, or students check themselves in with the code the teacher shows. A student may ask to be excused; the teacher decides.
 * The share of classes a student attended is worked out against the share the offering needs: excused classes leave the count, a make-up class stands in for the one it makes up for, and a student who can no longer reach
 * the share is told so while there is still time to do something about it. Attendance never touches money.
 */
class CourseAttendance
{
    public function __construct(private CourseAccess $access, private CourseNotices $notices)
    {
    }

    public static function installed(): bool
    {
        return Schema::hasTable('course_sessions') && Schema::hasTable('course_register');
    }

    private function tz(): string
    {
        return (string) config('app.timezone', 'Africa/Nairobi');
    }

    // ── the classes ───────────────────────────────────────────────────────

    /**
     * @param array{title?: mixed, starts_at?: mixed, ends_at?: mixed, mode?: mixed, location_id?: mixed, makeup_for_id?: mixed, self_checkin?: mixed, notes?: mixed} $d
     */
    public function saveSession(Offering $o, array $d, ?ClassSession $s = null, ?int $by = null): ClassSession
    {
        if ($s && (int) $s->offering_id !== (int) $o->id) {
            throw new BooksException('That class belongs to another offering.');
        }
        if ($s && $s->live_id && (isset($d['starts_at']) || isset($d['ends_at']) || isset($d['mode']))) {
            throw new BooksException('This class follows a live lesson: change the times on the lesson.');
        }
        $title = trim((string) ($d['title'] ?? $s?->title ?? ''));
        if ($title === '' || mb_strlen($title) > 160) {
            throw new BooksException('Give the class a title of up to 160 letters.');
        }
        try {
            $start = ! empty($d['starts_at']) ? Carbon::parse((string) $d['starts_at'], $this->tz()) : $s?->starts_at?->copy();
            $end = ! empty($d['ends_at']) ? Carbon::parse((string) $d['ends_at'], $this->tz()) : $s?->ends_at?->copy();
        } catch (\Throwable) {
            throw new BooksException('Give the day and the start and end time of the class.');
        }
        if (! $start || ! $end) {
            throw new BooksException('Give the day and the start and end time of the class.');
        }
        if ($end->lte($start) || $start->diffInHours($end) > 12) {
            throw new BooksException('A class ends after it starts and lasts at most 12 hours.');
        }
        $mode = (string) ($d['mode'] ?? $s?->mode ?? 'in_person');
        if (! isset(ClassSession::MODES[$mode])) {
            throw new BooksException('Choose in person or online.');
        }
        $loc = array_key_exists('location_id', $d) ? ($d['location_id'] ? (int) $d['location_id'] : null) : ($s?->location_id ?? $o->location_id);
        if ($loc && ! Location::whereKey($loc)->exists()) {
            throw new BooksException('That branch does not exist.');
        }
        $makeup = array_key_exists('makeup_for_id', $d) ? ($d['makeup_for_id'] ? (int) $d['makeup_for_id'] : null) : $s?->makeup_for_id;
        if ($makeup) {
            $of = ClassSession::where('offering_id', $o->id)->find($makeup);
            if (! $of || $of->makeup_for_id || ($s && $of->id === $s->id)) {
                throw new BooksException('Choose one of this offering\'s ordinary classes to make up for.');
            }
        }
        $self = array_key_exists('self_checkin', $d) ? (bool) $d['self_checkin'] : (bool) ($s?->self_checkin ?? false);
        $row = ['title' => $title, 'starts_at' => $start->copy()->timezone($this->tz()), 'ends_at' => $end->copy()->timezone($this->tz()), 'mode' => $mode, 'location_id' => $mode === 'in_person' ? $loc : null,
            'makeup_for_id' => $makeup, 'self_checkin' => $self, 'notes' => array_key_exists('notes', $d) ? (trim((string) $d['notes']) === '' ? null : mb_substr(trim((string) $d['notes']), 0, 300)) : $s?->notes];
        if ($self && ! ($s?->checkin_code)) {
            $row['checkin_code'] = (string) random_int(100000, 999999);
        }
        $s ??= new ClassSession(['offering_id' => $o->id, 'created_by' => $by, 'status' => 'scheduled']);
        $s->fill($row)->save();

        return $s->fresh();
    }

    public function cancelSession(Offering $o, ClassSession $s): ClassSession
    {
        if ((int) $s->offering_id !== (int) $o->id) {
            throw new BooksException('That class belongs to another offering.');
        }
        if ($s->live_id) {
            throw new BooksException('This class follows a live lesson: remove the lesson to cancel it.');
        }
        $s->update(['status' => 'cancelled']);   // a cancelled class leaves the count; the marks are kept

        return $s->fresh();
    }

    public function deleteSession(Offering $o, ClassSession $s): void
    {
        if ((int) $s->offering_id !== (int) $o->id) {
            throw new BooksException('That class belongs to another offering.');
        }
        if (RegisterEntry::where('session_id', $s->id)->exists()) {
            throw new BooksException('Marks have been made for this class: cancel it instead.');
        }
        ClassSession::where('makeup_for_id', $s->id)->update(['makeup_for_id' => null]);
        $s->delete();
    }

    /** A live lesson has a class of its own, so a Zoom class is on the register without being typed twice. Called when a lesson is saved or removed. */
    public function syncLive(Offering $o, ?\App\Models\Courses\Lesson $lesson, bool $removed = false): void
    {
        if (! self::installed() || ! $lesson) {
            return;
        }
        // a class whose live lesson is gone (turned into another kind of lesson): taken off, or cancelled if marks were made
        foreach (ClassSession::where('offering_id', $o->id)->whereNotNull('live_id')->whereNotIn('live_id', LiveSession::select('id'))->get() as $orphan) {
            RegisterEntry::where('session_id', $orphan->id)->exists() ? $orphan->update(['status' => 'cancelled', 'live_id' => null]) : $orphan->delete();
        }
        $live = LiveSession::where('lesson_id', $lesson->id)->first();
        $s = ClassSession::where('offering_id', $o->id)->whereIn('live_id', LiveSession::where('lesson_id', $lesson->id)->pluck('id'))->first();
        if ($removed || ! $live) {
            if ($s) {
                RegisterEntry::where('session_id', $s->id)->exists() ? $s->update(['status' => 'cancelled', 'live_id' => null]) : $s->delete();
            }

            return;
        }
        $row = ['offering_id' => $o->id, 'live_id' => $live->id, 'title' => $lesson->title, 'starts_at' => $live->starts_at, 'ends_at' => $live->ends_at, 'mode' => 'online', 'location_id' => null];
        $s ? $s->update($row) : ClassSession::create($row + ['status' => 'scheduled']);
    }

    // ── marking ───────────────────────────────────────────────────────────

    /** The students on the roll for a class: people with access to the offering around that time, and anyone already marked. @return Collection<int, User> */
    public function roll(ClassSession $s): Collection
    {
        $ids = Access::where('offering_id', $s->offering_id)->where('starts_at', '<=', $s->ends_at)->where(fn ($q) => $q->whereNull('revoked_at')->orWhere('revoked_at', '>', $s->starts_at))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', $s->starts_at))->pluck('user_id')->merge(RegisterEntry::where('session_id', $s->id)->pluck('user_id'))->unique();

        return User::whereIn('id', $ids)->orderBy('name')->get(['id', 'name', 'email']);
    }

    /**
     * The teacher marks the class. Each mark is present, late, absent or excused; an empty status clears it. Done for a student who is not on the roll is refused.
     *
     * @param array<int, array{user_id: int, status: ?string, note?: ?string}> $marks
     */
    public function mark(Offering $o, ClassSession $s, array $marks, ?int $by = null): int
    {
        if ((int) $s->offering_id !== (int) $o->id) {
            throw new BooksException('That class belongs to another offering.');
        }
        if ($s->status === 'cancelled') {
            throw new BooksException('That class was cancelled.');
        }
        $roll = $this->roll($s)->pluck('id')->all();
        $n = 0;
        DB::transaction(function () use ($marks, $s, $o, $roll, $by, &$n) {
            foreach ($marks as $m) {
                $uid = (int) ($m['user_id'] ?? 0);
                if (! in_array($uid, $roll, true)) {
                    throw new BooksException('One of the students is not on this class\'s roll.');
                }
                $status = $m['status'] ?? null;
                if ($status === null || $status === '') {
                    RegisterEntry::where('session_id', $s->id)->where('user_id', $uid)->delete();
                    $n++;

                    continue;
                }
                if (! in_array($status, ['present', 'late', 'absent', 'excused'], true)) {
                    throw new BooksException('A mark is present, late, absent or excused.');
                }
                RegisterEntry::updateOrCreate(['session_id' => $s->id, 'user_id' => $uid], ['offering_id' => $o->id, 'status' => $status, 'method' => 'teacher', 'note' => filled($m['note'] ?? null) ? mb_substr(trim((string) $m['note']), 0, 300) : null,
                    'marked_by' => $by, 'marked_at' => now()]);
                $n++;
            }
        });
        foreach (array_unique(array_map(fn ($m) => (int) ($m['user_id'] ?? 0), $marks)) as $uid) {
            if ($u = User::find($uid)) {
                app(Learning::class)->tryComplete($u, $o);
            }
        }

        return $n;
    }

    /** A student checks themselves in with the code the teacher shows, from a little before the class until it ends. Late after the allowed minutes. */
    public function checkIn(User $u, ClassSession $s, string $code, ?Carbon $now = null): RegisterEntry
    {
        $now = ($now ?? now())->copy();
        $o = Offering::findOrFail($s->offering_id);
        if (! $s->self_checkin || ! $s->checkin_code || $s->status === 'cancelled') {
            throw new BooksException('Checking in yourself is not on for this class.');
        }
        if (! $this->access->can($u, $o) || ! $this->roll($s)->contains('id', $u->id)) {
            throw new BooksException('You are not on the roll for this class.');
        }
        $set = CourseSettings::all();
        if ($now->lt($s->starts_at->copy()->subMinutes((int) $set['checkin_open_minutes'])) || $now->gt($s->ends_at)) {
            throw new BooksException('Checking in is open from '.$set['checkin_open_minutes'].' minutes before the class until it ends.');
        }
        if (! hash_equals((string) $s->checkin_code, trim($code))) {
            throw new BooksException('That code is not right. Ask your teacher for it.');
        }
        $existing = RegisterEntry::where('session_id', $s->id)->where('user_id', $u->id)->first();
        if ($existing && in_array($existing->status, ['present', 'late', 'excused'], true)) {
            throw new BooksException('You are marked already.');
        }
        $late = $now->gt($s->starts_at->copy()->addMinutes((int) $set['checkin_late_minutes']));
        $e = RegisterEntry::updateOrCreate(['session_id' => $s->id, 'user_id' => $u->id], ['offering_id' => $o->id, 'status' => $late ? 'late' : 'present', 'method' => 'self', 'marked_at' => $now]);
        app(Learning::class)->tryComplete($u, $o);

        return $e;
    }

    /** A student asks to be excused from a class (before it, or up to a week after). The teacher decides. */
    public function askExcuse(User $u, ClassSession $s, string $reason, ?Carbon $now = null): RegisterEntry
    {
        $now = ($now ?? now())->copy();
        $o = Offering::findOrFail($s->offering_id);
        if (! $this->access->can($u, $o) || ! $this->roll($s)->contains('id', $u->id)) {
            throw new BooksException('You are not on the roll for this class.');
        }
        if ($s->status === 'cancelled' || $now->gt($s->ends_at->copy()->addDays(7))) {
            throw new BooksException('It is too late to ask to be excused from this class.');
        }
        $reason = trim($reason);
        if ($reason === '') {
            throw new BooksException('Say why you can not come.');
        }
        $existing = RegisterEntry::where('session_id', $s->id)->where('user_id', $u->id)->first();
        if ($existing && in_array($existing->status, ['present', 'late', 'excused'], true)) {
            throw new BooksException('You are marked already.');
        }

        return RegisterEntry::updateOrCreate(['session_id' => $s->id, 'user_id' => $u->id], ['offering_id' => $o->id, 'status' => 'asked', 'method' => 'self', 'note' => mb_substr($reason, 0, 300), 'marked_by' => null, 'marked_at' => $now]);
    }

    /** The teacher answers an excuse: excused, or absent. */
    public function decideExcuse(Offering $o, RegisterEntry $e, bool $approve, ?int $by = null, ?string $note = null): RegisterEntry
    {
        if ((int) $e->offering_id !== (int) $o->id || $e->status !== 'asked') {
            throw new BooksException('There is no excuse waiting on that.');
        }
        $e->update(['status' => $approve ? 'excused' : 'absent', 'marked_by' => $by, 'marked_at' => now(), 'note' => trim((string) $note) === '' ? $e->note : mb_substr(trim((string) $note), 0, 300)]);
        if ($u = User::find($e->user_id)) {
            app(Learning::class)->tryComplete($u, $o);
        }

        return $e->fresh();
    }

    // ── the share ─────────────────────────────────────────────────────────

    /**
     * Where a student stands. Counted classes are the ordinary ones that were not cancelled; excused classes leave the count; a make-up class the student attended stands in for the class it makes up for.
     *
     * @return array{state: string, needed: ?int, rate: ?float, attended: int, excused: int, held: int, remaining: int, total: int, best: ?float}
     *   state: none (nothing is asked), pending (no class has been held yet), ok, at_risk (below the share but still reachable), failed (can no longer reach it)
     */
    public function standing(int $userId, Offering $o, ?Carbon $now = null): array
    {
        $now = ($now ?? now())->copy();
        $needed = $o->min_attendance_pct ? (int) $o->min_attendance_pct : null;
        $sessions = ClassSession::where('offering_id', $o->id)->where('status', '!=', 'cancelled')->get();
        $counted = $sessions->whereNull('makeup_for_id');
        $marks = RegisterEntry::where('offering_id', $o->id)->where('user_id', $userId)->get()->keyBy('session_id');
        $taken = RegisterEntry::where('offering_id', $o->id)->pluck('session_id')->unique()->all();   // a class counts as held once the register has been taken for it (a class nobody has marked yet is still open)
        $isHeld = fn ($s) => $s->ends_at->lt($now) && in_array($s->id, $taken, true);
        $madeUp = $sessions->whereNotNull('makeup_for_id')->filter(fn ($m) => in_array($marks[$m->id]->status ?? '', ['present', 'late'], true))->pluck('makeup_for_id')->all();
        $attended = $excused = $held = $remaining = 0;
        foreach ($counted as $s) {
            $st = $marks[$s->id]->status ?? null;
            if ($isHeld($s)) {
                $held++;
                if (in_array($st, ['present', 'late'], true) || in_array($s->id, $madeUp, true)) {
                    $attended++;
                } elseif ($st === 'excused') {
                    $excused++;
                }
            } else {
                $remaining++;
                if ($st === 'excused') {
                    $excused++;
                }
            }
        }
        $total = $counted->count();
        $base = $total - $excused;
        $heldBase = max(0, $held - $this->excusedHeld($counted, $marks, $isHeld));
        $rate = $heldBase > 0 ? round($attended / $heldBase * 100, 1) : null;
        $best = $base > 0 ? round(($attended + $remaining) / $base * 100, 1) : null;
        $state = 'none';
        if ($needed !== null && $total > 0) {
            if ($heldBase === 0) {
                $state = 'pending';
            } elseif ($rate >= $needed) {
                $state = 'ok';
            } elseif ($best !== null && $best >= $needed) {
                $state = 'at_risk';
            } else {
                $state = 'failed';
            }
        }

        return ['state' => $state, 'needed' => $needed, 'rate' => $rate, 'attended' => $attended, 'excused' => $excused, 'held' => $held, 'remaining' => $remaining, 'total' => $total, 'best' => $best];
    }

    private function excusedHeld(Collection $counted, Collection $marks, callable $isHeld): int
    {
        return $counted->filter(fn ($s) => $isHeld($s) && ($marks[$s->id]->status ?? null) === 'excused')->count();
    }

    /** Is the attendance asked for met, with every counted class held? (Used before completing an enrolment or issuing a certificate.) */
    public function meets(int $userId, Offering $o): bool
    {
        if (! $o->min_attendance_pct || ! self::installed()) {
            return true;
        }
        $s = $this->standing($userId, $o);

        return $s['state'] === 'none' ? true : ($s['state'] === 'ok' && $s['remaining'] === 0);
    }

    // ── what the screens show ─────────────────────────────────────────────

    /** @return array<int, array<string, mixed>> the classes of an offering for staff, with how many were marked */
    public function sessions(Offering $o): array
    {
        $counts = RegisterEntry::where('offering_id', $o->id)->selectRaw('session_id, status, count(*) as n')->groupBy('session_id', 'status')->get()->groupBy('session_id');
        $title = ClassSession::where('offering_id', $o->id)->pluck('title', 'id');

        return ClassSession::where('offering_id', $o->id)->orderBy('starts_at')->get()->map(function (ClassSession $s) use ($counts, $title) {
            $c = ($counts[$s->id] ?? collect())->pluck('n', 'status');

            return ['id' => $s->id, 'title' => $s->title, 'starts_at' => $s->starts_at->toIso8601String(), 'ends_at' => $s->ends_at->toIso8601String(), 'mode' => $s->mode, 'mode_label' => ClassSession::MODES[$s->mode] ?? $s->mode, 'location_id' => $s->location_id,
                'status' => $s->status, 'live_id' => $s->live_id, 'makeup_for_id' => $s->makeup_for_id, 'makeup_for' => $s->makeup_for_id ? ($title[$s->makeup_for_id] ?? null) : null, 'self_checkin' => $s->self_checkin, 'checkin_code' => $s->self_checkin ? $s->checkin_code : null,
                'notes' => $s->notes, 'marked' => (int) $c->sum(), 'present' => (int) (($c['present'] ?? 0) + ($c['late'] ?? 0)), 'absent' => (int) ($c['absent'] ?? 0), 'excused' => (int) ($c['excused'] ?? 0), 'asked' => (int) ($c['asked'] ?? 0)];
        })->values()->all();
    }

    /** @return array<string, mixed> the roll of one class with each student's mark */
    public function rollCall(ClassSession $s): array
    {
        $marks = RegisterEntry::where('session_id', $s->id)->get()->keyBy('user_id');

        return ['session' => ['id' => $s->id, 'title' => $s->title, 'starts_at' => $s->starts_at->toIso8601String(), 'ends_at' => $s->ends_at->toIso8601String(), 'status' => $s->status],
            'students' => $this->roll($s)->map(fn (User $u) => ['user_id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'status' => $marks[$u->id]->status ?? null, 'method' => $marks[$u->id]->method ?? null, 'note' => $marks[$u->id]->note ?? null,
                'entry_id' => $marks[$u->id]->id ?? null])->values()->all()];
    }

    /** @return array<int, array<string, mixed>> every student of an offering with where they stand */
    public function report(Offering $o): array
    {
        $ids = Access::where('offering_id', $o->id)->whereNull('revoked_at')->pluck('user_id')->merge(RegisterEntry::where('offering_id', $o->id)->pluck('user_id'))->unique();

        return User::whereIn('id', $ids)->orderBy('name')->get(['id', 'name', 'email'])->map(fn (User $u) => ['user_id' => $u->id, 'name' => $u->name, 'email' => $u->email] + $this->standing($u->id, $o))->values()->all();
    }

    /** The student's own view: every counted class with their mark, and where they stand. @return array<string, mixed> */
    public function mine(User $u, Offering $o): array
    {
        $marks = RegisterEntry::where('offering_id', $o->id)->where('user_id', $u->id)->get()->keyBy('session_id');
        $titles = ClassSession::where('offering_id', $o->id)->pluck('title', 'id');
        $sessions = ClassSession::where('offering_id', $o->id)->where('status', '!=', 'cancelled')->orderBy('starts_at')->get();

        return ['standing' => $this->standing($u->id, $o), 'sessions' => $sessions->map(fn (ClassSession $s) => ['id' => $s->id, 'title' => $s->title, 'starts_at' => $s->starts_at->toIso8601String(), 'ends_at' => $s->ends_at->toIso8601String(), 'mode_label' => ClassSession::MODES[$s->mode] ?? $s->mode,
            'makeup_for' => $s->makeup_for_id ? ($titles[$s->makeup_for_id] ?? null) : null, 'self_checkin' => $s->self_checkin, 'status' => $marks[$s->id]->status ?? null, 'status_label' => isset($marks[$s->id]) ? (RegisterEntry::STATUSES[$marks[$s->id]->status] ?? null) : null,
            'can_excuse' => ! isset($marks[$s->id]) || ! in_array($marks[$s->id]->status, ['present', 'late', 'excused'], true)])->values()->all()];
    }

    // ── the warnings ──────────────────────────────────────────────────────

    /** Tell students who are at risk of missing the attendance needed, or who no longer can reach it, once for each. @return int how many were told */
    public function warn(?Carbon $now = null): int
    {
        if (! self::installed() || ! Schema::hasTable('course_attendance_flags')) {
            return 0;
        }
        $now = ($now ?? now())->copy();
        $n = 0;
        foreach (Offering::whereNotNull('min_attendance_pct')->whereIn('status', ['published'])->get() as $o) {
            foreach (Access::where('offering_id', $o->id)->whereNull('revoked_at')->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', $now))->pluck('user_id')->unique() as $uid) {
                $st = $this->standing((int) $uid, $o, $now);
                if (! in_array($st['state'], ['at_risk', 'failed'], true)) {
                    continue;
                }
                $flag = DB::table('course_attendance_flags')->where('offering_id', $o->id)->where('user_id', $uid)->where('state', $st['state'])->first();
                if ($flag && $flag->notified_at) {
                    continue;
                }
                $flag ? DB::table('course_attendance_flags')->where('id', $flag->id)->update(['notified_at' => $now, 'updated_at' => $now])
                    : DB::table('course_attendance_flags')->insert(['offering_id' => $o->id, 'user_id' => $uid, 'state' => $st['state'], 'notified_at' => $now, 'created_at' => $now, 'updated_at' => $now]);
                $this->notices->attendance((int) $uid, $o, $st);
                $n++;
            }
        }

        return $n;
    }
}
