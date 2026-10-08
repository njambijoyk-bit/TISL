<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Campaign;
use App\Rules\NoSlash;
use App\Models\CampaignSection;
use App\Services\Books\BooksException;
use App\Services\Campaigns\CampaignAccess;
use App\Services\Campaigns\CampaignApproval;
use App\Services\Campaigns\CampaignPage;
use App\Services\Campaigns\CampaignStats;
use App\Services\Campaigns\CatalogueAdapter;
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
    public const MAX_VIDEO_KB = 102400;   // 100 MB

    public function __construct(private CampaignPage $page, private CatalogueAdapter $catalogue, private CampaignApproval $approval, private CampaignStats $stats) {}

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

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
            ->when($request->boolean('trashed'), fn ($w) => $w->onlyTrashed())
            ->when($request->filled('type'), fn ($w) => $w->where('type', $request->query('type')))
            ->when($request->filled('q'), fn ($w) => $w->where(fn ($x) => $x->where('title', 'like', '%' . $request->query('q') . '%')->orWhere('slug', 'like', '%' . $request->query('q') . '%')))
            ->when($request->filled('approval'), fn ($w) => $w->where('approval_status', $request->query('approval')))
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

        return response()->json(['data' => $c, 'can_edit' => CampaignAccess::canEdit($request->user(), $c), 'can_publish' => CampaignAccess::canPublish($request->user()), 'can_decide' => CampaignAccess::canPublish($request->user()) && $c->approval_status === 'pending' && (int) $c->created_by !== (int) $request->user()->id,
            'can_submit' => ! CampaignAccess::canPublish($request->user()) && CampaignAccess::canEdit($request->user(), $c), 'can_withdraw' => $c->approval_status === 'pending' && (int) $c->created_by === (int) $request->user()->id,
            'resolved' => $this->catalogue->describe($c->items->map(fn ($i) => ['item_type' => $i->item_type, 'item_id' => $i->item_id])->all()),
            'ecommerce' => $this->catalogue->active(), 'item_types' => $this->catalogue->types(), 'section_types' => CampaignSection::TYPES, 'max_video_mb' => self::MAX_VIDEO_KB / 1024]);
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
        foreach (['audience_rule', 'early_access_audience'] as $k) {
            if (array_key_exists($k, $d)) {
                $d[$k] = \App\Services\Campaigns\CampaignAudience::clean($d[$k]);
            }
        }
        $type = CampaignTypes::find($d['type']);
        abort_unless(in_array($d['goal'], $type['goals'], true), 422, 'That goal does not suit this type of campaign.');
        $d['slug'] = $d['slug'] ?? $this->slugFor($d['title']);
        $c = Campaign::create($d + ['created_by' => $request->user()->id, 'updated_by' => $request->user()->id, 'approval_status' => 'draft']);
        $this->page->seed($c);   // the sections a campaign of this type starts with

        return response()->json(['message' => 'Campaign saved as a draft.', 'data' => $c->fresh()], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $c = Campaign::findOrFail($id);
        $this->editable($request, $c);
        $d = $request->validate($this->rules($c));
        foreach (['audience_rule', 'early_access_audience'] as $k) {
            if (array_key_exists($k, $d)) {
                $d[$k] = \App\Services\Campaigns\CampaignAudience::clean($d[$k]);
            }
        }
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
        $this->approval->clear($c);   // publishing it yourself also settles any approval waiting on it
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

    /** PUT /admin/campaigns/{id}/page: save the whole page (sections in order, and the items inside products sections) in one go. */
    public function savePage(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $c = Campaign::findOrFail($id);
        $this->editable($request, $c);
        $d = $request->validate([
            'sections' => ['present', 'array', 'max:40'],
            'sections.*.id' => ['nullable', 'integer'],
            'sections.*.type' => ['required', Rule::in(CampaignSection::TYPES)],
            'sections.*.settings' => ['nullable', 'array'],
            'sections.*.show_from' => ['nullable', 'date'],
            'sections.*.show_until' => ['nullable', 'date'],
            'sections.*.audience_rule' => ['nullable', 'array'],
            'sections.*.items' => ['nullable', 'array', 'max:200'],
            'sections.*.items.*.item_type' => ['required', Rule::in(\App\Models\CampaignItem::TYPES)],
            'sections.*.items.*.item_id' => ['required', 'integer'],
            'sections.*.items.*.available_from' => ['nullable', 'date'],
            'sections.*.items.*.label_override' => ['nullable', 'string', 'max:160'],
        ]);
        $this->page->save($c, $d['sections']);
        $c->update(['updated_by' => $request->user()->id]);
        $fresh = Campaign::with(['sections', 'items'])->find($c->id);

        return response()->json(['message' => 'Page saved.', 'data' => $fresh,
            'resolved' => $this->catalogue->describe($fresh->items->map(fn ($i) => ['item_type' => $i->item_type, 'item_id' => $i->item_id])->all())]);
    }

    /** GET /admin/campaigns/catalogue?type=&q=: find products, services, hampers or auctions to feature (needs E-commerce). */
    public function catalogue(Request $request): JsonResponse
    {
        $this->builder($request);
        $request->validate(['type' => ['required', Rule::in(\App\Models\CampaignItem::TYPES)], 'q' => ['nullable', 'string', 'max:80']]);

        return response()->json(['data' => $this->catalogue->search($request->query('type'), (string) $request->query('q', '')), 'ecommerce' => $this->catalogue->active()]);
    }

    /** POST /admin/campaigns/{id}/media: a picture (up to 5 MB) or a video file (MP4 or WebM, up to 100 MB) for a section. Returns the stored path. */
    public function uploadMedia(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $c = Campaign::findOrFail($id);
        $this->editable($request, $c);
        $request->validate(['kind' => ['required', Rule::in(['image', 'video'])]]);
        if ($request->input('kind') === 'video') {
            $request->validate(['file' => ['required', 'file', 'mimetypes:video/mp4,video/webm', 'max:' . self::MAX_VIDEO_KB]]);
            $path = $request->file('file')->store('campaigns/video', 'public');
        } else {
            $request->validate(['file' => ['required', 'file', 'mimes:png,jpg,jpeg,webp', 'max:5120']]);
            $path = $request->file('file')->store('campaigns', 'public');
        }

        return response()->json(['path' => Storage::url($path), 'kind' => $request->input('kind')]);
    }

    /** GET /admin/campaigns/{id}/numbers: views, visitors, clicks, and sales of the featured items inside the campaign's dates. */
    public function numbers(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $c = Campaign::with(['items', 'sections'])->findOrFail($id);
        abort_unless(CampaignAccess::canPublish($request->user()) || (int) $c->created_by === (int) $request->user()->id, 403);
        $resolved = $this->catalogue->describe($c->items->map(fn ($i) => ['item_type' => $i->item_type, 'item_id' => $i->item_id])->all());
        $sales = $this->stats->sales($c);
        if ($sales) {
            $sales['items'] = array_map(fn ($r) => $r + ['name' => $resolved["{$r['type']}:{$r['id']}"]['name'] ?? null], $sales['items']);
        }

        return response()->json(['visits' => $this->stats->visits($c), 'sales' => $sales, 'community' => $this->stats->community($c), 'engagement' => $this->stats->engagement($c), 'goal' => $c->goal]);
    }

    /** GET /admin/campaigns/world-options: the approved public boards and moodboards a page section can show. */
    public function worldOptions(Request $request): JsonResponse
    {
        $this->builder($request);
        $boards = app(\App\Services\Campaigns\Feed::class)->publicBoards()->orderByDesc('id')->limit(200)->get(['id', 'title'])->all();
        $moods = \App\Models\CampaignMoodboard::public()->orderByDesc('id')->limit(200)->get(['id', 'title'])->all();

        return response()->json(['boards' => $boards, 'moodboards' => $moods]);
    }

    /** POST /admin/campaigns/{id}/submit: the author sends a draft for approval (their manager, or the admins, get a calendar task). */
    public function submit(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $c = Campaign::findOrFail($id);

        return $this->guard(function () use ($request, $c) {
            $this->approval->submit($c, $request->user());

            return response()->json(['message' => 'Sent for approval.', 'data' => $c->fresh()]);
        });
    }

    public function withdraw(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $c = Campaign::findOrFail($id);

        return $this->guard(function () use ($request, $c) {
            $this->approval->withdraw($c, $request->user());

            return response()->json(['message' => 'Taken back. It is a draft again.', 'data' => $c->fresh()]);
        });
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $this->publisher($request);
        $c = Campaign::findOrFail($id);

        return $this->guard(function () use ($request, $c) {
            $this->approval->approve($c, $request->user());

            return response()->json(['message' => 'Approved and published.', 'data' => $c->fresh()]);
        });
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $this->publisher($request);
        $d = $request->validate(['note' => ['required', 'string', 'max:500']]);
        $c = Campaign::findOrFail($id);

        return $this->guard(function () use ($request, $c, $d) {
            $this->approval->reject($c, $request->user(), $d['note']);

            return response()->json(['message' => 'Not approved. The author has been told.', 'data' => $c->fresh()]);
        });
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->publisher($request);
        Campaign::findOrFail($id)->delete();

        return response()->json(['message' => 'Campaign deleted.']);
    }

    /** POST /admin/campaigns/{id}/restore: out of the recycle bin. It comes back as it was (a published one is live again if its dates allow). */
    public function restore(Request $request, int $id): JsonResponse
    {
        $this->publisher($request);
        Campaign::onlyTrashed()->findOrFail($id)->restore();

        return response()->json(['message' => 'Campaign restored.']);
    }

    /**
     * DELETE /admin/campaigns/{id}/purge: super admin only. Deletes the campaign itself and the records that only exist for it (its sections, its list of featured
     * items, its view and click counts). Pins, boards, moodboards, products, hampers and sales are never deleted; a pin, board or moodboard that was marked as
     * belonging to it just loses that mark.
     */
    public function purge(Request $request, int $id): JsonResponse
    {
        abort_unless($request->user()?->role === 'super_admin', 403, 'Only a super admin can delete a campaign for good.');
        $c = Campaign::withTrashed()->findOrFail($id);
        $this->approval->clear($c);
        \Illuminate\Support\Facades\DB::transaction(function () use ($c) {
            foreach (['campaign_pins', 'campaign_boards', 'campaign_moodboards'] as $t) {
                \Illuminate\Support\Facades\DB::table($t)->where('campaign_id', $c->id)->update(['campaign_id' => null]);
            }
            foreach (['campaign_sections', 'campaign_items', 'campaign_events'] as $t) {
                \Illuminate\Support\Facades\DB::table($t)->where('campaign_id', $c->id)->delete();
            }
            $c->forceDelete();
        });

        return response()->json(['message' => 'Campaign deleted for good.']);
    }
}
