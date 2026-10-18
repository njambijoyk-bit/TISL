<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\PaymentMethod;
use App\Models\Location;
use App\Models\Menus\Channel;
use App\Models\Menus\MenuOrder;
use App\Models\ShippingOption;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use App\Services\Menus\MenuOrderService;
use App\Services\Menus\MenuOrderView;
use App\Services\Menus\OrderSlots;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/** Ordering food online. Anyone can order, signed in or not; the link in the confirmation (the order's token) is how a guest follows their order. */
class MenusOrderController extends Controller
{
    public function __construct(private MenuOrderService $orders, private MenuOrderView $view, private OrderSlots $slots)
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

    /** The ways to order that are on, with the times that can be chosen, how to pay and (delivery) the delivery methods. */
    public function channels(): JsonResponse
    {
        $now = Carbon::now((string) config('app.timezone', 'Africa/Nairobi'));
        $pay = PaymentMethod::offeredAtCheckout()->orderBy('sort_order')->get(['id', 'name', 'kind', 'gateway'])->filter(fn ($m) => GatewayPaymentService::isAutomatic($m))->values();
        $channels = Channel::where('is_active', true)->whereIn('order_type', ['pickup', 'delivery'])->orderBy('sort_order')->get()->map(function (Channel $c) use ($now) {
            $times = $this->slots->forChannel($c, $now);
            $ship = $c->order_type === 'delivery'
                ? ShippingOption::query()->where('is_active', true)->when($c->shipping_option_ids, fn ($q) => $q->whereIn('ledgers.id', $c->shipping_option_ids))->get()->map(fn ($o) => ['id' => $o->id, 'name' => $o->name])->values()->all()
                : [];

            return ['code' => $c->code, 'name' => $c->name, 'order_type' => $c->order_type, 'note' => $c->note, 'min_order' => (float) $c->min_order, 'payment_modes' => $c->payment_modes ?? ['online', 'later'],
                'asap' => $times['asap'], 'slots' => $times['slots'], 'delivery_options' => $ship];
        })->values();
        $branches = Location::query()->sellsToCustomers()->ordered()->get(['id', 'name'])->map(fn ($l) => ['id' => $l->id, 'name' => $l->name])->values();

        return response()->json(['channels' => $channels, 'payment_methods' => $pay, 'locations' => $branches]);
    }

    private function rules(): array
    {
        return ['channel' => 'required|string|max:30', 'location_id' => 'nullable|integer', 'fulfil' => 'nullable|string|max:40',
            'items' => 'required|array|min:1|max:60', 'items.*.dish_id' => 'required|integer', 'items.*.quantity' => 'required|integer|min:1|max:50', 'items.*.mods' => 'nullable|array|max:30', 'items.*.mods.*.ingredient_id' => 'required|integer', 'items.*.mods.*.kind' => 'required|string|in:remove,extra', 'items.*.serving_id' => 'nullable|integer', 'items.*.picks' => 'nullable|array', 'items.*.picks.*' => 'array', 'items.*.option_ids' => 'nullable|array|max:40',
            'items.*.option_ids.*' => 'integer', 'items.*.note' => 'nullable|string|max:200', 'address' => 'nullable|string|max:500', 'shipping_option_id' => 'nullable|integer',
            'name' => 'nullable|string|max:160', 'email' => 'nullable|email|max:190', 'phone' => 'nullable|string|max:40', 'notes' => 'nullable|string|max:500',
            'payment_mode' => 'nullable|string|in:online,later', 'payment_method_id' => 'nullable|integer'];
    }

    public function quote(Request $request): JsonResponse
    {
        $d = $request->validate($this->rules());

        return $this->guard(fn () => response()->json($this->orders->quote($d, $request->user('sanctum'))));
    }

    public function place(Request $request): JsonResponse
    {
        $d = $request->validate($this->rules());

        return $this->guard(function () use ($d, $request) {
            $r = $this->orders->place($d, $request->user('sanctum'));
            $o = $r['order'];

            return response()->json(['status' => $r['status'], 'message' => $r['message'], 'token' => $o->track_token, 'order' => $this->view->customer($o), 'attempt' => $r['attempt'] ?? null, 'redirect_url' => $r['redirect_url'] ?? null], 201);
        });
    }

    private function find(string $token): MenuOrder
    {
        return MenuOrder::where('track_token', $token)->firstOrFail();
    }

    public function show(string $token): JsonResponse
    {
        return response()->json(['order' => $this->view->customer($this->find($token))]);
    }

    /** A customer may cancel while the kitchen has not started and before paying (once paid, they call us). */
    public function cancel(Request $request, string $token): JsonResponse
    {
        $o = $this->find($token);

        return $this->guard(function () use ($o) {
            if ($o->status !== 'placed' || $o->payment === 'paid') {
                throw new BooksException('This order can not be cancelled here any more: please call us.');
            }

            return response()->json(['order' => $this->view->customer($this->orders->cancel($o, 'Cancelled by the customer'))]);
        });
    }
}
