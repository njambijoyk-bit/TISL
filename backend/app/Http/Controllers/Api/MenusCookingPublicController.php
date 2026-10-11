<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\PaymentMethod;
use App\Models\Location;
use App\Models\Menus\Chef;
use App\Models\Menus\CookingRequest;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use App\Services\Menus\CookingService;
use App\Services\Menus\MenusSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Asking for a cake or catering. Anyone can ask, signed in or not; the link in the confirmation (the request's secret token) is how a guest follows it.
 * Accepting a quote and paying need a signed-in customer. Nothing here shows cost, supplier or margin.
 */
class MenusCookingPublicController extends Controller
{
    public function __construct(private CookingService $cooking)
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

    /** What can be asked for: the cakes, the lead times, the deposit and the places that make them. */
    public function info(): JsonResponse
    {
        $s = MenusSettings::all();
        $on = CookingService::installed() && $s['custom_orders'];
        if (! $on) {
            return response()->json(['enabled' => false]);
        }
        $pay = PaymentMethod::offeredAtCheckout()->orderBy('sort_order')->get(['id', 'name', 'kind', 'gateway'])->filter(fn ($m) => GatewayPaymentService::isAutomatic($m))->values();

        return response()->json(['enabled' => true, 'cakes' => $this->cooking->cakes(), 'catering_lead_hours' => (int) $s['custom_lead_hours'], 'chef_lead_hours' => (int) $s['chef_lead_hours'], 'shopping' => CookingRequest::SHOPPING,
            'chefs' => CookingService::chefInstalled() ? Chef::where('is_active', true)->where('is_public', true)->orderBy('sort_order')->orderBy('display_name')->get(['id', 'display_name', 'title'])->map(fn ($c) => ['id' => $c->id, 'name' => $c->display_name, 'title' => $c->title])->values() : [], 'deposit_pct' => (float) $s['custom_deposit_pct'],
            'locations' => Location::query()->sellsToCustomers()->ordered()->get(['id', 'name'])->map(fn ($l) => ['id' => $l->id, 'name' => $l->name])->values(), 'payment_methods' => $pay]);
    }

    public function store(Request $request): JsonResponse
    {
        $d = $request->validate(['kind' => 'required|string|in:cake,catering,private_chef', 'location_id' => 'nullable|integer', 'name' => 'nullable|string|max:160', 'email' => 'nullable|email|max:190', 'phone' => 'nullable|string|max:40',
            'event_at' => 'required|string|max:40', 'fulfil' => 'nullable|string|in:pickup,delivery,serve', 'address' => 'nullable|string|max:500', 'headcount' => 'nullable|integer|min:1|max:5000',
            'message' => 'nullable|string|max:200', 'wishes' => 'nullable|string|max:1000', 'notes' => 'nullable|string|max:1000', 'duration_minutes' => 'nullable|integer|min:60|max:720', 'shopping' => 'nullable|string|in:chef,client,stock', 'dietary' => 'nullable|string|max:500', 'chef_id' => 'nullable|integer',
            'items' => 'nullable|array|max:30', 'items.*.dish_id' => 'required|integer',
            'items.*.quantity' => 'required|integer|min:1|max:50', 'items.*.option_ids' => 'nullable|array|max:40', 'items.*.option_ids.*' => 'integer', 'items.*.note' => 'nullable|string|max:200']);

        return $this->guard(function () use ($d, $request) {
            $r = $this->cooking->request($d, $request->user('sanctum'));

            return response()->json(['message' => $r->status === 'quoted' ? 'Your quote is ready.' : 'Thank you! We will send you a quote.', 'token' => $r->track_token, 'request' => $this->cooking->customerView($r)], 201);
        });
    }

    private function find(string $token): CookingRequest
    {
        return CookingRequest::where('track_token', $token)->firstOrFail();
    }

    public function show(string $token): JsonResponse
    {
        return response()->json(['request' => $this->cooking->customerView($this->find($token)),
            'payment_methods' => PaymentMethod::offeredAtCheckout()->orderBy('sort_order')->get(['id', 'name', 'kind', 'gateway'])->filter(fn ($m) => GatewayPaymentService::isAutomatic($m))->values()]);
    }

    public function accept(Request $request, string $token): JsonResponse
    {
        $d = $request->validate(['payment_method_id' => 'nullable|integer']);

        return $this->guard(function () use ($d, $request, $token) {
            $r = $this->cooking->accept($this->find($token), $d, $request->user('sanctum'));

            return response()->json(['message' => $r['message'], 'request' => $this->cooking->customerView($r['request']), 'attempt' => $r['attempt'] ?? null, 'redirect_url' => $r['redirect_url'] ?? null]);
        });
    }

    public function pay(Request $request, string $token): JsonResponse
    {
        $d = $request->validate(['payment_method_id' => 'required|integer']);

        return $this->guard(function () use ($d, $request, $token) {
            $r = $this->cooking->pay($this->find($token), $d, $request->user('sanctum'));

            return response()->json(['message' => $r['message'], 'request' => $this->cooking->customerView($r['request']), 'attempt' => $r['attempt'], 'redirect_url' => $r['redirect_url']]);
        });
    }

    /** The customer turns the quote down (or withdraws the request) before accepting. */
    public function decline(string $token): JsonResponse
    {
        return $this->guard(fn () => response()->json(['request' => $this->cooking->customerView($this->cooking->decline($this->find($token), 'Declined by the customer'))]));
    }
}
