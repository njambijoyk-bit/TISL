<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Campaign;
use App\Rules\NoSlash;
use App\Services\Campaigns\CampaignAccess;
use App\Services\Campaigns\CampaignStatus;
use App\Services\Campaigns\CampaignTypes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Campaigns, admin side: list, create, edit, publish, pause, archive, delete. Sections, items, approval and the numbers come in later steps. See CampaignAccess for who may do what. */
class CampaignController extends Controller
{
    private function builder(Request $r): void
    {
        abort_unless(CampaignAccess::canBuild($r->user()), 403, 'You cannot work on campaigns.');
    }

    private function publisher(Request $r): void
    {
        abort_unless(CampaignAccess::canPublish($r->user()), 403, 'Only an admin, super admin or manager can do that.');
    }

    private function editable(Request $r, Campaign $c): void
    {
        abort_unless(CampaignAccess::canEdit($r->user(), $c), 403, 'You cannot change this campaign. A draft you made can be changed until it is sent for approval.');
    }

    /** GET /admin/campaigns/types: every type, with what is available now and what is planned. */
    public function types(Request $request): JsonResponse
    {
        $this->builder($request);

        return response()->json(['types' => collect(CampaignTypes::all())->map(fn ($t, $k) => ['key' => $k] + $t)->values(), 'goals' => CampaignTypes::GOALS,
            'can_publish' => CampaignAccess::canPublish($request->user())]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->builder($request);
        $q = Campaign::query()->withCount(['sections', 'items'])->orderByDesc('id')
            ->when($request->filled('type'), fn ($w) => $w->where('type', $request->query('type')))
            ->when($request->filled('q'), fn ($w) => $w->where(fn ($x) => $x->where('title', 'like', '%' . $request->query('q') . '%')->orWhere('slug', 'like', '%' . $request->query('q') . '%')))
            ->when(! CampaignAccess::canPublish($request->user()), fn ($w) => $w->where('created_by', $request->user()->id));   // a builder who cannot publish sees their own
        $rows = $q->get();
        if ($request->filled('status')) {
            $rows = $rows->where('status', $request->query('status'))->values();   // status is worked out from the dates, so it is filtered after loading (the list is small)
        }

        return response()->json(['data' => $rows, 'statuses' => CampaignStatus::LABELS]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $c = Campaign::with(['sections', 'items'])->findOrFail($id);
        abort_unless(CampaignAccess::canPublish($request->user()) || (int) $c->created_by === (int) $request->user()->id, 403);

        return response()->json(['data' => $c, 'can_edit' => CampaignAccess::canEdit($request->user(), $c), 'can_publish' => CampaignAccess::canPublish($request->user())]);
    }

    private function rules(?Campaign $c = null): array
    {
        return [
            'title' => ['required', 'string', 'max:160'],
            'subtitle' => ['nullable', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:120', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/', new NoSlash('A slug'), Rule::unique('campaigns', 'slug')->ignore($c?->id)],
            'type' => ['required', 'string', Rule::in(CampaignTypes::availableKeys())],
            'goal' => ['required', 'string', Rule::in(array_keys(CampaignTypes::GOALS))],
            'cover_media' => ['nullable', 'string', 'max:500'],
            'accent_color' => ['nullable', 'string', 'max:20', 'regex:/^#[0-9a-fA-F]{3,8}$/'],
            'teaser_at' => ['nullable', 'date'], 'starts_at' => ['nullable', 'date'], 'ends_at' => ['nullable', 'date', 'after:starts_at'], 'early_access_at' => ['nullable', 'date'],
            'audience_rule' => ['nullable', 'array'], 'early_access_audience' => ['nullable', 'array'],
            'feature_on_home' => ['nullable', 'boolean'],
        ];
    }

    private function slugFor(string $title, ?int $ignoreId = null): string
    {
        $base = Str::slug($title) ?: 'campaign';
        $slug = $base;
        for ($n = 2; Campaign::withTrashed()->where('slug', $slug)->when($ignoreId, fn ($w) => $w->where('id', '!=', $ignoreId))->exists(); $n++) {
            $slug = "{$base}-{$n}";
        }

        return $slug;
    }

    public function store(Request $request): JsonResponse
    {
        $this->builder($request);
        $d = $request->validate($this->rules());
        $type = CampaignTypes::find($d['type']);
        abort_unless(in_array($d['goal'], $type['goals'], true), 422, 'That goal does not suit this type of campaign.');
        $d['slug'] = $d['slug'] ?? $this->slugFor($d['title']);
        $c = Campaign::create($d + ['created_by' => $request->user()->id, 'updated_by' => $request->user()->id, 'approval_status' => 'draft']);

        return response()->json(['message' => 'Campaign saved as a draft.', 'data' => $c->fresh()], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $c = Campaign::findOrFail($id);
        $this->editable($request, $c);
        $d = $request->validate($this->rules($c));
        $type = CampaignTypes::find($d['type']);
        abort_unless(in_array($d['goal'], $type['goals'], true), 422, 'That goal does not suit this type of campaign.');
        if (empty($d['slug'])) {
            unset($d['slug']);
        }
        $c->update($d + ['updated_by' => $request->user()->id]);

        return response()->json(['message' => 'Campaign saved.', 'data' => $c->fresh()]);
    }

    /** Publish: admin, super admin, manager. It goes public as its dates say (scheduled, teaser or live). */
    public function publish(Request $request, int $id): JsonResponse
    {
        $this->publisher($request);
        $c = Campaign::findOrFail($id);
        $c->update(['is_published' => true, 'published_at' => $c->published_at ?? now(), 'is_paused' => false, 'archived_at' => null, 'approval_status' => 'approved', 'approved_by' => $request->user()->id, 'approved_at' => now(), 'updated_by' => $request->user()->id]);

        return response()->json(['message' => 'Published. It is ' . strtolower(CampaignStatus::LABELS[$c->fresh()->status]) . '.', 'data' => $c->fresh()]);
    }

    public function unpublish(Request $request, int $id): JsonResponse
    {
        $this->publisher($request);
        $c = Campaign::findOrFail($id);
        $c->update(['is_published' => false, 'updated_by' => $request->user()->id]);

        return response()->json(['message' => 'Unpublished. It is a draft again.', 'data' => $c->fresh()]);
    }

    public function pause(Request $request, int $id): JsonResponse
    {
        $this->publisher($request);
        $c = Campaign::findOrFail($id);
        $paused = ! $c->is_paused;
        $c->update(['is_paused' => $paused, 'updated_by' => $request->user()->id]);

        return response()->json(['message' => $paused ? 'Paused: hidden from the public until you resume it.' : 'Resumed.', 'data' => $c->fresh()]);
    }

    public function archive(Request $request, int $id): JsonResponse
    {
        $this->publisher($request);
        $c = Campaign::findOrFail($id);
        $c->update(['archived_at' => $c->archived_at ? null : now(), 'updated_by' => $request->user()->id]);

        return response()->json(['message' => $c->archived_at ? 'Archived.' : 'Restored from the archive.', 'data' => $c->fresh()]);
    }

    /** POST /admin/campaigns/{id}/cover: the campaign's cover image (jpg, png or webp, up to 5 MB). */
    public function uploadCover(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $c = Campaign::findOrFail($id);
        $this->editable($request, $c);
        $request->validate(['cover' => 'required|file|mimes:png,jpg,jpeg,webp|max:5120']);
        $this->forgetCover($c->cover_media);
        $c->update(['cover_media' => Storage::url($request->file('cover')->store('campaigns', 'public')), 'updated_by' => $request->user()->id]);

        return response()->json(['message' => 'Cover saved.', 'data' => $c->fresh()]);
    }

    public function removeCover(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $c = Campaign::findOrFail($id);
        $this->editable($request, $c);
        $this->forgetCover($c->cover_media);
        $c->update(['cover_media' => null, 'updated_by' => $request->user()->id]);

        return response()->json(['message' => 'Cover removed.', 'data' => $c->fresh()]);
    }

    /** Delete the file behind an earlier cover, if it is one of ours. */
    private function forgetCover(?string $path): void
    {
        if ($path && str_starts_with($path, '/storage/campaigns/')) {
            Storage::disk('public')->delete(substr($path, strlen('/storage/')));
        }
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->publisher($request);
        Campaign::findOrFail($id)->delete();

        return response()->json(['message' => 'Campaign deleted.']);
    }
}
