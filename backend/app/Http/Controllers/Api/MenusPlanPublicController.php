<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\PaymentMethod;
use App\Models\Menus\Plan;
use App\Models\Menus\SubDelivery;
use App\Models\Menus\SubPeriod;
use App\Models\Menus\Subscription;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\PlanService;
use App\Services\Menus\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Meal plans for customers. Anyone can look and subscribe (no sign-in); the link in the confirmation (the subscription's secret token) is how a subscriber manages their plan: skip a day,
 * pause, change the address, pay the next week, cancel. Nothing here shows cost, supplier or margin.
 */
class MenusPlanPublicController extends Controller
{
    public function __construct(private SubscriptionService $subs, private PlanService $plans)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function methods()
    {
        return PaymentMethod::offeredAtCheckout()->orderBy('sort_order')->get(['id', 'name', 'kind', 'gateway'])->filter(fn ($m) => GatewayPaymentService::isAutomatic($m))->values();
    }

    public function index(): JsonResponse
    {
        if (! SubscriptionService::installed() || ! MenusSettings::all()['plans_enabled']) {
            return response()->json(['enabled' => false]);
        }

        return response()->json(['enabled' => true, 'plans' => array_map(fn ($p) => array_diff_key($p, array_flip(['subscribers', 'location_id', 'sort_order'])), $this->plans->rows(null, true)), 'payment_methods' => $this->methods()]);
    }

    public function subscribe(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['name' => 'nullable|string|max:160', 'phone' => 'nullable|string|max:40', 'email' => 'nullable|email|max:190', 'address' => 'required|string|max:500', 'weekdays' => 'required|array|min:1|max:7', 'weekdays.*' => 'integer|min:1|max:7',
            'start_date' => 'required|date', 'payment_method_id' => 'required|integer', 'notes' => 'nullable|string|max:500']);

        return $this->guard(function () use ($d, $request, $id) {
            $r = $this->subs->subscribe(Plan::findOrFail($id), $d, $request->user('sanctum'));

            return response()->json(['message' => $r['message'], 'token' => $r['subscription']->manage_token, 'subscription' => $this->subs->customerView($r['subscription']), 'attempt' => $r['attempt'], 'redirect_url' => $r['redirect_url']], 201);
        });
    }

    private function find(string $token): Subscription
    {
        return Subscription::where('manage_token', $token)->firstOrFail();
    }

    public function show(string $token): JsonResponse
    {
        return response()->json(['subscription' => $this->subs->customerView($this->find($token)), 'payment_methods' => $this->methods()]);
    }

    private function delivery(Subscription $s, int $id): SubDelivery
    {
        return SubDelivery::where('subscription_id', $s->id)->findOrFail($id);
    }

    public function skip(string $token, int $delivery): JsonResponse
    {
        return $this->guard(function () use ($token, $delivery) {
            $s = $this->find($token);
            $this->subs->skip($s, $this->delivery($s, $delivery));

            return response()->json(['message' => 'Skipped.', 'subscription' => $this->subs->customerView($s->fresh())]);
        });
    }

    public function unskip(string $token, int $delivery): JsonResponse
    {
        return $this->guard(function () use ($token, $delivery) {
            $s = $this->find($token);
            $this->subs->unskip($s, $this->delivery($s, $delivery));

            return response()->json(['message' => 'Put back.', 'subscription' => $this->subs->customerView($s->fresh())]);
        });
    }

    public function pause(Request $request, string $token): JsonResponse
    {
        $d = $request->validate(['from' => 'nullable|date', 'until' => 'nullable|date']);

        return $this->guard(function () use ($d, $token) {
            $s = $this->subs->pause($this->find($token), $d['from'] ?? null, $d['until'] ?? null);

            return response()->json(['message' => 'Your plan is paused.', 'subscription' => $this->subs->customerView($s)]);
        });
    }

    public function resume(string $token): JsonResponse
    {
        return $this->guard(function () use ($token) {
            $s = $this->subs->resume($this->find($token));

            return response()->json(['message' => 'Welcome back: your plan is running again.', 'subscription' => $this->subs->customerView($s)]);
        });
    }

    public function cancel(Request $request, string $token): JsonResponse
    {
        $d = $request->validate(['reason' => 'nullable|string|max:300']);

        return $this->guard(function () use ($d, $token) {
            $s = $this->subs->cancel($this->find($token), $d['reason'] ?? 'Cancelled by the customer');

            return response()->json(['message' => 'Your plan is cancelled. Days you paid for and did not get are given back.', 'subscription' => $this->subs->customerView($s)]);
        });
    }

    public function update(Request $request, string $token): JsonResponse
    {
        $d = $request->validate(['address' => 'nullable|string|max:500', 'phone' => 'nullable|string|max:40', 'weekdays' => 'nullable|array|max:7', 'weekdays.*' => 'integer|min:1|max:7']);

        return $this->guard(function () use ($d, $token) {
            $s = $this->subs->update($this->find($token), array_filter($d, fn ($v) => $v !== null));

            return response()->json(['message' => 'Saved.', 'subscription' => $this->subs->customerView($s)]);
        });
    }

    public function pay(Request $request, string $token, int $period): JsonResponse
    {
        $d = $request->validate(['payment_method_id' => 'required|integer']);

        return $this->guard(function () use ($d, $request, $token, $period) {
            $s = $this->find($token);
            $r = $this->subs->pay($s, SubPeriod::where('subscription_id', $s->id)->findOrFail($period), $d, $request->user('sanctum'));

            return response()->json(['message' => $r['message'], 'attempt' => $r['attempt'], 'redirect_url' => $r['redirect_url'], 'subscription' => $this->subs->customerView($s->fresh())]);
        });
    }
}
