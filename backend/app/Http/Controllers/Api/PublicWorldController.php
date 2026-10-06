<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CampaignPin;
use App\Services\Campaigns\Feed;
use App\Models\CampaignMoodboard;
use App\Services\Campaigns\MoodboardService;
use App\Services\Campaigns\PinService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/** The Pinterest side of the website: the endless feed, one pin, one board, and the picture download. Only what Feed says is public. */
class PublicWorldController extends Controller
{
    public function __construct(private Feed $feed, private PinService $pins, private MoodboardService $moods) {}

    /** The fields a visitor needs, nothing about who made it or why it was hidden. */
    private function shape(array $p): array
    {
        $video = $p['video'] ?? null;

        return [
            'id' => $p['id'], 'kind' => $p['kind'], 'title' => $p['title'], 'caption' => $p['caption'], 'credit' => $p['credit'], 'tags' => $p['tags'] ?? [],
            'media_path' => $p['media_path'], 'thumb_path' => $p['thumb_path'], 'media_width' => $p['media_width'], 'media_height' => $p['media_height'],
            'video' => $video ? ['source' => $video['source'] ?? null, 'provider' => $video['provider'] ?? null, 'embed_url' => $video['embed_url'] ?? null, 'file' => $video['file'] ?? null, 'poster' => $video['poster'] ?? null, 'poster_remote' => $video['poster_remote'] ?? null] : null,
            'item_type' => $p['item_type'], 'item' => $p['item'] ?? null, 'link_url' => $p['link_url'],
            'can_download' => $this->downloadable($p), 'created_at' => $p['created_at'],
        ];
    }

    private function downloadable(array $p): bool
    {
        if (empty($p['allow_download'])) {
            return false;
        }

        return ($p['kind'] === 'image' && ! empty($p['media_path'])) || ($p['kind'] === 'video' && ! empty($p['video']['file']));
    }

    /** Product pins need E-commerce: without a live item there is nothing to show. */
    private function present($pins): array
    {
        return collect($this->pins->presentMany($pins))->reject(fn ($p) => $p['kind'] === 'item' && empty($p['item']['available']))->map(fn ($p) => $this->shape($p))->values()->all();
    }

    /** GET /world/pins?tab=discover|following&after=&q=&tag= */
    public function pins(Request $request): JsonResponse
    {
        $user = $request->user('sanctum');
        $following = $request->query('tab') === 'following';
        if ($following && ! $user) {
            return response()->json(['message' => 'Sign in to see pins from boards you follow.'], 401);
        }
        $q = $following ? $this->feed->followingPins($user->id) : $this->feed->publicPins();
        if ($request->query('source') === 'customer') {
            $q->where('campaign_pins.source', 'customer');   // the community gallery
        }
        [$rows, $next] = $this->feed->page($q, $request->integer('after') ?: null, $request->query('q'), $request->query('tag'));

        return response()->json(['data' => $this->present($rows), 'next' => $next]);
    }

    /** GET /world/pins/{id}: one pin and the public boards it is on. */
    public function pin(int $id): JsonResponse
    {
        $pin = $this->feed->publicPins()->where('campaign_pins.id', $id)->firstOrFail();
        $boards = $this->feed->publicBoards()->whereIn('id', DB::table('campaign_board_pins')->where('pin_id', $id)->select('board_id'))->orderBy('id')->limit(8)->get()
            ->map(fn ($b) => ['id' => $b->id, 'title' => $b->title, 'slug_path' => $b->slugPath()])->all();
        $shaped = $this->present([$pin]);
        abort_if(! $shaped, 404);

        return response()->json(['data' => $shaped[0] + ['boards' => $boards]]);
    }

    /** GET /world/boards/{id}?after=: a public board and its pins, in the board's own order. `after` is the last position seen. */
    public function board(Request $request, int $id): JsonResponse
    {
        $b = $this->feed->publicBoards()->with('owner:id,name')->findOrFail($id);
        $after = (int) $request->query('after', 0);
        $rows = $this->feed->publicPins()->join('campaign_board_pins as bp', 'bp.pin_id', '=', 'campaign_pins.id')->where('bp.board_id', $b->id)->where('bp.position', '>', $after)
            ->orderBy('bp.position')->select('campaign_pins.*', 'bp.position as board_position')->limit(Feed::PAGE + 1)->get();
        $more = $rows->count() > Feed::PAGE;
        $rows = $rows->take(Feed::PAGE);
        $user = $request->user('sanctum');

        return response()->json(['data' => [
            'id' => $b->id, 'title' => $b->title, 'description' => $b->description, 'slug_path' => $b->slugPath(),
            'by' => $b->is_official ? null : $b->owner?->name,
            'followers' => DB::table('campaign_board_follows')->where('board_id', $b->id)->count(),
            'following' => $user ? DB::table('campaign_board_follows')->where('board_id', $b->id)->where('user_id', $user->id)->exists() : false,
            'mine' => $user ? (int) $b->owner_user_id === (int) $user->id : false,
            'pins' => $this->present($rows), 'next' => $more ? (int) $rows->last()->board_position : null,
        ]]);
    }

    /** GET /world/pins/{id}/download: the picture or uploaded video, named after the pin, when the pin allows it. */
    public function download(int $id)
    {
        $pin = $this->feed->publicPins()->where('campaign_pins.id', $id)->firstOrFail();
        abort_unless($this->downloadable($pin->toArray()), 403, 'Downloads are switched off for this pin.');
        $url = $pin->kind === 'video' ? $pin->video['file'] : $pin->media_path;
        $rel = Str::after((string) parse_url($url, PHP_URL_PATH), '/storage/');
        abort_unless($rel !== '' && Storage::disk('public')->exists($rel), 404);
        try {
            $pin->increment('download_count');   // counted for the campaign numbers; skipped quietly until script 84 has been run
        } catch (\Throwable) {
        }
        $name = (Str::slug($pin->title ?: "pin-{$pin->id}") ?: "pin-{$pin->id}") . '.' . (pathinfo($rel, PATHINFO_EXTENSION) ?: 'jpg');

        return Storage::disk('public')->download($rel, $name);
    }

    private function publicMoodboards()
    {
        return CampaignMoodboard::public();
    }

    /** GET /world/moodboards: the newest approved moodboards, 30 at a time (`after` is the last id seen). */
    public function moodboards(Request $request): JsonResponse
    {
        $rows = $this->publicMoodboards()->with('owner:id,name')->when($request->integer('after'), fn ($w) => $w->where('id', '<', $request->integer('after')))->orderByDesc('id')->limit(Feed::PAGE + 1)->get();
        $more = $rows->count() > Feed::PAGE;
        $rows = $rows->take(Feed::PAGE);
        $images = $this->moods->images($rows->flatMap(fn ($m) => array_filter(array_map(fn ($c) => $c['pin_id'] ?? null, $m->contents ?? [])))->all());

        return response()->json(['data' => $rows->map(fn ($m) => $this->moods->present($m, $images) + ['by' => $this->madeBy($m)])->all(), 'next' => $more ? $rows->last()->id : null]);
    }

    /** GET /world/moodboards/{id} */
    public function moodboard(int $id): JsonResponse
    {
        $m = $this->publicMoodboards()->with('owner:id,name')->findOrFail($id);

        return response()->json(['data' => $this->moods->present($m) + ['by' => $this->madeBy($m)]]);
    }

    /** A customer's moodboard shows who made it ("Ann K."); the brand's own show nobody. */
    private function madeBy(CampaignMoodboard $m): ?string
    {
        return $m->source === 'customer' ? $this->shortName($m->owner?->name ?? CampaignMoodboard::find($m->id)?->owner?->name) : null;
    }

    /** "Ann Kamau" -> "Ann K." so a board shows who made it without a full name. */
    private function shortName(?string $name): ?string
    {
        if (! $name) {
            return null;
        }
        $parts = preg_split('/\s+/', trim($name));

        return count($parts) > 1 ? $parts[0] . ' ' . mb_strtoupper(mb_substr(end($parts), 0, 1)) . '.' : $parts[0];
    }

    /**
     * GET /world/boards?q=&sort=new|followed&after=: the public boards that have at least one public pin. `after` is how many were already sent.
     * A board's cover is its chosen cover pin, or its first pin.
     */
    public function boards(Request $request): JsonResponse
    {
        $offset = max(0, (int) $request->query('after', 0));
        $q = $this->feed->publicBoards()->with('owner:id,name')
            ->whereExists(fn ($w) => $w->select(DB::raw(1))->from('campaign_board_pins as p')->join('campaign_pins as cp', 'cp.id', '=', 'p.pin_id')->whereColumn('p.board_id', 'campaign_boards.id')->where('cp.status', 'visible')->whereNull('cp.deleted_at'))
            ->when($request->filled('q'), fn ($w) => $w->where(fn ($x) => $x->where('title', 'like', '%' . $request->query('q') . '%')->orWhere('description', 'like', '%' . $request->query('q') . '%')));
        if ($request->query('sort') === 'followed') {
            $q->selectRaw('campaign_boards.*, (SELECT COUNT(*) FROM campaign_board_follows f WHERE f.board_id = campaign_boards.id) as followers_count')->orderByDesc('followers_count');
        }
        $rows = $q->orderByDesc('campaign_boards.id')->offset($offset)->limit(Feed::PAGE + 1)->get();
        $more = $rows->count() > Feed::PAGE;
        $rows = $rows->take(Feed::PAGE);
        $ids = $rows->pluck('id')->all();
        $followers = DB::table('campaign_board_follows')->whereIn('board_id', $ids)->selectRaw('board_id, COUNT(*) n')->groupBy('board_id')->pluck('n', 'board_id');
        $counts = DB::table('campaign_board_pins as p')->join('campaign_pins as cp', 'cp.id', '=', 'p.pin_id')->whereIn('p.board_id', $ids)->where('cp.status', 'visible')->whereNull('cp.deleted_at')
            ->selectRaw('p.board_id, COUNT(*) n')->groupBy('p.board_id')->pluck('n', 'board_id');
        $data = $rows->map(function ($b) use ($followers, $counts) {
            $cover = ($b->cover_pin_id ? \App\Models\CampaignPin::where('status', 'visible')->find($b->cover_pin_id) : null)
                ?? $b->pins()->where('campaign_pins.status', 'visible')->first();

            return ['id' => $b->id, 'title' => $b->title, 'description' => $b->description, 'slug_path' => $b->slugPath(), 'by' => $b->is_official ? null : $this->shortName($b->owner?->name),
                'pins' => (int) ($counts[$b->id] ?? 0), 'followers' => (int) ($followers[$b->id] ?? 0), 'cover' => $cover ? ($cover->thumb_path ?: $cover->media_path ?: ($cover->video['poster'] ?? null)) : null];
        })->all();

        return response()->json(['data' => $data, 'next' => $more ? $offset + Feed::PAGE : null]);
    }
}
