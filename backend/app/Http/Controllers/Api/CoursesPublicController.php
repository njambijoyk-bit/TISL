<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Courses\Enrolment;
use App\Models\Courses\Fee;
use App\Models\Courses\Lesson;
use App\Models\Courses\LiveSession;
use App\Models\Courses\Offering;
use App\Models\User;
use App\Services\Courses\CourseAccess;
use App\Services\Courses\Curriculum;
use App\Services\Courses\EnrolmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** The public catalogue and the page of an offering. No sign-in to look; a signed-in visitor also sees whether they have access or an enrolment. Only published offerings are ever shown, and paid content stays locked. */
class CoursesPublicController extends Controller
{
    public function __construct(private Curriculum $curriculum, private CourseAccess $access, private EnrolmentService $enrolments)
    {
    }

    private function ready(): bool
    {
        return CourseAccess::installed();
    }

    /** The teacher as the public may see them: a public chef profile if there is one, else just the name. @return array{name: string, title: ?string, bio: ?string, photo: ?string}|null */
    private function teacher(Offering $o): ?array
    {
        if (! $o->instructor_user_id) {
            return null;
        }
        if (Schema::hasTable('menus_chefs') && ($c = DB::table('menus_chefs')->where('user_id', $o->instructor_user_id)->where('is_public', true)->where('is_active', true)->first())) {
            return ['name' => $c->display_name, 'title' => $c->title, 'bio' => $c->bio, 'photo' => $c->photo];
        }
        $name = User::whereKey($o->instructor_user_id)->value('name');

        return $name ? ['name' => $name, 'title' => null, 'bio' => null, 'photo' => null] : null;
    }

    /** @return array<string, mixed> */
    private function card(Offering $o, array $fees, array $minutes, array $nextLive): array
    {
        $required = collect($fees[$o->id] ?? [])->where('is_optional', false);
        $t = $this->teacher($o);

        return ['id' => $o->id, 'slug' => $o->slug, 'kind' => $o->kind, 'kind_label' => Offering::KINDS[$o->kind] ?? $o->kind, 'title' => $o->title, 'summary' => $o->summary, 'cover' => $o->cover, 'category' => $o->category,
            'skill_level' => $o->skill_level, 'level_label' => Offering::LEVELS[$o->skill_level] ?? $o->skill_level, 'delivery' => $o->delivery, 'delivery_label' => Offering::DELIVERY[$o->delivery] ?? $o->delivery, 'tags' => $o->tags ?? [],
            'teacher' => $t['name'] ?? null, 'lessons' => (int) ($o->lessons_count ?? 0), 'minutes' => $minutes[$o->id] ?? 0, 'free' => $required->isEmpty(), 'price_from' => round((float) $required->sum('amount'), 2),
            'next_live' => $nextLive[$o->id] ?? null];
    }

    private function feeMap(array $ids): array
    {
        if (! Schema::hasTable('course_fees')) {
            return [];
        }

        return Fee::whereIn('offering_id', $ids)->where('is_active', true)->get()->groupBy('offering_id')->map(fn ($g) => $g->map(fn (Fee $f) => ['amount' => (float) $f->amount, 'is_optional' => (bool) $f->is_optional])->all())->all();
    }

    public function index(Request $request): JsonResponse
    {
        if (! $this->ready()) {
            return response()->json(['ready' => false, 'offerings' => [], 'facets' => ['kinds' => [], 'categories' => [], 'levels' => []], 'total' => 0]);
        }
        $q = Offering::query()->where('status', 'published')->withCount('lessons');
        foreach (['kind' => 'kind', 'category' => 'category', 'level' => 'skill_level', 'delivery' => 'delivery'] as $param => $col) {
            if ($request->filled($param)) {
                $q->where($col, (string) $request->query($param));
            }
        }
        if ($request->filled('tag')) {
            $tag = str_replace(['%', '_', '"'], '', (string) $request->query('tag'));
            $q->where('tags', 'like', '%"'.$tag.'"%');
        }
        if ($request->filled('q')) {
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], trim((string) $request->query('q'))).'%';
            $q->where(fn ($w) => $w->where('title', 'like', $like)->orWhere('summary', 'like', $like)->orWhere('category', 'like', $like));
        }
        $facetBase = Offering::query()->where('status', 'published');
        $facets = ['kinds' => (clone $facetBase)->selectRaw('kind, count(*) as n')->groupBy('kind')->pluck('n', 'kind'), 'levels' => (clone $facetBase)->selectRaw('skill_level, count(*) as n')->groupBy('skill_level')->pluck('n', 'skill_level'),
            'categories' => (clone $facetBase)->whereNotNull('category')->selectRaw('category, count(*) as n')->groupBy('category')->orderBy('category')->pluck('n', 'category')];
        $total = (clone $q)->count();
        $page = max(1, (int) $request->query('page', 1));
        $rows = $q->orderBy('title')->forPage($page, 12)->get();
        $ids = $rows->pluck('id')->all();
        $minutes = Lesson::whereIn('offering_id', $ids)->selectRaw('offering_id, sum(coalesce(duration_minutes, 0)) as m')->groupBy('offering_id')->pluck('m', 'offering_id')->map(fn ($m) => (int) $m)->all();
        $next = LiveSession::whereIn('offering_id', $ids)->where('starts_at', '>', now())->selectRaw('offering_id, min(starts_at) as s')->groupBy('offering_id')->pluck('s', 'offering_id')->map(fn ($s) => \Illuminate\Support\Carbon::parse($s)->toIso8601String())->all();
        $fees = $this->feeMap($ids);

        return response()->json(['ready' => true, 'offerings' => $rows->map(fn (Offering $o) => $this->card($o, $fees, $minutes, $next))->values(), 'facets' => $facets, 'total' => $total, 'page' => $page, 'per_page' => 12,
            'kinds' => Offering::KINDS, 'levels' => Offering::LEVELS]);
    }

    public function show(Request $request, string $slug): JsonResponse
    {
        abort_unless($this->ready(), 404);
        $o = Offering::where('slug', $slug)->where('status', 'published')->withCount('lessons')->firstOrFail();
        $user = $request->user('sanctum');
        $fees = Schema::hasTable('course_fees') ? Fee::where('offering_id', $o->id)->where('is_active', true)->orderBy('sort_order')->orderBy('id')->get() : collect();
        $minutes = (int) Lesson::where('offering_id', $o->id)->sum('duration_minutes');
        $next = LiveSession::where('offering_id', $o->id)->where('starts_at', '>', now())->min('starts_at');
        $enrolment = $user && EnrolmentService::installed() ? Enrolment::where('offering_id', $o->id)->where('student_user_id', $user->id)->whereIn('status', ['pending', 'active', 'completed'])->orderByDesc('id')->first() : null;
        $held = EnrolmentService::installed() ? Enrolment::where('offering_id', $o->id)->whereIn('status', ['pending', 'active', 'completed'])->count() : 0;
        $left = $o->capacity ? max(0, (int) $o->capacity - $held) : null;
        $has = $user ? $this->access->can($user, $o) : false;
        $feeRows = $fees->map(fn (Fee $f) => ['id' => $f->id, 'kind' => $f->kind, 'kind_label' => Fee::KINDS[$f->kind] ?? $f->kind, 'name' => $f->name, 'amount' => (float) $f->amount, 'is_optional' => (bool) $f->is_optional, 'once_per_student' => (bool) $f->once_per_student])->values();
        $outline = $this->curriculum->outline($o, $user);

        return response()->json(['offering' => $this->card($o, [$o->id => $feeRows->all()], [$o->id => $minutes], [$o->id => $next ? \Illuminate\Support\Carbon::parse($next)->toIso8601String() : null]) + [
            'body' => $o->body, 'free_preview' => $o->free_preview, 'access_days' => $o->access_days, 'certificate' => $o->certificate, 'min_attendance_pct' => $o->min_attendance_pct, 'capacity_left' => $left,
            'plan' => ['deposit_pct' => $o->deposit_pct !== null ? (float) $o->deposit_pct : null, 'instalments' => $o->instalments, 'instalment_days' => $o->instalment_days ?? 30, 'grant_on' => $o->grant_on ?? 'paid', 'refund_days' => $o->refund_days],
            'teacher_profile' => $this->teacher($o)], 'fees' => $feeRows, 'outline' => $outline,
            'me' => ['signed_in' => (bool) $user, 'has_access' => $has, 'enrolment' => $enrolment ? $this->enrolments->row($enrolment, false) : null,
                'can_enrol' => EnrolmentService::installed() && ! $enrolment && ($left === null || $left > 0)]]);
    }
}
