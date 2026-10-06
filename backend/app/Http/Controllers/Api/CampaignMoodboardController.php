<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CampaignMoodboard;
use App\Services\Books\BooksException;
use App\Services\Campaigns\CampaignAccess;
use App\Services\Campaigns\MoodboardApproval;
use App\Services\Campaigns\MoodboardPresets;
use App\Services\Campaigns\MoodboardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Moodboards, staff side. Admin, super admin and manager see and change every one; sales rep and finance their own, which go for approval. */
class CampaignMoodboardController extends Controller
{
    public function __construct(private MoodboardService $moods, private MoodboardApproval $approval) {}

    private function builder(Request $r): void
    {
        abort_unless(CampaignAccess::canBuild($r->user()), 403, 'You cannot work on moodboards.');
    }

    private function publisher(Request $r): void
    {
        abort_unless(CampaignAccess::canPublish($r->user()), 403, 'Only an admin, super admin or manager can do that.');
    }

    private function find(Request $r, int $id, bool $forEdit = false): CampaignMoodboard
    {
        $this->builder($r);
        $m = CampaignMoodboard::forStaff()->with('owner:id,name')->findOrFail($id);
        abort_unless(CampaignAccess::canPublish($r->user()) || (int) $m->owner_user_id === (int) $r->user()->id || $m->is_template, 403, 'That is not your moodboard.');
        if ($forEdit) {
            abort_unless($this->moods->canEdit($r->user(), $m), 403, 'You cannot change this moodboard while it is waiting for a decision.');
        }

        return $m;
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function row(CampaignMoodboard $m, ?Request $r = null, bool $full = false): array
    {
        $row = ['id' => $m->id, 'title' => $m->title, 'template_key' => $m->template_key, 'is_template' => $m->is_template, 'approval_status' => $m->approval_status, 'rejected_note' => $m->rejected_note,
            'status' => $m->status, 'source' => $m->source, 'owner_user_id' => $m->owner_user_id, 'owner_name' => $m->owner?->name, 'slug_path' => $m->slugPath(), 'filled' => count(array_filter($m->contents ?? [])), 'slots' => count($m->layout['slots'] ?? []), 'updated_at' => $m->updated_at?->toIso8601String()];
        if ($full) {
            $row += $this->moods->present($m) + ['raw_contents' => (object) ($m->contents ?? [])];
        }
        if ($r) {
            $u = $r->user();
            $mine = (int) $m->owner_user_id === (int) $u->id;
            $row += ['can_edit' => $this->moods->canEdit($u, $m), 'can_publish' => CampaignAccess::canPublish($u), 'can_decide' => CampaignAccess::canPublish($u) && $m->approval_status === 'pending' && ! $mine,
                'can_submit' => ! CampaignAccess::canPublish($u) && $mine && ! $m->is_template && in_array($m->approval_status, ['draft', 'rejected'], true), 'can_withdraw' => $mine && $m->approval_status === 'pending'];
        }

        return $row;
    }

    /** GET /admin/moodboards/presets: the six built-in layouts and the saved templates. */
    public function presets(Request $request): JsonResponse
    {
        $this->builder($request);
        $presets = collect(MoodboardPresets::all())->map(fn ($p, $k) => ['key' => $k, 'label' => $p['label'], 'description' => $p['description'], 'layout' => $p['layout']])->values();
        $templates = CampaignMoodboard::where('is_template', true)->orderByDesc('id')->get()->map(fn ($t) => ['id' => $t->id, 'title' => $t->title, 'layout' => $t->layout])->all();

        return response()->json(['presets' => $presets, 'templates' => $templates, 'fonts' => MoodboardPresets::FONTS, 'stickers' => MoodboardPresets::STICKERS]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->builder($request);
        $q = CampaignMoodboard::forStaff()->with('owner:id,name')->where('is_template', $request->boolean('templates'))->orderByDesc('id')
            ->when($request->boolean('trashed'), fn ($w) => $w->onlyTrashed())
            ->when($request->filled('approval'), fn ($w) => $w->where('approval_status', $request->query('approval')))
            ->when($request->filled('q'), fn ($w) => $w->where('title', 'like', '%' . $request->query('q') . '%'))
            ->when(! CampaignAccess::canPublish($request->user()) && (! $request->boolean('templates') || $request->boolean('trashed')), fn ($w) => $w->where('owner_user_id', $request->user()->id));
        $page = $q->paginate(min(60, max(10, $request->integer('per_page', 30))));
        $ids = [];
        foreach ($page->items() as $m) {
            $ids = array_merge($ids, array_filter(array_map(fn ($c) => $c['pin_id'] ?? null, $m->contents ?? [])));
        }
        $images = $this->moods->images($ids);
        $rows = collect($page->items())->map(fn ($m) => $this->row($m) + $this->moods->present($m, $images))->all();

        return response()->json(['data' => $rows, 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => $this->row($this->find($request, $id), $request, true)]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->builder($request);
        $d = $request->validate(['title' => ['required', 'string', 'max:160'], 'from' => ['required', 'string', 'max:40']]);

        return $this->guard(function () use ($request, $d) {
            $m = $this->moods->create($d['title'], $d['from'], $request->user());

            return response()->json(['message' => 'Moodboard started.', 'data' => $this->row($m->load('owner:id,name'), $request, true)], 201);
        });
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $m = $this->find($request, $id, true);
        abort_if($m->is_template && ! CampaignAccess::canPublish($request->user()), 403, 'Only an admin, super admin or manager can change a template.');
        $d = $request->validate(['title' => ['sometimes', 'string', 'max:160'], 'background' => ['sometimes', 'string', 'max:7'], 'contents' => ['sometimes', 'array']]);

        return $this->guard(function () use ($request, $m, $d) {
            $m = $this->moods->update($m, $d, $request->user());

            return response()->json(['message' => 'Moodboard saved.', 'data' => $this->row($m->load('owner:id,name'), $request, true)]);
        });
    }

    public function saveTemplate(Request $request, int $id): JsonResponse
    {
        $m = $this->find($request, $id);
        $d = $request->validate(['title' => ['required', 'string', 'max:160']]);

        return $this->guard(function () use ($request, $m, $d) {
            $t = $this->moods->saveAsTemplate($m, $d['title'], $request->user());

            return response()->json(['message' => 'Saved as a template. You can start new moodboards from it.', 'data' => ['id' => $t->id, 'title' => $t->title]], 201);
        });
    }

    private function flow(Request $request, int $id, callable $do, string $message, bool $publisherOnly = false): JsonResponse
    {
        if ($publisherOnly) {
            $this->publisher($request);
            $m = CampaignMoodboard::findOrFail($id);
        } else {
            $m = $this->find($request, $id);
        }

        return $this->guard(function () use ($request, $m, $do, $message) {
            $do($m);

            return response()->json(['message' => $message, 'data' => $this->row($m->fresh()->load('owner:id,name'), $request, true)]);
        });
    }

    public function submit(Request $request, int $id): JsonResponse
    {
        return $this->flow($request, $id, fn ($m) => $this->approval->submit($m, $request->user()), 'Sent for approval.');
    }

    public function withdraw(Request $request, int $id): JsonResponse
    {
        return $this->flow($request, $id, fn ($m) => $this->approval->withdraw($m, $request->user()), 'Taken back. It is a draft again.');
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        return $this->flow($request, $id, fn ($m) => $this->approval->approve($m, $request->user()), 'Approved.', true);
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['note' => ['required', 'string', 'max:500']]);

        return $this->flow($request, $id, fn ($m) => $this->approval->reject($m, $request->user(), $d['note']), 'Not approved. The author has been told.', true);
    }

    public function hide(Request $request, int $id): JsonResponse
    {
        return $this->flow($request, $id, fn ($m) => $this->moods->hide($m), 'Hidden from the public.', true);
    }

    public function unhide(Request $request, int $id): JsonResponse
    {
        return $this->flow($request, $id, fn ($m) => $this->moods->unhide($m), 'Shown again.', true);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $m = $this->find($request, $id);
        abort_unless(CampaignAccess::canPublish($request->user()), 403, 'Only an admin, super admin or manager can delete a moodboard.');
        $this->moods->destroy($m);

        return response()->json(['message' => 'Moodboard deleted.']);
    }

    /** POST /admin/moodboards/{id}/restore: out of the recycle bin (publishers, or the maker). */
    public function restore(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $m = CampaignMoodboard::onlyTrashed()->findOrFail($id);
        abort_unless(CampaignAccess::canPublish($request->user()) || (int) $m->owner_user_id === (int) $request->user()->id, 403, 'That is not your moodboard.');
        $this->moods->restore($m);

        return response()->json(['message' => 'Moodboard restored.']);
    }

    /** DELETE /admin/moodboards/{id}/purge: super admin only, gone for good. */
    public function purge(Request $request, int $id): JsonResponse
    {
        abort_unless($request->user()?->role === 'super_admin', 403, 'Only a super admin can delete a moodboard for good.');
        $this->moods->purge(CampaignMoodboard::withTrashed()->findOrFail($id));

        return response()->json(['message' => 'Moodboard deleted for good.']);
    }
}
