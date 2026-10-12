<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Courses\Access;
use App\Models\Courses\CourseFile;
use App\Models\Courses\Lesson;
use App\Models\Courses\LiveSession;
use App\Models\Courses\Offering;
use App\Models\Courses\Section;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Books\BooksException;
use App\Services\Courses\CourseAccess;
use App\Services\Courses\CourseFiles;
use App\Services\Courses\CourseSettings;
use App\Services\Courses\Curriculum;
use App\Services\Courses\OfferingEditor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Courses → offerings, their lessons, files and who has access. Managers see and change everything; a teacher sees and changes only the offerings they teach. */
class CoursesController extends Controller
{
    public function __construct(private OfferingEditor $editor, private Curriculum $curriculum, private CourseAccess $access, private CourseFiles $files, private Authorizer $authz)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(CourseAccess::installed(), 422, 'Run database script 152_courses.sql first.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function manages(Request $request): bool
    {
        return $this->authz->allows($request->user(), 'courses.manage');
    }

    /** An offering the person may change: a manager any, a teacher their own. */
    private function editable(Request $request, int $id): Offering
    {
        $o = Offering::findOrFail($id);
        abort_unless($this->access->staffMay($request->user(), $o), 403, 'You can only change the offerings you teach.');

        return $o;
    }

    public function meta(): JsonResponse
    {
        return response()->json(['ready' => CourseAccess::installed(), 'kinds' => Offering::KINDS, 'levels' => Offering::LEVELS, 'delivery' => Offering::DELIVERY, 'statuses' => Offering::STATUSES,
            'lesson_kinds' => Lesson::KINDS, 'providers' => LiveSession::PROVIDERS, 'sources' => Access::SOURCES, 'allowed_files' => CourseFiles::ALLOWED, 'settings' => CourseSettings::all(), 'timezone' => config('app.timezone', 'Africa/Nairobi'),
            'locations' => \App\Models\Location::orderBy('name')->get(['id', 'name']), 'instructors' => app(\App\Services\Courses\TeachingService::class)->instructors(), 'can_manage' => $this->authz->allows(request()->user(), 'courses.manage'), 'can_grant' => $this->authz->allows(request()->user(), 'courses.grant')]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        $d = $request->validate(['live_open_minutes' => 'sometimes|integer', 'live_grace_minutes' => 'sometimes|integer', 'download_minutes' => 'sometimes|integer', 'max_file_mb' => 'sometimes|integer', 'default_access_days' => 'sometimes|nullable|integer', 'waitlist_hold_hours' => 'sometimes|integer', 'cert_signatory' => 'sometimes|nullable|string|max:80', 'cert_signatory_title' => 'sometimes|nullable|string|max:80']);

        return $this->guard(fn () => response()->json(['message' => 'Courses settings saved.', 'settings' => CourseSettings::save($d, $request->user()?->id)]));
    }

    private function row(Offering $o, $names = null): array
    {
        $names ??= User::whereKey($o->instructor_user_id)->pluck('name', 'id');

        return ['id' => $o->id, 'kind' => $o->kind, 'kind_label' => Offering::KINDS[$o->kind] ?? $o->kind, 'title' => $o->title, 'slug' => $o->slug, 'summary' => $o->summary, 'body' => $o->body, 'cover' => $o->cover, 'category' => $o->category,
            'skill_level' => $o->skill_level, 'tags' => $o->tags ?? [], 'instructor_user_id' => $o->instructor_user_id, 'instructor' => $names[$o->instructor_user_id] ?? null, 'delivery' => $o->delivery, 'location_id' => $o->location_id,
            'status' => $o->status, 'status_label' => Offering::STATUSES[$o->status] ?? $o->status, 'free_preview' => $o->free_preview, 'access_days' => $o->access_days, 'min_attendance_pct' => $o->min_attendance_pct, 'certificate' => $o->certificate, 'cert_valid_months' => $o->cert_valid_months ?? null,
            'lessons' => (int) ($o->lessons_count ?? $o->lessons()->count()), 'people' => (int) ($o->people_count ?? 0),
            'deposit_pct' => $o->deposit_pct !== null ? (float) $o->deposit_pct : null, 'instalments' => $o->instalments, 'instalment_days' => $o->instalment_days ?? 30, 'grant_on' => $o->grant_on ?? 'paid', 'grace_days' => $o->grace_days ?? 7,
            'refund_days' => $o->refund_days, 'capacity' => $o->capacity, 'in_order' => (bool) ($o->in_order ?? false)];
    }

    public function index(Request $request): JsonResponse
    {
        if (! CourseAccess::installed()) {
            return response()->json(['ready' => false, 'offerings' => []]);
        }
        $q = Offering::query()->withCount('lessons')->orderByRaw("CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END")->orderBy('title');
        if (! $this->manages($request)) {
            $q->where('instructor_user_id', $request->user()->id);   // a teacher sees only what they teach
        }
        foreach (['kind', 'status'] as $f) {
            if ($request->filled($f)) {
                $q->where($f, (string) $request->query($f));
            }
        }
        if ($request->filled('q')) {
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], trim((string) $request->query('q'))).'%';
            $q->where(fn ($w) => $w->where('title', 'like', $like)->orWhere('category', 'like', $like));
        }
        $rows = $q->limit(300)->get();
        $people = Access::whereIn('offering_id', $rows->pluck('id'))->whereNull('revoked_at')->where(fn ($w) => $w->whereNull('ends_at')->orWhere('ends_at', '>', now()))->selectRaw('offering_id, count(distinct user_id) as n')->groupBy('offering_id')->pluck('n', 'offering_id');
        $names = User::whereIn('id', $rows->pluck('instructor_user_id')->filter())->pluck('name', 'id');

        return response()->json(['ready' => true, 'offerings' => $rows->map(function (Offering $o) use ($names, $people) { $o->people_count = $people[$o->id] ?? 0; return $this->row($o, $names); })->values()]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $o = Offering::findOrFail($id);
            abort_unless($this->access->staffMay($request->user(), $o), 403, 'You can only open the offerings you teach.');

            return response()->json(['offering' => $this->row($o), 'outline' => $this->curriculum->outline($o, $request->user()), 'files' => CourseFile::where('offering_id', $o->id)->orderByDesc('id')->get()->map(fn ($f) => $this->files->row($f))->values(),
                'sections' => Section::where('offering_id', $o->id)->orderBy('sort_order')->get(['id', 'title'])]);
        });
    }

    private function validated(Request $request): array
    {
        return $request->validate(['kind' => 'sometimes|string|max:10', 'title' => 'sometimes|string|max:160', 'summary' => 'sometimes|nullable|string|max:400', 'body' => 'sometimes|nullable|string|max:60000', 'cover' => 'sometimes|nullable|string|max:255',
            'category' => 'sometimes|nullable|string|max:80', 'skill_level' => 'sometimes|string|max:12', 'tags' => 'sometimes|nullable', 'instructor_user_id' => 'sometimes|nullable|integer', 'delivery' => 'sometimes|string|max:10',
            'location_id' => 'sometimes|nullable|integer', 'free_preview' => 'sometimes|boolean', 'access_days' => 'sometimes|nullable|integer', 'min_attendance_pct' => 'sometimes|nullable|integer', 'certificate' => 'sometimes|boolean', 'cert_valid_months' => 'sometimes|nullable|integer', 'in_order' => 'sometimes|boolean',
            'deposit_pct' => 'sometimes|nullable|numeric', 'instalments' => 'sometimes|nullable|integer', 'instalment_days' => 'sometimes|nullable|integer', 'grant_on' => 'sometimes|string|max:8', 'grace_days' => 'sometimes|nullable|integer',
            'refund_days' => 'sometimes|nullable|integer', 'capacity' => 'sometimes|nullable|integer']);
    }

    public function create(Request $request): JsonResponse
    {
        abort_unless($this->manages($request), 403, 'Only a course manager can add an offering.');
        $d = $this->validated($request);

        return $this->guard(fn () => response()->json(['message' => 'Saved.', 'offering' => $this->row($this->editor->save($d, null, $request->user()?->id))], 201));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $o = $this->editable($request, $id);
        $d = $this->validated($request);
        if (! $this->manages($request)) {
            unset($d['instructor_user_id']);   // a teacher can not hand their course to someone else
        }

        return $this->guard(fn () => response()->json(['message' => 'Saved.', 'offering' => $this->row($this->editor->save($d, $o))]));
    }

    /** publish | unpublish | archive | restore */
    public function status(Request $request, int $id, string $to): JsonResponse
    {
        $o = $this->editable($request, $id);
        abort_unless(in_array($to, ['publish', 'unpublish', 'archive', 'restore'], true), 404);
        abort_if(in_array($to, ['archive', 'restore'], true) && ! $this->manages($request), 403, 'Only a course manager can archive.');

        return $this->guard(fn () => response()->json(['message' => 'Done.', 'offering' => $this->row($this->editor->{$to}($o))]));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        abort_unless($this->manages($request), 403, 'Only a course manager can delete.');
        $o = Offering::findOrFail($id);

        return $this->guard(function () use ($o) { $this->editor->delete($o); return response()->json(['message' => 'Deleted.']); });
    }

    public function saveSection(Request $request, int $id, ?int $section = null): JsonResponse
    {
        $o = $this->editable($request, $id);
        $d = $request->validate(['title' => 'required|string|max:160']);

        return $this->guard(fn () => response()->json(['message' => 'Saved.', 'section' => $this->curriculum->saveSection($o, $d, $section ? Section::findOrFail($section) : null)]));
    }

    public function deleteSection(Request $request, int $id, int $section): JsonResponse
    {
        $o = $this->editable($request, $id);

        return $this->guard(function () use ($o, $section) { $this->curriculum->deleteSection($o, Section::findOrFail($section)); return response()->json(['message' => 'Section removed. Its lessons were kept.']); });
    }

    public function saveLesson(Request $request, int $id, ?int $lesson = null): JsonResponse
    {
        $o = $this->editable($request, $id);
        $d = $request->validate(['kind' => 'sometimes|string|max:8', 'title' => 'sometimes|string|max:160', 'section_id' => 'sometimes|nullable|integer', 'body' => 'sometimes|nullable|string|max:60000', 'video_url' => 'sometimes|nullable|string|max:500',
            'file_id' => 'sometimes|nullable|integer', 'duration_minutes' => 'sometimes|nullable|integer', 'drip_days' => 'sometimes|nullable|integer', 'is_preview' => 'sometimes|boolean', 'is_required' => 'sometimes|boolean', 'live' => 'sometimes|nullable|array',
            'live.starts_at' => 'nullable|string|max:40', 'live.ends_at' => 'nullable|string|max:40', 'live.timezone' => 'nullable|string|max:60', 'live.provider' => 'nullable|string|max:8', 'live.join_url' => 'nullable|string|max:500',
            'live.meeting_id' => 'nullable|string|max:60', 'live.passcode' => 'nullable|string|max:60', 'live.replay_url' => 'nullable|string|max:500', 'live.capacity' => 'nullable|integer']);

        return $this->guard(fn () => response()->json(['message' => 'Saved.', 'lesson' => $this->curriculum->saveLesson($o, $d, $lesson ? Lesson::findOrFail($lesson) : null)]));
    }

    public function deleteLesson(Request $request, int $id, int $lesson): JsonResponse
    {
        $o = $this->editable($request, $id);

        return $this->guard(function () use ($o, $lesson) { $this->curriculum->deleteLesson($o, Lesson::findOrFail($lesson)); return response()->json(['message' => 'Lesson removed.']); });
    }

    public function reorder(Request $request, int $id): JsonResponse
    {
        $o = $this->editable($request, $id);
        $d = $request->validate(['sections' => 'present|array|max:200', 'sections.*' => 'integer', 'lessons' => 'present|array|max:2000', 'lessons.*.id' => 'required|integer', 'lessons.*.section_id' => 'nullable|integer']);

        return $this->guard(function () use ($o, $d) { $this->curriculum->reorder($o, $d['sections'], $d['lessons']); return response()->json(['message' => 'Order saved.']); });
    }

    public function uploadFile(Request $request, int $id): JsonResponse
    {
        $o = $this->editable($request, $id);
        $request->validate(['file' => 'required|file']);

        return $this->guard(fn () => response()->json(['message' => 'File added.', 'file' => $this->files->row($this->files->store($request->file('file'), $o->id, $request->user()?->id))], 201));
    }

    public function deleteFile(Request $request, int $id, int $file): JsonResponse
    {
        $o = $this->editable($request, $id);
        $f = CourseFile::where('offering_id', $o->id)->findOrFail($file);

        return $this->guard(function () use ($f) { $this->files->remove($f); return response()->json(['message' => 'File removed.']); });
    }

    // ── who has access (courses.grant) ────────────────────────────────────

    public function accessList(Request $request, int $id): JsonResponse
    {
        $o = $this->editable($request, $id);

        return $this->guard(fn () => response()->json(['access' => $this->access->rows($o->id)]));
    }

    public function candidates(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        if (mb_strlen($q) < 2) {
            return response()->json(['users' => []]);
        }
        $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $q).'%';

        return response()->json(['users' => User::where(fn ($w) => $w->where('name', 'like', $like)->orWhere('email', 'like', $like))->orderBy('name')->limit(15)->get(['id', 'name', 'email'])]);
    }

    public function grant(Request $request, int $id): JsonResponse
    {
        $o = Offering::findOrFail($id);
        $d = $request->validate(['user_id' => 'required|integer', 'until' => 'nullable|date', 'note' => 'nullable|string|max:300']);

        return $this->guard(function () use ($request, $o, $d) {
            $until = ! empty($d['until']) ? \Illuminate\Support\Carbon::parse($d['until'], config('app.timezone', 'Africa/Nairobi'))->endOfDay() : null;
            $this->access->grant((int) $d['user_id'], $o->id, 'staff', 'user:'.$request->user()->id, $until, $d['note'] ?? null, $request->user()->id);

            return response()->json(['message' => 'Access given.', 'access' => $this->access->rows($o->id)], 201);
        });
    }

    public function revoke(Request $request, int $id, int $access): JsonResponse
    {
        $a = Access::where('offering_id', $id)->findOrFail($access);

        return $this->guard(function () use ($a, $id) { $this->access->revokeOne($a); return response()->json(['message' => 'Access ended.', 'access' => $this->access->rows($id)]); });
    }
}
