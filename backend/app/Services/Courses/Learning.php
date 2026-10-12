<?php

namespace App\Services\Courses;

use App\Models\Courses\Access;
use App\Models\Courses\ClassSession;
use App\Models\Courses\Enrolment;
use App\Models\Courses\Lesson;
use App\Models\Courses\LiveSession;
use App\Models\Courses\Offering;
use App\Models\Courses\Progress;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

/**
 * The student's side: the library, the lesson player, progress. A lesson opens when the student has access, when its drip days have passed and, if the offering asks for it, when the lessons before it are done.
 * Progress is a record per student and lesson; the percentage counts the lessons marked as required. Finishing every required lesson of a fully paid enrolment marks the enrolment completed.
 */
class Learning
{
    public function __construct(private Curriculum $curriculum, private CourseAccess $access, private LiveLinks $links)
    {
    }

    public static function installed(): bool
    {
        return CourseAccess::installed() && Schema::hasTable('course_progress');
    }

    /** The lessons in teaching order: each section's lessons, then the ones outside any section. @return Collection<int, Lesson> */
    public function sequence(Offering $o): Collection
    {
        $lessons = $o->lessons()->get()->groupBy(fn ($l) => $l->section_id ?? 0);
        $seq = collect();
        foreach ($o->sections()->get() as $s) {
            $seq = $seq->merge($lessons[$s->id] ?? []);
        }

        return $seq->merge($lessons[0] ?? [])->values();
    }

    /** @return array{done: int, total: int, percent: int} */
    public function percent(int $userId, Offering $o): array
    {
        $required = $this->sequence($o)->where('is_required', true)->pluck('id');
        if ($required->isEmpty()) {
            return ['done' => 0, 'total' => 0, 'percent' => 0];
        }
        $done = Progress::where('user_id', $userId)->where('status', 'done')->whereIn('lesson_id', $required)->count();

        return ['done' => $done, 'total' => $required->count(), 'percent' => (int) floor($done / $required->count() * 100)];
    }

    /** The first required lesson before this one that is not done, when the offering asks for lessons in order. */
    private function blockedBy(Offering $o, Lesson $l, Collection $seq, array $done): ?Lesson
    {
        if (! ($o->in_order ?? false)) {
            return null;
        }
        foreach ($seq as $x) {
            if ($x->id === $l->id) {
                return null;
            }
            if ($x->is_required && ! isset($done[$x->id])) {
                return $x;
            }
        }

        return null;
    }

    /** @return array<int, Progress> by lesson id */
    private function progressMap(int $userId, int $offeringId): array
    {
        return Progress::where('user_id', $userId)->where('offering_id', $offeringId)->get()->keyBy('lesson_id')->all();
    }

    /** The student's library: what they may open, how far they are, where to resume, what is coming up. @return array<string, mixed> */
    public function library(User $u): array
    {
        if (! self::installed()) {
            return ['ready' => false, 'items' => [], 'on_hold' => []];
        }
        $grants = Access::where('user_id', $u->id)->whereNull('revoked_at')->get();
        $offerings = Offering::whereIn('id', $grants->pluck('offering_id'))->whereIn('status', ['published', 'archived'])->get()->keyBy('id');
        $items = [];
        foreach ($grants->groupBy('offering_id') as $oid => $gs) {
            $o = $offerings[$oid] ?? null;
            if (! $o) {
                continue;
            }
            $best = $gs->sortByDesc(fn (Access $a) => $a->ends_at ? $a->ends_at->timestamp : PHP_INT_MAX)->first();
            $active = $gs->contains(fn (Access $a) => $a->active());
            $p = $this->percent($u->id, $o);
            $next = LiveSession::where('offering_id', $o->id)->where('ends_at', '>', now())->orderBy('starts_at')->first();
            $last = Progress::where('user_id', $u->id)->where('offering_id', $o->id)->orderByDesc('updated_at')->first();
            $items[] = ['offering_id' => $o->id, 'slug' => $o->slug, 'title' => $o->title, 'kind' => $o->kind, 'kind_label' => Offering::KINDS[$o->kind] ?? $o->kind, 'cover' => $o->cover, 'state' => $active ? 'active' : 'ended',
                'ends_at' => $best->ends_at?->toIso8601String(), 'days_left' => $active && $best->ends_at ? max(0, (int) ceil(now()->diffInDays($best->ends_at, false))) : null, 'progress' => $p, 'attendance' => CourseAttendance::installed() && $o->min_attendance_pct ? app(CourseAttendance::class)->standing($u->id, $o) : null, 'last_lesson_id' => $last?->lesson_id,
                'next_live' => $next ? $this->links->publicView($next) : null,
                'certificate' => $o->certificate && CertificateService::installed() && ($cert = app(CertificateService::class)->current($u->id, $o->id)) ? app(CertificateService::class)->row($cert) : null];
        }
        usort($items, fn ($a, $b) => [$a['state'] === 'active' ? 0 : 1, $a['title']] <=> [$b['state'] === 'active' ? 0 : 1, $b['title']]);
        $hold = ! Schema::hasTable('course_enrolments') ? [] : Enrolment::where('student_user_id', $u->id)->where('access_paused', true)->where('status', 'active')->get()->map(fn (Enrolment $e) => ['enrolment' => $e->number, 'offering' => Offering::whereKey($e->offering_id)->value('title'),
            'slug' => Offering::whereKey($e->offering_id)->value('slug')])->values()->all();

        return ['ready' => true, 'items' => $items, 'on_hold' => $hold];
    }

    /** One offering as its student sees it: the outline with progress, locks and reasons, and where to resume. @return array<string, mixed> */
    public function player(User $u, Offering $o): array
    {
        if (! $this->access->can($u, $o)) {
            throw new BooksException('You do not have access to this yet.');
        }
        $staff = $this->access->staffMay($u, $o);
        $grant = $this->access->active($u->id, $o->id);
        $seq = $this->sequence($o);
        $prog = $this->progressMap($u->id, $o->id);
        $done = collect($prog)->filter(fn ($p) => $p->status === 'done')->all();
        $outline = $this->curriculum->outline($o, $u);
        $resume = null;
        $decorate = function (array $row) use ($u, $o, $seq, $prog, $done, $grant, &$resume) {
            $l = $seq->firstWhere('id', $row['id']);
            $p = $prog[$row['id']] ?? null;
            $row['status'] = $p?->status ?? 'none';
            $row['quiz'] = null;
            $row['position_seconds'] = $p?->position_seconds;
            $row['lock_reason'] = null;
            $row['opens_at'] = null;
            if ($row['locked']) {
                $row['lock_reason'] = 'drip';
                if ($l && $l->drip_days && $grant) {
                    $row['opens_at'] = $grant->starts_at->copy()->addDays((int) $l->drip_days)->toIso8601String();
                }
            } elseif ($l && ($by = $this->blockedBy($o, $l, $seq, $done))) {
                $row = ['id' => $row['id'], 'kind' => $row['kind'], 'kind_label' => $row['kind_label'], 'title' => $row['title'], 'section_id' => $row['section_id'], 'duration_minutes' => $row['duration_minutes'], 'drip_days' => $row['drip_days'],
                    'is_preview' => $row['is_preview'], 'is_required' => $row['is_required'], 'locked' => true, 'status' => $row['status'], 'position_seconds' => null, 'lock_reason' => 'order', 'opens_at' => null, 'after' => $by->title];
            }
            if (! $row['locked'] && $row['kind'] === 'quiz' && QuizService::installed()) {
                $row['quiz'] = app(QuizService::class)->info($u, $l);
            }
            if (! $row['locked'] && $row['status'] !== 'done' && $resume === null) {
                $resume = $row['id'];
            }

            return $row;
        };
        $sections = array_map(fn ($s) => ['id' => $s['id'], 'title' => $s['title'], 'lessons' => array_map($decorate, $s['lessons'])], $outline['sections']);
        $loose = array_map($decorate, $outline['loose']);
        $last = collect($prog)->sortByDesc(fn ($p) => $p->updated_at?->timestamp ?? 0)->first();

        return ['offering' => ['id' => $o->id, 'slug' => $o->slug, 'title' => $o->title, 'kind' => $o->kind, 'summary' => $o->summary, 'body' => $o->body, 'in_order' => (bool) ($o->in_order ?? false), 'certificate' => (bool) $o->certificate],
            'certificate' => $o->certificate && CertificateService::installed() && ($cert = app(CertificateService::class)->current($u->id, $o->id)) ? app(CertificateService::class)->row($cert) : null,
            'access' => ['staff_preview' => $staff && ! $grant, 'ends_at' => $grant?->ends_at?->toIso8601String(), 'days_left' => $grant?->ends_at ? max(0, (int) ceil(now()->diffInDays($grant->ends_at, false))) : null],
            'attendance' => CourseAttendance::installed() && ClassSession::where('offering_id', $o->id)->exists() ? app(CourseAttendance::class)->mine($u, $o) : null,
            'progress' => $this->percent($u->id, $o), 'sections' => $sections, 'loose' => $loose, 'resume_lesson_id' => $last && collect($sections)->pluck('lessons')->flatten(1)->merge($loose)->contains(fn ($r) => $r['id'] === $last->lesson_id && ! $r['locked'] && $r['status'] !== 'done') ? $last->lesson_id : $resume];
    }

    /** Is this lesson open to this person right now: access, drip, and any earlier required lesson done? @throws BooksException */
    public function assertLessonOpen(User $u, Lesson $l): void
    {
        $o = Offering::findOrFail($l->offering_id);
        if (! $this->access->canLesson($u, $o, $l)) {
            throw new BooksException('That lesson is not open to you yet.');
        }
        $done = Progress::where('user_id', $u->id)->where('offering_id', $o->id)->where('status', 'done')->get()->keyBy('lesson_id')->all();
        if ($by = $this->blockedBy($o, $l, $this->sequence($o), $done)) {
            throw new BooksException("Finish \"{$by->title}\" first.");
        }
    }

    /** A lesson is done because something other than the student's own button finished it (a passed quiz). */
    public function finishLesson(User $u, Lesson $l): void
    {
        $p = Progress::firstOrNew(['user_id' => $u->id, 'lesson_id' => $l->id]);
        $p->offering_id = $l->offering_id;
        $p->started_at ??= now();
        if ($p->status !== 'done') {
            $p->status = 'done';
            $p->done_at = now();
        }
        $p->save();
        if ($o = Offering::find($l->offering_id)) {
            $this->tryComplete($u, $o);
        }
    }

    /**
     * Note where a student is in a lesson: opened, the place in a video, or done. Done stays done. Refused for a lesson that is not open to them (no access, drip, or an earlier required lesson not done).
     *
     * @param string $status started|done
     * @return array{status: string, progress: array, completed: bool}
     */
    public function mark(User $u, Lesson $l, string $status, ?int $position = null): array
    {
        if (! in_array($status, ['started', 'done'], true)) {
            throw new BooksException('Say whether the lesson is started or done.');
        }
        $o = Offering::findOrFail($l->offering_id);
        $this->assertLessonOpen($u, $l);
        if ($l->kind === 'quiz' && $status === 'done') {
            throw new BooksException('Pass the quiz to finish this lesson.');
        }
        if ($position !== null && ($position < 0 || $position > 864000)) {
            throw new BooksException('That place in the video is not valid.');
        }
        $p = Progress::firstOrNew(['user_id' => $u->id, 'lesson_id' => $l->id]);
        $p->offering_id = $o->id;
        $p->started_at ??= now();
        if ($position !== null) {
            $p->position_seconds = $position;
        }
        if ($status === 'done' && $p->status !== 'done') {
            $p->status = 'done';
            $p->done_at = now();
        } elseif (! $p->exists) {
            $p->status = 'started';
        }
        $p->save();
        $progress = $this->percent($u->id, $o);

        return ['status' => $p->status, 'progress' => $progress, 'completed' => $this->tryComplete($u, $o)];
    }

    /**
     * Is the offering finished for this student? Every required lesson done (when it has any) and the attendance asked for met. A fully paid, running enrolment then becomes completed.
     * Called when a lesson is marked done and when the register changes.
     */
    public function tryComplete(User $u, Offering $o): bool
    {
        $p = $this->percent($u->id, $o);
        $attendance = CourseAttendance::installed() && $o->min_attendance_pct;
        if ($p['total'] === 0 && ! $attendance) {
            return false;
        }
        if ($p['total'] > 0 && $p['percent'] < 100) {
            return false;
        }
        if ($attendance && ! app(CourseAttendance::class)->meets($u->id, $o)) {
            return false;
        }

        return $this->complete($u, $o);
    }

    /** Every required lesson is done: a fully paid, running enrolment becomes completed. */
    private function complete(User $u, Offering $o): bool
    {
        if (! Schema::hasTable('course_enrolments')) {
            return false;
        }
        $e = Enrolment::where('offering_id', $o->id)->where('student_user_id', $u->id)->where('status', 'active')->first();
        if (! $e || $e->balance() > 0.009) {
            return false;
        }
        $e->update(['status' => 'completed']);
        app(CertificateService::class)->issueFor($e->fresh());

        return true;
    }

    /** A calendar file for a live session, for someone who may open the offering. It carries the course page, never the join link. */
    public function ics(User $u, LiveSession $l): string
    {
        $o = Offering::findOrFail($l->offering_id);
        if (! $this->access->can($u, $o)) {
            throw new BooksException('You do not have access to this.');
        }
        $esc = fn (string $s) => str_replace(["\\", ';', ',', "\r\n", "\n"], ['\\\\', '\;', '\\,', '\\n', '\\n'], $s);
        $fmt = fn (Carbon $c) => $c->copy()->utc()->format('Ymd\THis\Z');
        $page = rtrim((string) config('app.frontend_url'), '/').'/learn/my/'.$o->slug;
        $lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TISL//Courses//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', 'UID:course-live-'.$l->id.'@tisl', 'DTSTAMP:'.$fmt(now()), 'DTSTART:'.$fmt($l->starts_at), 'DTEND:'.$fmt($l->ends_at),
            'SUMMARY:'.$esc($o->title), 'DESCRIPTION:'.$esc('Live class. Open your course page to join: '.$page), 'URL:'.$page, 'END:VEVENT', 'END:VCALENDAR'];

        return implode("\r\n", $lines)."\r\n";
    }
}
