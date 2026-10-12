<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\PaymentMethod;
use App\Models\Memberships\Membership;
use App\Models\Memberships\Period;
use App\Models\Memberships\Plan;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use App\Services\Memberships\MembershipService;
use App\Services\Memberships\MembershipSettings;
use App\Services\Memberships\PlanService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The member's side: the plans anyone can read, and a signed-in person joining, paying and managing a membership they hold or pay for. */
class MembershipPublicController extends Controller
{
    public function __construct(private MembershipService $memberships)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(MembershipService::installed(), 422, 'Memberships are not set up yet.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function plans(Request $request): JsonResponse
    {
        abort_unless(PlanService::installed(), 404);

        return response()->json(['plans' => $this->memberships->publicPlans($request->user('sanctum'))]);
    }

    /** One of my memberships (as member or payer), never anyone else's. */
    private function mineOf(Request $request, int $id): Membership
    {
        $uid = $request->user()->id;

        return Membership::where(fn ($w) => $w->where('member_user_id', $uid)->orWhere('payer_user_id', $uid))->findOrFail($id);
    }

    private function methods()
    {
        return PaymentMethod::offeredAtCheckout()->orderBy('sort_order')->get(['id', 'name', 'kind', 'gateway'])->filter(fn ($m) => GatewayPaymentService::isAutomatic($m))->values();
    }

    public function mine(Request $request): JsonResponse
    {
        return response()->json(['ready' => MembershipService::installed(), 'memberships' => $this->memberships->mine($request->user()), 'payment_methods' => $this->methods(),
            'settings' => ['allow_member_cancel' => (bool) MembershipSettings::all()['allow_member_cancel'], 'pause_days_per_year' => (int) MembershipSettings::all()['pause_days_per_year']]]);
    }

    private function one(Request $request, Membership $m, string $message, array $extra = []): JsonResponse
    {
        return response()->json(['message' => $message, 'membership' => $this->memberships->row($m->fresh(), false, true) + ['as_payer' => (int) $m->member_user_id !== (int) $request->user()->id]] + $extra);
    }

    public function quote(Request $request, int $plan): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->memberships->quote(Plan::where('status', 'published')->findOrFail($plan), $request->user()) + ['payment_methods' => $this->methods()]));
    }

    /** Join a plan yourself. With a payment method the first payment is started at once. */
    public function join(Request $request, int $plan): JsonResponse
    {
        $d = $request->validate(['payment_method_id' => 'nullable|integer', 'phone' => 'nullable|string|max:40']);

        return $this->guard(function () use ($request, $plan, $d) {
            $m = $this->memberships->join(Plan::where('status', 'published')->findOrFail($plan), ['member_user_id' => $request->user()->id], null, 'online');
            $pay = null;
            $open = $this->memberships->openPeriod($m);
            if ($open && ! empty($d['payment_method_id'])) {
                $pay = $this->memberships->pay($open, ['payment_method_id' => $d['payment_method_id'], 'phone' => $d['phone'] ?? null], $request->user());
            }

            return $this->one($request, $m, $pay['message'] ?? ($open ? 'Your membership is waiting for payment.' : 'Welcome! Your membership has started.'), ['attempt' => $pay['attempt'] ?? null, 'redirect_url' => $pay['redirect_url'] ?? null]);
        });
    }

    public function pay(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['payment_method_id' => 'required|integer', 'phone' => 'nullable|string|max:40']);

        return $this->guard(function () use ($request, $id, $d) {
            $m = $this->mineOf($request, $id);
            $open = $this->memberships->openPeriod($m) ?? throw new BooksException('There is nothing to pay.');
            $r = $this->memberships->pay($open, $d, $request->user());

            return $this->one($request, $m, $r['message'], ['attempt' => $r['attempt'], 'redirect_url' => $r['redirect_url']]);
        });
    }

    public function pause(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['days' => 'required|integer']);

        return $this->guard(fn () => $this->one($request, $this->memberships->pause($this->mineOf($request, $id), (int) $d['days'], $request->user(), false), 'Your membership is paused.'));
    }

    public function resume(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => $this->one($request, $this->memberships->resume($this->mineOf($request, $id), $request->user()), 'Welcome back.'));
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['reason' => 'nullable|string|max:300']);

        return $this->guard(function () use ($request, $id, $d) {
            abort_unless(MembershipSettings::all()['allow_member_cancel'], 403, 'Please contact us to end your membership.');
            $m = $this->mineOf($request, $id);

            return $this->one($request, $this->memberships->cancel($m, $d['reason'] ?? null, false, $request->user()), $m->status === 'pending' ? 'Cancelled.' : 'Your membership will end when the time you paid for runs out.');
        });
    }

    public function keep(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => $this->one($request, $this->memberships->keep($this->mineOf($request, $id), $request->user()), 'Your membership will carry on.'));
    }

    public function changePlan(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['plan_id' => 'required|integer']);

        return $this->guard(function () use ($request, $id, $d) {
            $m = $this->memberships->changePlan($this->mineOf($request, $id), Plan::where('status', 'published')->findOrFail($d['plan_id']), $request->user());
            $open = $this->memberships->openPeriod($m);

            return $this->one($request, $m, $open ? 'To finish the upgrade, pay the invoice.' : 'Your plan will change at your next renewal.');
        });
    }
}
