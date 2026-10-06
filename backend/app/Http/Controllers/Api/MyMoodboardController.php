<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CampaignMoodboard;
use App\Models\CampaignPin;
use App\Services\Books\BooksException;
use App\Services\Campaigns\MoodboardPresets;
use App\Services\Campaigns\MoodboardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A signed-in person's own moodboards: start one from a built-in layout, fill it with pictures from their own boards, colours, words and stickers,
 * and keep it private or ask to make it public (staff approve it first). Everything here is limited to the person's own moodboards.
 */
class MyMoodboardController extends Controller
{
    public function __construct(private MoodboardService $moods) {}

    private function mine(Request $r, int $id): CampaignMoodboard
    {
        return CampaignMoodboard::where('source', 'customer')->where('owner_user_id', $r->user()->id)->findOrFail($id);
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function row(CampaignMoodboard $m, bool $full = false): array
    {
        $row = ['id' => $m->id, 'title' => $m->title, 'visibility' => $m->visibility, 'approval_status' => $m->approval_status, 'rejected_note' => $m->rejected_note, 'status' => $m->status,
            'slug_path' => $m->slugPath(), 'filled' => count(array_filter($m->contents ?? [])), 'slots' => count($m->layout['slots'] ?? []), 'can_edit' => $this->moods->canEdit(request()->user(), $m)];
        if ($full) {
            $row += $this->moods->present($m) + ['raw_contents' => (object) ($m->contents ?? [])];
        }

        return $row;
    }

    /** GET /my/moodboards/presets: the built-in layouts (saved templates are for staff). */
    public function presets(): JsonResponse
    {
        $presets = collect(MoodboardPresets::all())->map(fn ($p, $k) => ['key' => $k, 'label' => $p['label'], 'description' => $p['description'], 'layout' => $p['layout']])->values();

        return response()->json(['presets' => $presets, 'max' => MoodboardService::CUSTOMER_MAX]);
    }

    public function index(Request $request): JsonResponse
    {
        $rows = CampaignMoodboard::where('source', 'customer')->where('owner_user_id', $request->user()->id)->orderByDesc('id')->get();
        $images = $this->moods->images($rows->flatMap(fn ($m) => array_filter(array_map(fn ($c) => $c['pin_id'] ?? null, $m->contents ?? [])))->all());

        return response()->json(['data' => $rows->map(fn ($m) => $this->row($m) + $this->moods->present($m, $images))->all(), 'max' => MoodboardService::CUSTOMER_MAX]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => $this->row($this->mine($request, $id), true)]);
    }

    /** GET /my/moodboards/pins: the pictures on my boards (and ones I made) that a photo spot can use. */
    public function pins(Request $request): JsonResponse
    {
        $ids = $this->moods->customerPinIds($request->user());
        $q = CampaignPin::whereIn('id', $ids)->orderByDesc('id')->when($request->filled('q'), fn ($w) => $w->where(fn ($x) => $x->where('title', 'like', '%' . $request->query('q') . '%')->orWhere('caption', 'like', '%' . $request->query('q') . '%')))->limit(120)->get();

        return response()->json(['data' => $q->map(fn ($p) => ['id' => $p->id, 'title' => $p->title, 'image' => $p->thumb_path ?: $p->media_path])->all()]);
    }

    public function store(Request $request): JsonResponse
    {
        $d = $request->validate(['title' => ['required', 'string', 'max:160'], 'preset' => ['required', 'string', 'max:40']]);

        return $this->guard(function () use ($request, $d) {
            $m = $this->moods->createForCustomer($d['title'], $d['preset'], $request->user());

            return response()->json(['message' => 'Moodboard started. It is private until you publish it.', 'data' => $this->row($m, true)], 201);
        });
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $m = $this->mine($request, $id);
        abort_unless($this->moods->canEdit($request->user(), $m), 403, 'You cannot change this moodboard while it waits for a decision. Take it back first.');
        $d = $request->validate(['title' => ['sometimes', 'string', 'max:160'], 'background' => ['sometimes', 'string', 'max:7'], 'contents' => ['sometimes', 'array']]);

        return $this->guard(function () use ($request, $m, $d) {
            $m = $this->moods->update($m, $d, $request->user());

            return response()->json(['message' => $m->approval_status === 'pending' ? 'Saved. It was public, so it has gone back to staff for approval.' : 'Moodboard saved.', 'data' => $this->row($m, true)]);
        });
    }

    /** POST /my/moodboards/{id}/publish: ask to make it public; staff approve it first. */
    public function publish(Request $request, int $id): JsonResponse
    {
        $m = $this->mine($request, $id);

        return $this->guard(function () use ($request, $m) {
            $this->moods->publish($m, $request->user());

            return response()->json(['message' => 'Sent for approval. It goes public once staff approve it.', 'data' => $this->row($m->fresh(), true)]);
        });
    }

    /** POST /my/moodboards/{id}/private: take it off the website (or take back a request) and keep it to myself. */
    public function makePrivate(Request $request, int $id): JsonResponse
    {
        $m = $this->mine($request, $id);

        return $this->guard(function () use ($request, $m) {
            $this->moods->makePrivate($m, $request->user());

            return response()->json(['message' => 'It is private again.', 'data' => $this->row($m->fresh(), true)]);
        });
    }

    /** DELETE /my/moodboards/{id}: a customer's own delete is final. */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->moods->purge($this->mine($request, $id));

        return response()->json(['message' => 'Moodboard deleted.']);
    }
}
