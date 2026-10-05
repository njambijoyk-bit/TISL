<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EngagementPost;
use App\Services\Engagement\PostService;
use App\Services\Engagement\TargetResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Held and published reviews and comments for staff to approve, hide or remove. Admin, super admin and manager decide; every decision is logged. */
class EngagementModerationController extends Controller
{
    public const DECIDERS = ['admin', 'super_admin', 'manager'];

    public function __construct(private PostService $posts, private TargetResolver $targets, private \App\Services\Engagement\ReportService $reports) {}

    private function decider(Request $r): void
    {
        abort_unless(in_array($r->user()->role, self::DECIDERS, true), 403, 'Only an admin, super admin or manager can do that.');
    }

    private function row(EngagementPost $p): array
    {
        return ['id' => $p->id, 'kind' => $p->kind, 'parent_id' => $p->parent_id, 'target_type' => $p->target_type, 'target_id' => $p->target_id, 'target' => $this->targets->label($p->target_type, $p->target_id),
            'rating' => $p->rating, 'title' => $p->title, 'body' => $p->body, 'images' => $p->images ?? [], 'author' => $p->user?->name ?? ($p->guest_name ? $p->guest_name . ' (guest)' : 'Guest'), 'role' => $p->user?->role,
            'verified' => (bool) $p->verified_purchase, 'status' => $p->status, 'held_reason' => $p->held_reason, 'created_at' => $p->created_at?->toIso8601String()];
    }

    /** GET /admin/engagement/posts?status=held|published|hidden&type=&kind=&q= */
    public function index(Request $request): JsonResponse
    {
        abort_unless(in_array($request->user()->role, array_merge(self::DECIDERS, ['sales_rep', 'finance']), true), 403);
        $status = in_array($request->query('status'), ['held', 'published', 'hidden', 'removed'], true) ? $request->query('status') : 'held';
        $q = EngagementPost::withTrashed($status === 'removed')->with('user:id,name,role')->where('status', $status)->orderByDesc('id')
            ->when($request->filled('type'), fn ($w) => $w->where('target_type', $request->query('type')))
            ->when($request->filled('kind'), fn ($w) => $w->where('kind', $request->query('kind')))
            ->when($request->filled('q'), fn ($w) => $w->where(fn ($x) => $x->where('body', 'like', '%' . $request->query('q') . '%')->orWhere('title', 'like', '%' . $request->query('q') . '%')));
        $page = $q->paginate(30);

        return response()->json(['data' => collect($page->items())->map(fn ($p) => $this->row($p))->all(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(),
            'counts' => DB::table('engagement_posts')->whereNull('deleted_at')->selectRaw('status, COUNT(*) n')->groupBy('status')->pluck('n', 'status')->all(), 'can_decide' => in_array($request->user()->role, self::DECIDERS, true)]);
    }

    private function decide(Request $request, int $id, string $status, string $log): JsonResponse
    {
        $this->decider($request);
        $p = EngagementPost::withTrashed()->findOrFail($id);
        DB::transaction(function () use ($request, $p, $status, $log) {
            $p->restore();
            $p->update(['status' => $status, 'held_reason' => $status === 'published' ? null : $p->held_reason, 'decided_by' => $request->user()->id, 'decided_at' => now()]);
            DB::table('engagement_log')->insert(['target_type' => 'post', 'target_id' => $p->id, 'action' => $log, 'actor_user_id' => $request->user()->id, 'note' => mb_substr((string) $request->input('note'), 0, 500) ?: null,
                'meta' => json_encode(['on' => $p->target_type . ':' . $p->target_id]), 'created_at' => now()]);
        });
        $this->posts->after($p);

        return response()->json(['message' => ucfirst($log) . '.', 'data' => $this->row($p->fresh('user'))]);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        return $this->decide($request, $id, 'published', 'approved');
    }

    public function hide(Request $request, int $id): JsonResponse
    {
        return $this->decide($request, $id, 'hidden', 'hidden');
    }

    public function remove(Request $request, int $id): JsonResponse
    {
        $this->decider($request);
        $p = EngagementPost::findOrFail($id);
        $this->posts->destroy($p);
        DB::table('engagement_log')->insert(['target_type' => 'post', 'target_id' => $p->id, 'action' => 'removed', 'actor_user_id' => $request->user()->id, 'note' => mb_substr((string) $request->input('note'), 0, 500) ?: null, 'created_at' => now()]);

        return response()->json(['message' => 'Removed.']);
    }

    /** GET /admin/engagement/reports?status=open|kept|removed|flagged: one row per thing reported. */
    public function reportCases(Request $request): JsonResponse
    {
        abort_unless(in_array($request->user()->role, array_merge(self::DECIDERS, ['sales_rep', 'finance']), true), 403);
        $status = in_array($request->query('status'), ['open', 'kept', 'removed', 'flagged'], true) ? $request->query('status') : 'open';

        return response()->json(['data' => $this->reports->cases($status), 'policies' => $this->reports->policies(), 'can_decide' => in_array($request->user()->role, self::DECIDERS, true),
            'counts' => DB::table('engagement_reports')->selectRaw('status, COUNT(DISTINCT CONCAT(target_type, \':\', target_id)) n')->groupBy('status')->pluck('n', 'status')->all()]);
    }

    /** POST /admin/engagement/reports/decide {target_type, target_id, decision: keep|remove|flag, note?, policy_key?} */
    public function decideReport(Request $request): JsonResponse
    {
        $this->decider($request);
        $d = $request->validate(['target_type' => ['required', 'string', 'max:20'], 'target_id' => ['required', 'integer'], 'decision' => ['required', 'in:keep,remove,flag'], 'note' => ['nullable', 'string', 'max:500'], 'policy_key' => ['nullable', 'string', 'max:60']]);
        try {
            $this->reports->decide($request->user(), $d['target_type'], (int) $d['target_id'], $d['decision'], $d['note'] ?? null, $d['policy_key'] ?? null);
        } catch (\App\Services\Books\BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => ['keep' => 'Kept.', 'remove' => 'Pulled down.', 'flag' => 'Flagged as a policy breach and pulled down.'][$d['decision']]]);
    }
}
