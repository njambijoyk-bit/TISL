<?php

namespace App\Services\Courses;

use App\Models\Courses\Attempt;
use App\Models\Courses\Certificate;
use App\Models\Courses\ClassSession;
use App\Models\Courses\Enrolment;
use App\Models\Courses\Intake;
use App\Models\Courses\Offering;
use App\Models\Courses\Progress;
use App\Models\Courses\RegisterEntry;
use App\Models\Courses\WaitlistEntry;
use App\Models\Menus\Chef;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

/** The teacher's side: what needs doing across the offerings one teaches, and how each student is getting on. Read-only; a manager sees every offering, a teacher their own. */
class TeachingService
{
    public function __construct(private CourseAccess $access, private Learning $learning)
    {
    }

    /** @return \Illuminate\Support\Collection<int, Offering> */
    public function offeringsFor(User $u)
    {
        return Offering::where('status', '!=', 'archived')->orderBy('title')->get()->filter(fn (Offering $o) => $this->access->staffMay($u, $o))->values();
    }

    /** @return array<string, mixed> */
    public function dashboard(User $u): array
    {
        $offerings = $this->offeringsFor($u);
        $ids = $offerings->pluck('id');
        $enr = Schema::hasTable('course_enrolments') ? Enrolment::whereIn('offering_id', $ids)->whereIn('status', ['active', 'completed'])->get()->groupBy('offering_id') : collect();
        $toMark = Schema::hasTable('course_attempts') ? Attempt::whereIn('offering_id', $ids)->where('status', 'submitted')->selectRaw('offering_id, count(*) c')->groupBy('offering_id')->pluck('c', 'offering_id') : collect();
        $excuses = Schema::hasTable('course_register') ? RegisterEntry::whereIn('offering_id', $ids)->where('status', 'asked')->selectRaw('offering_id, count(*) c')->groupBy('offering_id')->pluck('c', 'offering_id') : collect();
        $waiting = IntakeService::installed() ? WaitlistEntry::whereIn('offering_id', $ids)->whereIn('status', ['waiting', 'offered'])->selectRaw('offering_id, count(*) c')->groupBy('offering_id')->pluck('c', 'offering_id') : collect();
        $next = Schema::hasTable('course_sessions') ? ClassSession::whereIn('offering_id', $ids)->where('status', 'scheduled')->where('ends_at', '>', now())->orderBy('starts_at')->get()->groupBy('offering_id')->map(fn ($g) => $g->first()) : collect();
        $unmarked = Schema::hasTable('course_sessions') ? $this->unmarked($ids->all()) : collect();
        $att = app(CourseAttendance::class);

        $rows = $offerings->map(function (Offering $o) use ($enr, $toMark, $excuses, $waiting, $next, $unmarked, $att) {
            $students = $enr->get($o->id, collect());
            $behind = 0;
            if ($o->min_attendance_pct && CourseAttendance::installed()) {
                foreach ($students->where('status', 'active') as $e) {
                    $behind += in_array($att->standing((int) $e->student_user_id, $o)['state'], ['at_risk', 'failed'], true) ? 1 : 0;
                }
            }

            return ['id' => $o->id, 'title' => $o->title, 'kind' => $o->kind, 'status' => $o->status, 'students' => $students->count(), 'completed' => $students->where('status', 'completed')->count(),
                'quizzes_to_mark' => (int) ($toMark[$o->id] ?? 0), 'excuses_waiting' => (int) ($excuses[$o->id] ?? 0), 'registers_to_take' => (int) ($unmarked[$o->id] ?? 0), 'behind_on_attendance' => $behind, 'waiting_list' => (int) ($waiting[$o->id] ?? 0),
                'next_class' => isset($next[$o->id]) ? ['title' => $next[$o->id]->title, 'starts_at' => $next[$o->id]->starts_at->toIso8601String()] : null];
        })->values();

        return ['offerings' => $rows->all(), 'totals' => ['students' => $rows->sum('students'), 'quizzes_to_mark' => $rows->sum('quizzes_to_mark'), 'excuses_waiting' => $rows->sum('excuses_waiting'), 'registers_to_take' => $rows->sum('registers_to_take')]];
    }

    /** Classes that have ended and have no register yet, per offering. @param array<int, int> $offeringIds */
    private function unmarked(array $offeringIds)
    {
        $past = ClassSession::whereIn('offering_id', $offeringIds)->where('status', 'scheduled')->whereNull('makeup_for_id')->where('ends_at', '<', now())->get(['id', 'offering_id']);
        $done = RegisterEntry::whereIn('session_id', $past->pluck('id'))->pluck('session_id')->unique()->all();

        return $past->reject(fn ($s) => in_array($s->id, $done, true))->groupBy('offering_id')->map->count();
    }

    /** @return array<int, array<string, mixed>> every student of an offering and how they are getting on */
    public function students(Offering $o): array
    {
        if (! Schema::hasTable('course_enrolments')) {
            return [];
        }
        $rows = Enrolment::where('offering_id', $o->id)->whereIn('status', ['pending', 'active', 'completed'])->orderBy('id')->limit(500)->get();
        $ids = $rows->pluck('student_user_id');
        $names = User::whereIn('id', $ids)->pluck('name', 'id');
        $last = Progress::where('offering_id', $o->id)->whereIn('user_id', $ids)->selectRaw('user_id, max(updated_at) t')->groupBy('user_id')->pluck('t', 'user_id');
        $runs = IntakeService::installed() ? Intake::where('offering_id', $o->id)->pluck('name', 'id') : collect();
        $quiz = Schema::hasTable('course_attempts') ? Attempt::where('offering_id', $o->id)->whereIn('user_id', $ids)->whereIn('status', ['submitted', 'marked'])->get()->groupBy('user_id') : collect();
        $certs = CertificateService::installed() ? Certificate::where('offering_id', $o->id)->where('status', 'issued')->pluck('number', 'user_id') : collect();
        $att = CourseAttendance::installed() && $o->min_attendance_pct ? app(CourseAttendance::class) : null;

        return $rows->map(function (Enrolment $e) use ($o, $names, $last, $runs, $quiz, $certs, $att) {
            $p = $this->learning->percent((int) $e->student_user_id, $o);
            $a = $att?->standing((int) $e->student_user_id, $o);
            $q = $quiz->get($e->student_user_id, collect());

            return ['enrolment_id' => $e->id, 'user_id' => $e->student_user_id, 'name' => $names[$e->student_user_id] ?? 'Student', 'number' => $e->number, 'status' => $e->status, 'status_label' => Enrolment::STATUSES[$e->status] ?? $e->status,
                'intake' => $runs[$e->intake_id ?? 0] ?? null, 'balance' => $e->balance(), 'progress_pct' => $p['percent'], 'lessons_done' => $p['done'], 'lessons_total' => $p['total'],
                'attendance_state' => $a['state'] ?? null, 'attendance_rate' => $a['rate'] ?? null, 'quiz_waiting' => $q->where('status', 'submitted')->count(), 'quiz_best' => $q->where('status', 'marked')->max(fn ($x) => (float) $x->score_pct),
                'last_active' => ($t = $last[$e->student_user_id] ?? null) ? \Illuminate\Support\Carbon::parse($t)->toIso8601String() : null, 'certificate' => $certs[$e->student_user_id] ?? null];
        })->values()->all();
    }

    /** Menus chefs marked as instructors, who can be chosen as the teacher of an offering. @return array<int, array{user_id: int, name: string, title: ?string}> */
    public function instructors(): array
    {
        if (! Schema::hasTable('menus_chefs')) {
            return [];
        }

        return Chef::where('is_instructor', true)->where('is_active', true)->whereNotNull('user_id')->orderBy('display_name')->get()->map(fn (Chef $c) => ['user_id' => (int) $c->user_id, 'name' => $c->display_name, 'title' => $c->title])->all();
    }
}
