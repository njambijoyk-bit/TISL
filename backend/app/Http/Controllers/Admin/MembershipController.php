<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Memberships\Membership;
use App\Models\Memberships\Period;
use App\Models\Memberships\Plan;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Books\BooksException;
use App\Services\Memberships\MembershipService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/** Memberships → members: sign people up, take their payments, pause, cancel, change plan, refund, and give a membership without billing. */
class MembershipController extends Controller
{
    public function __construct(private MembershipService $memberships, private Authorizer $authz)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(MembershipService::installed(), 422, 'Run database script 163_memberships_members.sql first.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function one(Membership $m, string $message): JsonResponse
    {
        return response()->json(['message' => $message, 'membership' => $this->memberships->row($m->fresh(), true, true)]);
    }

    public function index(Request $request): JsonResponse
    {
        if (! MembershipService::installed()) {
            return response()->json(['ready' => false, 'memberships' => [], 'total' => 0]);
        }

        return response()->json(['ready' => true] + $this->memberships->list($request->only(['status', 'plan_id', 'q'])));
    }

    public function show(int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json(['membership' => $this->memberships->row(Membership::findOrFail($id), true, true)]));
    }

    public function candidates(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        if (mb_strlen($q) < 2) {
            return response()->json(['users' => []]);
        }
        $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $q).'%';

        return response()->json(['users' => User::where(fn ($w) => $w->where('name', 'like', $like)->orWhere('email', 'like', $like))->orderBy('name')->limit(15)->get(['id', 'name', 'email'])]);
    }

    public function quote(Request $request): JsonResponse
    {
        $d = $request->validate(['plan_id' => 'required|integer', 'member_user_id' => 'required|integer', 'payer_user_id' => 'nullable|integer']);

        return $this->guard(fn () => response()->json($this->memberships->quote(Plan::findOrFail($d['plan_id']), User::findOrFail($d['member_user_id']), ! empty($d['payer_user_id']) ? User::findOrFail($d['payer_user_id']) : null)));
    }

    public function join(Request $request): JsonResponse
    {
        $d = $request->validate(['plan_id' => 'required|integer', 'member_user_id' => 'required|integer', 'payer_user_id' => 'nullable|integer', 'notes' => 'nullable|string|max:500']);

        return $this->guard(fn () => $this->one($this->memberships->join(Plan::findOrFail($d['plan_id']), $d, $request->user(), 'counter'), 'Membership started: take the payment to activate it.'));
    }

    public function payment(Request $request, int $period): JsonResponse
    {
        $d = $request->validate(['tenders' => 'required|array|min:1', 'tenders.*.payment_method_id' => 'required|integer', 'tenders.*.amount' => 'required|numeric', 'tenders.*.reference' => 'nullable|string|max:80']);

        return $this->guard(function () use ($request, $period, $d) {
            $p = $this->memberships->takePayment(Period::findOrFail($period), $d['tenders'], $request->user());

            return $this->one(Membership::findOrFail($p->membership_id), 'Payment taken.');
        });
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['reason' => 'nullable|string|max:300', 'immediate' => 'nullable|boolean']);
        $immediate = (bool) ($d['immediate'] ?? false);
        abort_if($immediate && ! $this->authz->allows($request->user(), 'memberships.grant'), 403, 'Ending a membership today needs the permission to give and end memberships.');

        return $this->guard(fn () => $this->one($this->memberships->cancel(Membership::findOrFail($id), $d['reason'] ?? null, $immediate, $request->user()), $immediate ? 'Membership ended.' : 'It will end when the paid time runs out.'));
    }

    public function keep(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => $this->one($this->memberships->keep(Membership::findOrFail($id), $request->user()), 'It will carry on.'));
    }

    public function pause(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['days' => 'required|integer']);

        return $this->guard(fn () => $this->one($this->memberships->pause(Membership::findOrFail($id), (int) $d['days'], $request->user(), true), 'Paused.'));
    }

    public function resume(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => $this->one($this->memberships->resume(Membership::findOrFail($id), $request->user()), 'Resumed.'));
    }

    public function changePlan(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['plan_id' => 'required|integer']);

        return $this->guard(fn () => $this->one($this->memberships->changePlan(Membership::findOrFail($id), Plan::findOrFail($d['plan_id']), $request->user()), 'Plan change recorded.'));
    }

    public function refund(Request $request, int $period): JsonResponse
    {
        $d = $request->validate(['reason' => 'nullable|string|max:300', 'refund_ledger_id' => 'nullable|integer']);

        return $this->guard(fn () => $this->one($this->memberships->refund(Period::findOrFail($period), $request->user(), $d['reason'] ?? null, $d['refund_ledger_id'] ?? null), 'Refunded: the credit note is in the books.'));
    }

    public function give(Request $request): JsonResponse
    {
        $d = $request->validate(['plan_id' => 'required|integer', 'member_user_id' => 'required|integer', 'until' => 'nullable|date', 'reason' => 'required|string|max:300']);

        return $this->guard(fn () => $this->one($this->memberships->give(Plan::findOrFail($d['plan_id']), User::findOrFail($d['member_user_id']), ! empty($d['until']) ? Carbon::parse($d['until']) : null, $d['reason'], $request->user()), 'Membership given.'));
    }
}
