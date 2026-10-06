<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CampaignBoard;
use App\Services\Books\BooksException;
use App\Services\Campaigns\BoardApproval;
use App\Services\Campaigns\BoardService;
use App\Services\Campaigns\CampaignAccess;
use App\Services\Campaigns\PinService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Boards, staff side. Admin, super admin and manager see and change every board; sales rep and finance see and change their own, and their official
 * boards are approved by a publisher (see BoardApproval). Customer boards come in a later step.
 */
class CampaignBoardController extends Controller
{
    public function __construct(private BoardService $boards, private BoardApproval $approval, private PinService $pins) {}

    private function builder(Request $r): void
    {
        abort_unless(CampaignAccess::canBuild($r->user()), 403, 'You cannot work on boards.');
    }

    private function publisher(Request $r): void
    {
        abort_unless(CampaignAccess::canPublish($r->user()), 403, 'Only an admin, super admin or manager can do that.');
    }

    private function find(Request $r, int $id, bool $forEdit = false, bool $look = false): CampaignBoard
    {
        $this->builder($r);
        $b = CampaignBoard::with('owner:id,name')->findOrFail($id);
        if ($look && ! $b->is_official && (int) $b->owner_user_id !== (int) $r->user()->id) {
            $this->record($r, $b);   // any staff builder may look at a customer's board; a private one is written to the access log first

            return $b;
        }
        abort_unless(CampaignAccess::canPublish($r->user()) || (int) $b->owner_user_id === (int) $r->user()->id, 403, 'That is not your board.');
        if ($forEdit) {
            abort_if(! $b->is_official && (int) $b->owner_user_id !== (int) $r->user()->id, 403, 'A customer\'s board can only be changed by its owner. You can hide or delete it.');
            abort_unless($this->boards->canEdit($r->user(), $b), 403, 'You cannot change this board while it is waiting for a decision.');
        }

        return $b;
    }

    /** Write the look to the access log. Without a log entry the board does not open. */
    private function record(Request $r, CampaignBoard $b): void
    {
        if ($b->visibility !== 'private') {
            return;
        }
        try {
            DB::table('campaign_access_log')->insert(['user_id' => $r->user()->id, 'board_id' => $b->id, 'owner_user_id' => $b->owner_user_id, 'action' => 'view', 'ip_address' => $r->ip(), 'created_at' => now()]);
        } catch (\Throwable) {
            abort(503, 'The access log is not set up yet, so a private board cannot be opened. Ask an admin to run script 85.');
        }
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function row(CampaignBoard $b, bool $withPins = false, ?Request $r = null): array
    {
        $row = $b->toArray() + ['owner_name' => $b->owner?->name, 'pins_count' => $b->pins()->count(), 'slug_path' => $b->slugPath()];
        if ($withPins) {
            $pins = $b->pins()->get();
            $row['pins'] = collect($this->pins->presentMany($pins))->map(fn ($p, $i) => $p + ['position' => $pins[$i]->pivot->position])->all();
        }
        if ($r) {
            $u = $r->user();
            $mine = (int) $b->owner_user_id === (int) $u->id;
            $row += ['can_edit' => $this->boards->canEdit($u, $b), 'can_publish' => CampaignAccess::canPublish($u), 'can_decide' => CampaignAccess::canPublish($u) && $b->approval_status === 'pending' && ! $mine,
                'can_submit' => ! CampaignAccess::canPublish($u) && $mine && $b->is_official && in_array($b->approval_status, ['draft', 'rejected'], true), 'can_withdraw' => $mine && $b->approval_status === 'pending'];
        }

        return $row;
    }

    public function index(Request $request): JsonResponse
    {
        $this->builder($request);
        $q = CampaignBoard::with('owner:id,name')->orderByDesc('id')
            ->when($request->filled('approval'), fn ($w) => $w->where('approval_status', $request->query('approval')))
            ->when($request->filled('status'), fn ($w) => $w->where('status', $request->query('status')))
            ->when($request->filled('q'), fn ($w) => $w->where('title', 'like', '%' . $request->query('q') . '%'))
            ->when($request->boolean('trashed'), fn ($w) => $w->onlyTrashed())
            ->when(! $request->boolean('trashed'), fn ($w) => $w->where('is_official', $request->boolean('official', true)))   // customers' personal boards only when asked for (official=0)
            ->when(($request->boolean('official', true) || $request->boolean('trashed')) && ! CampaignAccess::canPublish($request->user()), fn ($w) => $w->where('owner_user_id', $request->user()->id));
        $page = $q->paginate(min(60, max(10, $request->integer('per_page', 30))));
        $rows = collect($page->items())->map(fn ($b) => $this->row($b))->all();

        return response()->json(['data' => $rows, 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => $this->row($this->find($request, $id, false, true), true, $request)]);
    }

    /** GET /admin/boards/{id}/views: who on the staff opened this private board, newest first. For admin, super admin and manager. */
    public function views(Request $request, int $id): JsonResponse
    {
        $this->publisher($request);
        CampaignBoard::findOrFail($id);
        try {
            $rows = DB::table('campaign_access_log as l')->leftJoin('users as u', 'u.id', '=', 'l.user_id')->where('l.board_id', $id)->where('l.action', 'view')->orderByDesc('l.id')->limit(100)
                ->get(['l.created_at', 'l.ip_address', 'u.name', 'u.role'])->map(fn ($r) => ['name' => $r->name, 'role' => $r->role, 'at' => $r->created_at ? \Carbon\Carbon::parse($r->created_at)->setTimezone(config('app.timezone'))->format('Y-m-d\TH:i:sP') : null])->all();
        } catch (\Throwable) {
            $rows = [];
        }

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->builder($request);
        $d = $request->validate(['title' => ['required', 'string', 'max:160'], 'description' => ['nullable', 'string', 'max:500'], 'visibility' => ['nullable', 'in:public,private'], 'campaign_id' => ['nullable', 'integer']]);

        return $this->guard(function () use ($request, $d) {
            $b = $this->boards->create($d, $request->user(), true);

            return response()->json(['message' => 'Board saved.', 'data' => $this->row($b->load('owner:id,name'), true, $request)], 201);
        });
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $b = $this->find($request, $id, true);
        $d = $request->validate(['title' => ['sometimes', 'string', 'max:160'], 'description' => ['nullable', 'string', 'max:500'], 'visibility' => ['sometimes', 'in:public,private'], 'campaign_id' => ['nullable', 'integer'], 'cover_pin_id' => ['nullable', 'integer']]);

        return $this->guard(function () use ($request, $b, $d) {
            $b = $this->boards->update($b, $d, $request->user());

            return response()->json(['message' => 'Board saved.', 'data' => $this->row($b->load('owner:id,name'), true, $request)]);
        });
    }

    public function addPins(Request $request, int $id): JsonResponse
    {
        $b = $this->find($request, $id, true);
        $d = $request->validate(['pin_ids' => ['required', 'array', 'min:1', 'max:100'], 'pin_ids.*' => ['integer']]);

        return $this->guard(function () use ($request, $b, $d) {
            $b = $this->boards->addPins($b, $d['pin_ids'], $request->user());

            return response()->json(['message' => 'Pins added.', 'data' => $this->row($b->load('owner:id,name'), true, $request)]);
        });
    }

    public function removePin(Request $request, int $id, int $pinId): JsonResponse
    {
        $b = $this->find($request, $id, true);
        $b = $this->boards->removePin($b, $pinId, $request->user());

        return response()->json(['message' => 'Pin removed from the board.', 'data' => $this->row($b->load('owner:id,name'), true, $request)]);
    }

    public function reorder(Request $request, int $id): JsonResponse
    {
        $b = $this->find($request, $id, true);
        $d = $request->validate(['ids' => ['required', 'array', 'max:500'], 'ids.*' => ['integer']]);
        $this->boards->reorder($b, $d['ids'], $request->user());

        return response()->json(['message' => 'Order saved.', 'data' => $this->row($b->fresh()->load('owner:id,name'), true, $request)]);
    }

    public function submit(Request $request, int $id): JsonResponse
    {
        $b = $this->find($request, $id);

        return $this->guard(function () use ($request, $b) {
            $this->approval->submit($b, $request->user());

            return response()->json(['message' => 'Sent for approval.', 'data' => $this->row($b->fresh()->load('owner:id,name'), false, $request)]);
        });
    }

    public function withdraw(Request $request, int $id): JsonResponse
    {
        $b = $this->find($request, $id);

        return $this->guard(function () use ($request, $b) {
            $this->approval->withdraw($b, $request->user());

            return response()->json(['message' => 'Taken back. It is a draft again.', 'data' => $this->row($b->fresh()->load('owner:id,name'), false, $request)]);
        });
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $this->publisher($request);
        $b = CampaignBoard::findOrFail($id);

        return $this->guard(function () use ($request, $b) {
            $this->approval->approve($b, $request->user());

            return response()->json(['message' => 'Approved.', 'data' => $this->row($b->fresh()->load('owner:id,name'), false, $request)]);
        });
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $this->publisher($request);
        $d = $request->validate(['note' => ['required', 'string', 'max:500']]);
        $b = CampaignBoard::findOrFail($id);

        return $this->guard(function () use ($request, $b, $d) {
            $this->approval->reject($b, $request->user(), $d['note']);

            return response()->json(['message' => 'Not approved. The author has been told.', 'data' => $this->row($b->fresh()->load('owner:id,name'), false, $request)]);
        });
    }

    public function hide(Request $request, int $id): JsonResponse
    {
        $this->publisher($request);
        $request->validate(['reason' => ['nullable', 'string', 'max:255']]);
        $b = CampaignBoard::findOrFail($id);
        $this->boards->hide($b, $request->input('reason'));

        return response()->json(['message' => 'Hidden from the public.', 'data' => $this->row($b->fresh()->load('owner:id,name'), false, $request)]);
    }

    public function unhide(Request $request, int $id): JsonResponse
    {
        $this->publisher($request);
        $b = CampaignBoard::findOrFail($id);
        $this->boards->unhide($b);

        return response()->json(['message' => 'Visible again.', 'data' => $this->row($b->fresh()->load('owner:id,name'), false, $request)]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $b = $this->find($request, $id);
        abort_unless(CampaignAccess::canPublish($request->user()) || $b->approval_status !== 'pending', 403, 'Take it back from approval first.');
        $this->boards->destroy($b);

        return response()->json(['message' => 'Board deleted.']);
    }

    /** POST /admin/boards/{id}/restore: out of the recycle bin. */
    public function restore(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $b = CampaignBoard::onlyTrashed()->findOrFail($id);
        abort_unless(CampaignAccess::canPublish($request->user()) || (int) $b->owner_user_id === (int) $request->user()->id, 403, 'That is not your board.');
        $this->boards->restore($b);

        return response()->json(['message' => 'Board restored.']);
    }

    /** DELETE /admin/boards/{id}/purge: super admin only, gone for good. */
    public function purge(Request $request, int $id): JsonResponse
    {
        abort_unless($request->user()?->role === 'super_admin', 403, 'Only a super admin can delete a board for good.');
        $this->boards->purge(CampaignBoard::withTrashed()->findOrFail($id));

        return response()->json(['message' => 'Board deleted for good.']);
    }
}
