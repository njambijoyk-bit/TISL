<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CampaignPin;
use App\Services\Campaigns\CampaignAccess;
use App\Services\Campaigns\CatalogueAdapter;
use App\Services\Campaigns\PinService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The pin library, staff side: make, change, hide and delete pins. Builders (admin, super admin, manager, sales rep, finance) make pins and change their own;
 * admin, super admin and manager change or hide anyone's. Customers' own uploads come through their own routes later and use the same PinService.
 */
class CampaignPinController extends Controller
{
    public function __construct(private PinService $pins, private CatalogueAdapter $catalogue) {}

    private function builder(Request $r): void
    {
        abort_unless(CampaignAccess::canBuild($r->user()), 403, 'You cannot work on pins.');
    }

    private function mine(Request $r, CampaignPin $p): void
    {
        abort_unless(CampaignAccess::canPublish($r->user()) || (int) $p->owner_user_id === (int) $r->user()->id, 403, 'You can only change your own pins.');
    }

    private function files(Request $r): array
    {
        return ['image' => $r->file('image'), 'video' => $r->file('video'), 'poster' => $r->file('poster')];
    }

    private function fileRules(): array
    {
        return ['image' => ['nullable', 'file', 'mimes:png,jpg,jpeg,webp', 'max:' . PinService::MAX_IMAGE_KB], 'poster' => ['nullable', 'file', 'mimes:png,jpg,jpeg,webp', 'max:5120'],
            'video' => ['nullable', 'file', 'mimetypes:video/mp4,video/webm', 'max:' . PinService::MAX_VIDEO_KB]];
    }

    private function textRules(): array
    {
        return ['title' => ['nullable', 'string', 'max:160'], 'caption' => ['nullable', 'string', 'max:2000'], 'credit' => ['nullable', 'string', 'max:160'], 'tags' => ['nullable'], 'allow_download' => ['nullable'],
            'link_url' => ['nullable', 'string', 'max:500'], 'video_url' => ['nullable', 'string', 'max:500'], 'item_type' => ['nullable', Rule::in(\App\Models\CampaignItem::TYPES)], 'item_id' => ['nullable', 'integer']];
    }

    /** Pins with the live details of any featured items, and who made each. @param iterable<CampaignPin> $pins */
    private function present(iterable $pins): array
    {
        $pins = collect($pins);

        return collect($this->pins->presentMany($pins))->map(fn ($row, $i) => $row + ['owner_name' => $pins->values()[$i]->owner?->name])->all();
    }

    public function index(Request $request): JsonResponse
    {
        $this->builder($request);
        $q = CampaignPin::with('owner:id,name')->orderByDesc('id')
            ->when($request->filled('kind'), fn ($w) => $w->where('kind', $request->query('kind')))
            ->when($request->filled('status'), fn ($w) => $w->where('status', $request->query('status')))
            ->when($request->filled('source'), fn ($w) => $w->where('source', $request->query('source')))
            ->when($request->filled('tag'), fn ($w) => $w->where('tags', 'like', '%"' . str_replace(['%', '_', '"'], '', mb_strtolower((string) $request->query('tag'))) . '"%'))
            ->when($request->filled('q'), fn ($w) => $w->where(fn ($x) => $x->where('title', 'like', '%' . $request->query('q') . '%')->orWhere('caption', 'like', '%' . $request->query('q') . '%')->orWhere('credit', 'like', '%' . $request->query('q') . '%')))
            ->when($request->boolean('mine') || ! CampaignAccess::canPublish($request->user()), fn ($w) => $w->where('owner_user_id', $request->user()->id));
        $page = $q->paginate(min(60, max(12, $request->integer('per_page', 36))));

        return response()->json(['data' => $this->present($page->items()), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(),
            'ecommerce' => $this->catalogue->active(), 'max_video_mb' => PinService::MAX_VIDEO_KB / 1024, 'max_image_mb' => PinService::MAX_IMAGE_KB / 1024]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->builder($request);
        $request->validate(['kind' => ['required', Rule::in(CampaignPin::KINDS)]] + $this->textRules() + $this->fileRules());
        $pin = $this->pins->create($request->only(['kind', 'title', 'caption', 'credit', 'tags', 'allow_download', 'link_url', 'video_url', 'item_type', 'item_id']), $this->files($request), $request->user(), 'staff');

        return response()->json(['message' => 'Pin saved.', 'data' => $this->present([$pin->load('owner:id,name')])[0]], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $pin = CampaignPin::findOrFail($id);
        $this->mine($request, $pin);
        $request->validate($this->textRules());
        $pin = $this->pins->update($pin, $request->only(['title', 'caption', 'credit', 'tags', 'allow_download', 'link_url']));

        return response()->json(['message' => 'Pin saved.', 'data' => $this->present([$pin->load('owner:id,name')])[0]]);
    }

    /** POST /admin/pins/{id}/media: replace the picture, the video (file or link) or the poster. */
    public function media(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $pin = CampaignPin::findOrFail($id);
        $this->mine($request, $pin);
        $request->validate(['video_url' => ['nullable', 'string', 'max:500']] + $this->fileRules());
        $pin = $this->pins->replaceMedia($pin, $this->files($request), $request->only(['video_url']), 'staff');

        return response()->json(['message' => 'Saved.', 'data' => $this->present([$pin->load('owner:id,name')])[0]]);
    }

    public function hide(Request $request, int $id): JsonResponse
    {
        abort_unless(CampaignAccess::canPublish($request->user()), 403, 'Only an admin, super admin or manager can hide a pin.');
        $request->validate(['reason' => ['nullable', 'string', 'max:255']]);
        $pin = CampaignPin::findOrFail($id);
        $this->pins->hide($pin, $request->input('reason'));

        return response()->json(['message' => 'Hidden from the public.', 'data' => $this->present([$pin->fresh()->load('owner:id,name')])[0]]);
    }

    public function unhide(Request $request, int $id): JsonResponse
    {
        abort_unless(CampaignAccess::canPublish($request->user()), 403, 'Only an admin, super admin or manager can show a pin again.');
        $pin = CampaignPin::findOrFail($id);
        $this->pins->unhide($pin);

        return response()->json(['message' => 'Visible again.', 'data' => $this->present([$pin->fresh()->load('owner:id,name')])[0]]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $pin = CampaignPin::findOrFail($id);
        $this->mine($request, $pin);
        $this->pins->destroy($pin);

        return response()->json(['message' => 'Pin deleted.']);
    }
}
