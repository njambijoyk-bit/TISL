<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EngagementPost;
use App\Services\Books\BooksException;
use App\Services\Engagement\EngagementAccess;
use App\Services\Engagement\EngagementTargets;
use App\Services\Engagement\PostService;
use App\Services\Engagement\ReviewSummary;
use App\Services\Engagement\TargetResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Reviews, comments and replies as visitors use them. A signed-in visitor, if any, is read from the token; guests post only where a rule lets them. */
class EngagementPostController extends Controller
{
    public function __construct(private PostService $posts, private EngagementAccess $access, private ReviewSummary $summary, private TargetResolver $targets,
        private \App\Services\Engagement\ReactionService $reactions, private \App\Services\Engagement\ReportService $reports) {}

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function type(string $type): string
    {
        abort_unless(EngagementTargets::find($type) && $type !== 'post', 404);

        return $type;
    }

    /** GET /engagement/{type}/{id}/posts?kind=review|comment&after= */
    public function index(Request $request, string $type, int $id): JsonResponse
    {
        $this->type($type);
        $kind = $request->query('kind') === 'comment' ? 'comment' : 'review';
        $user = $request->user('sanctum');
        $action = $kind === 'review' ? 'review' : 'comment';
        $rule = app(\App\Services\Engagement\EngagementRules::class)->rule($type, $action);
        if (! $this->access->enabled() || ! EngagementTargets::available($type) || ! $rule['enabled'] || ! $this->targets->exists($type, $id)) {
            return response()->json(['data' => [], 'next' => null, 'summary' => null]);
        }
        $page = $this->posts->list($type, $id, $kind, $request->integer('after') ?: null, $user, $this->posts->guestKey($request->ip(), $request->userAgent()));

        return response()->json($page + ['summary' => $kind === 'review' ? $this->summary->of($type, $id) : null]);
    }

    /** GET /engagement/{type}/{id}/can?kind=: whether this visitor may post, and what the form needs. */
    public function can(Request $request, string $type, int $id): JsonResponse
    {
        $this->type($type);
        $kind = $request->query('kind') === 'comment' ? 'comment' : 'review';
        $user = $request->user('sanctum');
        $d = $this->access->decide($user, $type, $kind, $id);
        $mine = null;
        if ($d['allowed'] && $kind === 'review' && $d['rule']['one_per_person']) {
            $mine = EngagementPost::where('target_type', $type)->where('target_id', $id)->where('kind', 'review')->whereIn('status', ['held', 'published', 'hidden'])
                ->when($user, fn ($q) => $q->where('user_id', $user->id), fn ($q) => $q->where('guest_key', $this->posts->guestKey($request->ip(), $request->userAgent())))->value('id');
        }
        $r = $d['rule'];

        return response()->json(['allowed' => $d['allowed'] && ! $mine, 'reason' => $mine ? 'You have already reviewed this.' : $d['reason'], 'guest' => $d['guest'], 'min_words' => $r['min_words'], 'photos' => $r['photos'],
            'held' => $r['hold'] === 'always' || ($r['hold'] === 'guests' && ! $user) || $r['hold'] === 'first', 'verified' => $d['verified']]);
    }

    /** POST /engagement/{type}/{id}/posts (multipart when there are photos) */
    public function store(Request $request, string $type, int $id): JsonResponse
    {
        $this->type($type);
        $d = $request->validate(['kind' => ['required', 'in:review,comment'], 'rating' => ['nullable', 'integer', 'min:1', 'max:5'], 'title' => ['nullable', 'string', 'max:120'], 'body' => ['required', 'string', 'max:2000'],
            'guest_name' => ['nullable', 'string', 'max:60'], 'photos' => ['nullable', 'array', 'max:5'], 'photos.*' => ['image', 'mimes:jpeg,png,jpg,webp', 'max:2048']]);

        return $this->guard(function () use ($request, $type, $id, $d) {
            $p = $this->posts->create($request->user('sanctum'), $type, $id, $d['kind'], $d, $request->file('photos') ?? [], $request->ip(), $request->userAgent());

            return response()->json(['message' => $p->status === 'held' ? 'Thank you. It will show once our team has looked at it.' : 'Thank you. It is posted.', 'held' => $p->status === 'held', 'id' => $p->id], 201);
        });
    }

    /** POST /engagement/posts/{id}/replies */
    public function reply(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['body' => ['required', 'string', 'max:2000'], 'guest_name' => ['nullable', 'string', 'max:60']]);

        return $this->guard(function () use ($request, $id, $d) {
            $p = $this->posts->reply($request->user('sanctum'), $id, $d, $request->ip(), $request->userAgent());

            return response()->json(['message' => $p->status === 'held' ? 'Thank you. Your reply will show once our team has looked at it.' : 'Reply posted.', 'held' => $p->status === 'held', 'id' => $p->id], 201);
        });
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['rating' => ['nullable', 'integer', 'min:1', 'max:5'], 'title' => ['nullable', 'string', 'max:120'], 'body' => ['sometimes', 'string', 'max:2000']]);
        $p = EngagementPost::findOrFail($id);

        return $this->guard(function () use ($request, $p, $d) {
            $p = $this->posts->update($request->user(), $p, $d);

            return response()->json(['message' => $p->status === 'held' ? 'Saved. It will show again once our team has looked at it.' : 'Saved.']);
        });
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $p = EngagementPost::findOrFail($id);
        abort_unless((int) $p->user_id === (int) $request->user()->id, 403, 'You can only delete your own posts.');
        $this->posts->destroy($p);

        return response()->json(['message' => 'Deleted.']);
    }

    /** GET /engagement/{type}/{id}/reactions: how many likes, and whether this visitor liked it. Also which buttons to show. */
    public function reactionState(Request $request, string $type, int $id): JsonResponse
    {
        abort_unless(EngagementTargets::find($type), 404);
        $user = $request->user('sanctum');
        $r = $this->reactions->batch($type, [$id], $user, $this->posts->guestKey($request->ip(), $request->userAgent()))[$id];

        return response()->json(['like' => $r['like'], 'helpful' => $r['helpful']]);
    }

    /** POST /engagement/{type}/{id}/react {kind: like|helpful}: press once to add, again to take it back. */
    public function react(Request $request, string $type, int $id): JsonResponse
    {
        abort_unless(EngagementTargets::find($type), 404);
        $d = $request->validate(['kind' => ['required', 'in:like,helpful']]);

        return $this->guard(function () use ($request, $type, $id, $d) {
            return response()->json($this->reactions->toggle($request->user('sanctum'), $type, $id, $d['kind'], $this->posts->guestKey($request->ip(), $request->userAgent())));
        });
    }

    /** POST /engagement/{type}/{id}/report {reason, note?, guest?} */
    public function report(Request $request, string $type, int $id): JsonResponse
    {
        abort_unless(EngagementTargets::find($type), 404);
        $d = $request->validate(['reason' => ['required', 'string', 'max:60'], 'note' => ['nullable', 'string', 'max:500']]);

        return $this->guard(function () use ($request, $type, $id, $d) {
            $this->reports->report($request->user('sanctum'), $type, $id, $d['reason'], $d['note'] ?? null, $this->posts->guestKey($request->ip(), $request->userAgent()));

            return response()->json(['message' => 'Thank you. Our team will look at this.'], 201);
        });
    }
}
