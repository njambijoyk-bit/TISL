<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Books\PaymentMethod;
use App\Models\Menus\Channel;
use App\Models\Menus\Menu;
use App\Models\Menus\MenuOrder;
use App\Models\ShippingOption;
use App\Services\Books\BooksException;
use App\Services\Menus\ChannelService;
use App\Services\Menus\MenuOrderService;
use App\Services\Menus\MenuOrderView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Menus → Orders (the kitchen's board for online orders) and Menus → Ways to order. */
class MenusOrderAdminController extends Controller
{
    public function __construct(private MenuOrderService $orders, private MenuOrderView $view, private ChannelService $channels)
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

    /** Orders still going, plus (with ?all=1) the finished ones of the last days. */
    public function index(Request $request): JsonResponse
    {
        $q = MenuOrder::with('lines', 'channel')->orderBy('fulfil_at');
        if ($request->boolean('all')) {
            $q->where('created_at', '>=', now()->subDays(max(1, min(30, (int) $request->input('days', 3)))))->orderByDesc('id');
        } else {
            $q->whereNotIn('status', ['completed', 'cancelled'])->whereNotIn('payment', ['pending', 'failed']);
        }
        $waiting = MenuOrder::where('payment', 'pending')->whereNotIn('status', ['cancelled'])->count();

        return response()->json(['orders' => $q->limit(300)->get()->map(fn ($o) => $this->view->staff($o))->values(), 'waiting_for_payment' => $waiting, 'statuses' => MenuOrder::STATUSES,
            'payment_methods' => PaymentMethod::where('is_active', true)->orderBy('sort_order')->get(['id', 'name', 'kind'])]);
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['to' => 'required|string|in:accepted,preparing,ready,out,completed,cancelled', 'reason' => 'nullable|string|max:300']);

        return $this->guard(fn () => response()->json(['order' => $this->view->staff($this->orders->advance(MenuOrder::findOrFail($id), $d['to'], $request->user(), $d['reason'] ?? null))]));
    }

    public function pay(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['tenders' => 'required|array|min:1|max:5', 'tenders.*.payment_method_id' => 'required|integer', 'tenders.*.amount' => 'nullable|numeric|min:0', 'tenders.*.reference' => 'nullable|string|max:100']);

        return $this->guard(fn () => response()->json(['order' => $this->view->staff($this->orders->takePayment(MenuOrder::findOrFail($id), $d['tenders'], $request->user()))]));
    }

    public function channelList(): JsonResponse
    {
        return response()->json([
            'channels' => Channel::orderBy('sort_order')->get(),
            'menus' => Menu::orderBy('name')->get(['id', 'name']),
            'shipping_options' => ShippingOption::query()->where('is_active', true)->get()->map(fn ($o) => ['id' => $o->id, 'name' => $o->name])->values(),
            'payment_modes' => Channel::PAYMENT_MODES,
        ]);
    }

    public function saveChannel(Request $request, int $id): JsonResponse
    {
        $d = $request->validate([
            'name' => 'nullable|string|max:80', 'is_active' => 'nullable|boolean', 'prep_minutes' => 'nullable|integer', 'slot_minutes' => 'nullable|integer', 'max_days_ahead' => 'nullable|integer',
            'allow_asap' => 'nullable|boolean', 'payment_modes' => 'nullable|array', 'payment_modes.*' => 'string', 'menu_ids' => 'nullable|array', 'menu_ids.*' => 'integer',
            'shipping_option_ids' => 'nullable|array', 'shipping_option_ids.*' => 'integer', 'min_order' => 'nullable|numeric|min:0', 'note' => 'nullable|string|max:300',
        ]);

        return $this->guard(fn () => response()->json(['message' => 'Saved.', 'channel' => $this->channels->save(Channel::findOrFail($id), $d)]));
    }
}
