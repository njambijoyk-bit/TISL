<?php

namespace App\Services\Courses;

use App\Models\Courses\Enrolment;
use App\Models\Courses\Intake;
use App\Models\Courses\Offering;
use App\Models\Courses\WaitlistEntry;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

/**
 * Intakes and the waiting list. An intake is a dated run of an offering with its own places and enrolment window; an offering with intakes asks the student to choose one.
 * Places are counted from enrolments that hold a place. When the offering or the run is full a person may join the waiting list; when a place frees up (a cancel, a refund, an unpaid
 * enrolment let go) the first in line is offered it and nobody else can take it while the offer lasts (a setting; 48 hours by default).
 */
class IntakeService
{
    public function __construct(private CourseNotices $notices)
    {
    }

    public static function installed(): bool
    {
        return Schema::hasTable('course_intakes') && Schema::hasTable('course_waitlist') && Schema::hasColumn('course_enrolments', 'intake_id');
    }

    private function today(): Carbon
    {
        return Carbon::now(config('app.timezone', 'Africa/Nairobi'))->startOfDay();
    }

    /** @return \Illuminate\Support\Collection<int, Intake> the runs that can be joined today */
    public function openIntakes(Offering $o)
    {
        $today = $this->today();

        return Intake::where('offering_id', $o->id)->where('status', 'open')->orderBy('starts_on')->orderBy('id')->get()
            ->filter(fn (Intake $i) => ! $i->enrol_until || $i->enrol_until->copy()->startOfDay()->gte($today))->values();
    }

    private function taken(Offering $o, ?int $intakeId = null): int
    {
        return Enrolment::where('offering_id', $o->id)->whereIn('status', ['pending', 'active', 'completed'])->when($intakeId !== null, fn ($q) => $q->where('intake_id', $intakeId))->count();
    }

    private function offers(Offering $o, ?int $intakeId, ?int $exceptUser): int
    {
        return WaitlistEntry::where('offering_id', $o->id)->where('status', 'offered')->where('offer_expires_at', '>', now())
            ->when($intakeId !== null, fn ($q) => $q->where('intake_id', $intakeId))->when($exceptUser !== null, fn ($q) => $q->where('user_id', '!=', $exceptUser))->count();
    }

    /** Places left for this person in the offering and, when given, the run: the smaller of the two. Null = no limit. Offers held for other people are not free. */
    public function room(Offering $o, ?int $intakeId = null, ?int $forUser = null): ?int
    {
        $left = null;
        if ($o->capacity) {
            $left = (int) $o->capacity - $this->taken($o) - $this->offers($o, null, $forUser);
        }
        if ($intakeId !== null && ($cap = Intake::whereKey($intakeId)->value('capacity'))) {
            $mine = (int) $cap - $this->taken($o, $intakeId) - $this->offers($o, $intakeId, $forUser);
            $left = $left === null ? $mine : min($left, $mine);
        }

        return $left === null ? null : max(0, $left);
    }

    /**
     * Checks an enrolment may go ahead: the run (when the offering has runs) is open and has room, and so has the offering. Returns the run's id.
     * A person holding an offer is allowed into the place held for them.
     */
    public function resolve(Offering $o, mixed $intakeId, User $student): ?int
    {
        $any = Intake::where('offering_id', $o->id)->exists();
        $id = null;
        if ($any) {
            $open = $this->openIntakes($o);
            if ($open->isEmpty()) {
                throw new BooksException('Enrolment is closed: there is no open intake right now.');
            }
            if (! $intakeId) {
                throw new BooksException('Choose which intake you will join.');
            }
            $pick = $open->firstWhere('id', (int) $intakeId) ?? throw new BooksException('That intake is not open for enrolment.');
            $id = $pick->id;
        }
        if (($left = $this->room($o, $id, $student->id)) !== null && $left < 1) {
            throw new BooksException($any ? 'Every place in that intake is taken.' : 'Every place is taken.');
        }

        return $id;
    }

    /** The student enrolled: whatever they were waiting for is done. */
    public function enrolled(Offering $o, User $student): void
    {
        if (self::installed()) {
            WaitlistEntry::where('offering_id', $o->id)->where('user_id', $student->id)->whereIn('status', ['waiting', 'offered'])->update(['status' => 'enrolled']);
        }
    }

    // ── the waiting list ─────────────────────────────────────────────────

    public function join(Offering $o, User $u, mixed $intakeId = null): WaitlistEntry
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 160_courses_teaching.sql first.');
        }
        if ($o->status !== 'published') {
            throw new BooksException('That is not open for enrolment.');
        }
        if (Enrolment::where('offering_id', $o->id)->where('student_user_id', $u->id)->whereIn('status', ['pending', 'active', 'completed'])->exists()) {
            throw new BooksException('You are enrolled in this already.');
        }
        $id = null;
        if (Intake::where('offering_id', $o->id)->exists()) {
            $open = $this->openIntakes($o);
            if (! $intakeId) {
                throw new BooksException('Choose which intake you want a place in.');
            }
            $id = ($open->firstWhere('id', (int) $intakeId) ?? throw new BooksException('That intake is not open for enrolment.'))->id;
        }
        if (WaitlistEntry::where('offering_id', $o->id)->where('user_id', $u->id)->whereIn('status', ['waiting', 'offered'])->exists()) {
            throw new BooksException('You are on the waiting list already.');
        }
        $left = $this->room($o, $id, $u->id);
        if ($left === null || $left > 0) {
            throw new BooksException('There is room: you can enrol now.');
        }

        return WaitlistEntry::create(['offering_id' => $o->id, 'intake_id' => $id, 'user_id' => $u->id, 'status' => 'waiting']);
    }

    public function leave(Offering $o, User $u): void
    {
        if (self::installed()) {
            WaitlistEntry::where('offering_id', $o->id)->where('user_id', $u->id)->whereIn('status', ['waiting', 'offered'])->update(['status' => 'removed']);
            $this->fill($o);
        }
    }

    private function holdHours(): int
    {
        return max(1, (int) (CourseSettings::all()['waitlist_hold_hours'] ?? 48));
    }

    private function offer(WaitlistEntry $w, Offering $o): WaitlistEntry
    {
        $w->update(['status' => 'offered', 'offered_at' => now(), 'offer_expires_at' => now()->addHours($this->holdHours())]);
        $run = $w->intake_id ? Intake::whereKey($w->intake_id)->value('name') : null;
        $this->notices->waitlistOffered($w->fresh(), $o, $run);

        return $w->fresh();
    }

    /** Offer free places to the people waiting, first come first served. Never raises. @return int offers made */
    public function fill(Offering $o): int
    {
        $n = 0;
        try {
            if (! self::installed() || $o->status !== 'published') {
                return 0;
            }
            foreach (WaitlistEntry::where('offering_id', $o->id)->where('status', 'waiting')->orderBy('id')->get() as $w) {
                if ($w->intake_id && ! $this->openIntakes($o)->contains('id', $w->intake_id)) {
                    continue;
                }
                $left = $this->room($o, $w->intake_id, $w->user_id);
                if ($left !== null && $left < 1) {
                    continue;
                }
                $this->offer($w, $o);
                $n++;
            }
        } catch (\Throwable $e) {
            report($e);
        }

        return $n;
    }

    /** Offers that ran out pass to the next in line. Part of the hourly sweep. @return array{expired: int, offered: int} */
    public function sweep(?Carbon $now = null): array
    {
        if (! self::installed()) {
            return ['expired' => 0, 'offered' => 0];
        }
        $now = $now ?? now();
        $expired = 0;
        foreach (WaitlistEntry::where('status', 'offered')->where('offer_expires_at', '<=', $now)->get() as $w) {
            $w->update(['status' => 'expired']);
            if ($o = Offering::find($w->offering_id)) {
                $this->notices->waitlistExpired($w, $o);
            }
            $expired++;
        }
        $offered = 0;
        foreach (WaitlistEntry::whereIn('status', ['waiting'])->distinct()->pluck('offering_id') as $oid) {
            if ($o = Offering::find($oid)) {
                $offered += $this->fill($o);
            }
        }

        return ['expired' => $expired, 'offered' => $offered];
    }

    /** Staff give the first free place to a named person on the list now. */
    public function offerNow(Offering $o, WaitlistEntry $w): WaitlistEntry
    {
        if ($w->status !== 'waiting') {
            throw new BooksException('Only someone who is waiting can be offered a place.');
        }
        $left = $this->room($o, $w->intake_id, $w->user_id);
        if ($left !== null && $left < 1) {
            throw new BooksException('There is no free place to offer.');
        }

        return $this->offer($w, $o);
    }

    public function remove(WaitlistEntry $w): void
    {
        $w->update(['status' => 'removed']);
        if ($o = Offering::find($w->offering_id)) {
            $this->fill($o);
        }
    }

    /** @return array<int, array<string, mixed>> the list for staff, in order */
    public function waitlist(Offering $o): array
    {
        if (! self::installed()) {
            return [];
        }
        $rows = WaitlistEntry::where('offering_id', $o->id)->whereIn('status', ['waiting', 'offered'])->orderBy('id')->get();
        $names = User::whereIn('id', $rows->pluck('user_id'))->pluck('name', 'id');
        $runs = Intake::whereIn('id', $rows->pluck('intake_id')->filter())->pluck('name', 'id');

        return $rows->values()->map(fn (WaitlistEntry $w, int $i) => ['id' => $w->id, 'position' => $i + 1, 'student' => $names[$w->user_id] ?? 'Student', 'intake' => $runs[$w->intake_id] ?? null, 'status' => $w->status,
            'since' => $w->created_at?->toIso8601String(), 'offer_expires_at' => $w->offer_expires_at?->toIso8601String()])->all();
    }

    // ── intakes ──────────────────────────────────────────────────────────

    /** @return array<int, array<string, mixed>> */
    public function intakes(Offering $o): array
    {
        if (! self::installed()) {
            return [];
        }

        return Intake::where('offering_id', $o->id)->orderBy('starts_on')->orderBy('id')->get()->map(fn (Intake $i) => $this->row($o, $i))->all();
    }

    private function row(Offering $o, Intake $i): array
    {
        $left = $this->room($o, $i->id);

        return ['id' => $i->id, 'name' => $i->name, 'starts_on' => $i->starts_on?->toDateString(), 'ends_on' => $i->ends_on?->toDateString(), 'enrol_until' => $i->enrol_until?->toDateString(), 'capacity' => $i->capacity, 'status' => $i->status,
            'enrolled' => $this->taken($o, $i->id), 'waiting' => WaitlistEntry::where('offering_id', $o->id)->where('intake_id', $i->id)->whereIn('status', ['waiting', 'offered'])->count(), 'places_left' => $left,
            'open' => $i->status === 'open' && (! $i->enrol_until || $i->enrol_until->copy()->startOfDay()->gte($this->today()))];
    }

    private function date(mixed $v, string $what): ?Carbon
    {
        if ($v === null || $v === '') {
            return null;
        }
        try {
            return Carbon::parse((string) $v)->startOfDay();
        } catch (\Throwable) {
            throw new BooksException("Choose a valid {$what}.");
        }
    }

    /** @param array<string, mixed> $d */
    public function save(Offering $o, array $d, ?Intake $i = null): Intake
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 160_courses_teaching.sql first.');
        }
        $name = trim((string) ($d['name'] ?? $i?->name ?? ''));
        if ($name === '') {
            throw new BooksException('Give the intake a name, for example "January 2027".');
        }
        $get = fn (string $k) => array_key_exists($k, $d) ? $d[$k] : ($i?->{$k});
        $starts = $this->date($get('starts_on'), 'start date');
        $ends = $this->date($get('ends_on'), 'end date');
        $until = $this->date($get('enrol_until'), 'last day to enrol');
        if ($starts && $ends && $ends->lt($starts)) {
            throw new BooksException('The intake cannot end before it starts.');
        }
        if ($until && $ends && $until->gt($ends)) {
            throw new BooksException('Enrolment must close by the day the intake ends.');
        }
        $cap = $get('capacity');
        $cap = $cap === null || $cap === '' ? null : (int) $cap;
        if ($cap !== null && ($cap < 1 || $cap > 5000)) {
            throw new BooksException('Places are between 1 and 5000 (or empty for no limit).');
        }
        if ($cap !== null && $i && $cap < $this->taken($o, $i->id)) {
            throw new BooksException('There are more students in this intake than that.');
        }
        $status = (string) ($d['status'] ?? $i?->status ?? 'open');
        if (! in_array($status, ['open', 'closed'], true)) {
            throw new BooksException('An intake is open or closed.');
        }
        $row = ['offering_id' => $o->id, 'name' => mb_substr($name, 0, 120), 'starts_on' => $starts?->toDateString(), 'ends_on' => $ends?->toDateString(), 'enrol_until' => $until?->toDateString(), 'capacity' => $cap, 'status' => $status];
        $i = $i ? tap($i)->update($row) : Intake::create($row);
        $this->fill($o);

        return $i->fresh();
    }

    public function delete(Offering $o, Intake $i): void
    {
        if (Enrolment::where('intake_id', $i->id)->exists() || WaitlistEntry::where('intake_id', $i->id)->whereIn('status', ['waiting', 'offered'])->exists()) {
            throw new BooksException('Students or people waiting are in this intake: close it instead.');
        }
        $i->delete();
    }

    /** What the offering's page shows: the runs that can be joined with their places, and this person's place on the list. @return array<string, mixed> */
    public function publicView(Offering $o, ?User $u): array
    {
        if (! self::installed()) {
            return ['intakes' => [], 'has_intakes' => false, 'waitlist' => null];
        }
        $open = $this->openIntakes($o);
        $mine = $u ? WaitlistEntry::where('offering_id', $o->id)->where('user_id', $u->id)->whereIn('status', ['waiting', 'offered'])->first() : null;
        $pos = null;
        if ($mine) {
            $pos = 1 + WaitlistEntry::where('offering_id', $o->id)->whereIn('status', ['waiting', 'offered'])->where('id', '<', $mine->id)->when($mine->intake_id, fn ($q) => $q->where('intake_id', $mine->intake_id))->count();
        }

        return ['has_intakes' => Intake::where('offering_id', $o->id)->exists(),
            'intakes' => $open->map(fn (Intake $i) => ['id' => $i->id, 'name' => $i->name, 'starts_on' => $i->starts_on?->toDateString(), 'ends_on' => $i->ends_on?->toDateString(), 'enrol_until' => $i->enrol_until?->toDateString(), 'places_left' => $this->room($o, $i->id, $u?->id)])->all(),
            'waitlist' => $mine ? ['status' => $mine->status, 'intake_id' => $mine->intake_id, 'position' => $pos, 'offer_expires_at' => $mine->offer_expires_at?->toIso8601String()] : null];
    }
}
