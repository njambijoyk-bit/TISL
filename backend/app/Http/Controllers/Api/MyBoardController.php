<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CampaignBoard;
use App\Models\CampaignPin;
use App\Services\Campaigns\BoardService;
use App\Services\Campaigns\Feed;
use App\Services\Campaigns\PinService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * A signed-in person's own boards and pins: make boards (private unless they choose public), save pins to them, upload images, links and video links,
 * and follow other people's public boards. Everything here is limited to the person's own things; video files are for staff only.
 */
class MyBoardController extends Controller
{
    public const MAX_BOARDS = 100;
    public const MAX_PINS = 500;
    private const KINDS = ['image', 'link', 'video', 'note'];

    public function __construct(private BoardService $boards, private PinService $pins, private Feed $feed) {}

    private function mine(Request $r, int $id): CampaignBoard
    {
        return CampaignBoard::where('is_official', false)->where('owner_user_id', $r->user()->id)->findOrFail($id);
    }

    private function thumb(?CampaignPin $p): ?string
    {
        return $p ? ($p->thumb_path ?: $p->media_path ?: ($p->video['poster'] ?? null)) : null;
    }

    private function row(CampaignBoard $b, ?int $pinId = null): array
    {
        $cover = $b->cover_pin_id ? CampaignPin::find($b->cover_pin_id) : null;

        return ['id' => $b->id, 'title' => $b->title, 'description' => $b->description, 'visibility' => $b->visibility, 'slug_path' => $b->slugPath(),
            'pins_count' => $b->pins()->count(), 'followers' => DB::table('campaign_board_follows')->where('board_id', $b->id)->count(), 'cover' => $this->thumb($cover),
            'has_pin' => $pinId ? DB::table('campaign_board_pins')->where('board_id', $b->id)->where('pin_id', $pinId)->exists() : null];
    }

    /** GET /my/boards?pin_id=: my boards, newest first; with a pin id each says whether the pin is already on it (for the Save menu). */
    public function index(Request $request): JsonResponse
    {
        $pinId = $request->integer('pin_id') ?: null;
        $rows = CampaignBoard::where('is_official', false)->where('owner_user_id', $request->user()->id)->orderByDesc('id')->get()->map(fn ($b) => $this->row($b, $pinId))->all();

        return response()->json(['data' => $rows, 'max_boards' => self::MAX_BOARDS]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $b = $this->mine($request, $id);
        $pins = $b->pins()->where('campaign_pins.status', 'visible')->get();
        $shaped = collect($this->pins->presentMany($pins))->map(fn ($p) => $p + ['mine' => (int) $p['owner_user_id'] === (int) $request->user()->id])->all();

        return response()->json(['data' => $this->row($b) + ['pins' => $shaped]]);
    }

    public function store(Request $request): JsonResponse
    {
        $d = $request->validate(['title' => ['required', 'string', 'max:160'], 'description' => ['nullable', 'string', 'max:500'], 'visibility' => ['nullable', 'in:public,private']]);
        abort_if(CampaignBoard::where('is_official', false)->where('owner_user_id', $request->user()->id)->count() >= self::MAX_BOARDS, 422, 'You have reached the limit of ' . self::MAX_BOARDS . ' boards.');
        $b = $this->boards->create($d + ['visibility' => 'private'], $request->user(), false);

        return response()->json(['message' => 'Board made.', 'data' => $this->row($b)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $b = $this->mine($request, $id);
        $d = $request->validate(['title' => ['sometimes', 'string', 'max:160'], 'description' => ['nullable', 'string', 'max:500'], 'visibility' => ['sometimes', 'in:public,private'], 'cover_pin_id' => ['nullable', 'integer']]);
        $b = $this->boards->update($b, $d, $request->user());

        return response()->json(['message' => 'Board saved.', 'data' => $this->row($b)]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->boards->destroy($this->mine($request, $id));

        return response()->json(['message' => 'Board deleted. Its pins are still in the world if they are on other boards.']);
    }

    /** POST /my/boards/{id}/pins: save pins to this board. Only pins the public can see, or my own. */
    public function addPins(Request $request, int $id): JsonResponse
    {
        $b = $this->mine($request, $id);
        $d = $request->validate(['pin_ids' => ['required', 'array', 'min:1', 'max:50'], 'pin_ids.*' => ['integer']]);
        $ids = array_values(array_unique(array_map('intval', $d['pin_ids'])));
        $allowed = $this->feed->publicPins()->whereIn('campaign_pins.id', $ids)->pluck('campaign_pins.id')
            ->merge(CampaignPin::whereIn('id', $ids)->where('owner_user_id', $request->user()->id)->where('status', 'visible')->pluck('id'))->unique()->all();
        abort_if(count($allowed) !== count($ids), 422, 'One of those pins is not available to save.');
        abort_if($b->pins()->count() + count($ids) > self::MAX_PINS, 422, 'A board can hold up to ' . self::MAX_PINS . ' pins.');
        $b = $this->boards->addPins($b, $ids, $request->user());

        return response()->json(['message' => 'Saved to ' . $b->title . '.', 'data' => $this->row($b)]);
    }

    public function removePin(Request $request, int $id, int $pinId): JsonResponse
    {
        $b = $this->boards->removePin($this->mine($request, $id), $pinId, $request->user());

        return response()->json(['message' => 'Removed from the board.', 'data' => $this->row($b)]);
    }

    private function ownPin(Request $r, int $id): CampaignPin
    {
        return CampaignPin::where('owner_user_id', $r->user()->id)->where('source', 'customer')->findOrFail($id);
    }

    private function textRules(): array
    {
        return ['title' => ['nullable', 'string', 'max:160'], 'caption' => ['nullable', 'string', 'max:2000'], 'credit' => ['nullable', 'string', 'max:160'], 'tags' => ['nullable'], 'allow_download' => ['nullable'],
            'link_url' => ['nullable', 'string', 'max:500'], 'video_url' => ['nullable', 'string', 'max:500']];
    }

    /** POST /my/pins (multipart): upload an image, or make a link, video link or note, and put it on one of my boards. */
    public function storePin(Request $request): JsonResponse
    {
        $request->validate(['kind' => ['required', Rule::in(self::KINDS)], 'board_id' => ['required', 'integer'], 'image' => ['nullable', 'file', 'mimes:png,jpg,jpeg,webp', 'max:' . PinService::MAX_IMAGE_KB]] + $this->textRules());
        $b = $this->mine($request, $request->integer('board_id'));
        abort_if($b->pins()->count() >= self::MAX_PINS, 422, 'A board can hold up to ' . self::MAX_PINS . ' pins.');
        $pin = $this->pins->create($request->only(['kind', 'title', 'caption', 'credit', 'tags', 'allow_download', 'link_url', 'video_url']), ['image' => $request->file('image')], $request->user(), 'customer');
        $this->boards->addPins($b, [$pin->id], $request->user());

        return response()->json(['message' => 'Pin added to ' . $b->title . '.', 'data' => $this->pins->presentMany([$pin])[0]], 201);
    }

    public function updatePin(Request $request, int $id): JsonResponse
    {
        $pin = $this->ownPin($request, $id);
        $request->validate($this->textRules());
        $pin = $this->pins->update($pin, $request->only(['title', 'caption', 'credit', 'tags', 'allow_download', 'link_url']));

        return response()->json(['message' => 'Pin saved.', 'data' => $this->pins->presentMany([$pin])[0]]);
    }

    public function destroyPin(Request $request, int $id): JsonResponse
    {
        $this->pins->purge($this->ownPin($request, $id));   // a customer's own delete is final

        return response()->json(['message' => 'Pin deleted.']);
    }

    /** GET /my/following: the public boards I follow. */
    public function following(Request $request): JsonResponse
    {
        $ids = DB::table('campaign_board_follows')->where('user_id', $request->user()->id)->pluck('board_id');
        $rows = $this->feed->publicBoards()->with('owner:id,name')->whereIn('id', $ids)->orderByDesc('id')->get()->map(fn ($b) => ['id' => $b->id, 'title' => $b->title, 'slug_path' => $b->slugPath(),
            'by' => $b->is_official ? null : $b->owner?->name, 'pins_count' => $b->pins()->count(), 'cover' => $this->thumb($b->cover_pin_id ? CampaignPin::find($b->cover_pin_id) : null)])->all();

        return response()->json(['data' => $rows]);
    }

    /** POST /world/boards/{id}/follow and DELETE: follow or stop following a public board that is not mine. */
    public function follow(Request $request, int $id): JsonResponse
    {
        $b = $this->feed->publicBoards()->findOrFail($id);
        abort_if((int) $b->owner_user_id === (int) $request->user()->id, 422, 'You cannot follow your own board.');
        $row = ['user_id' => $request->user()->id, 'board_id' => $b->id];
        if (! DB::table('campaign_board_follows')->where($row)->exists()) {
            DB::table('campaign_board_follows')->insert($row + ['created_at' => now()]);
        }

        return response()->json(['following' => true, 'followers' => DB::table('campaign_board_follows')->where('board_id', $b->id)->count()]);
    }

    public function unfollow(Request $request, int $id): JsonResponse
    {
        DB::table('campaign_board_follows')->where(['user_id' => $request->user()->id, 'board_id' => $id])->delete();

        return response()->json(['following' => false, 'followers' => DB::table('campaign_board_follows')->where('board_id', $id)->count()]);
    }
}
