<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\OrderActivityLog;
use Illuminate\Http\JsonResponse;

/**
 * Read-only views of the retired order tables (customer history, activity feed, report counts, project links,
 * delivery). Orders are made, changed and paid as vouchers now: see CheckoutController and BooksVoucherController.
 */
class OrderController extends Controller
{
    public function index(Request $request)
    {
        $query = Order::with(['customer', 'items']);

        if ($request->filled('status'))         $query->where('status', $request->status);
        if ($request->has('order_type'))         $query->where('order_type', $request->order_type);
        if ($request->filled('payment_status')) $query->where('payment_status', $request->payment_status);

        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('id', $request->search)
                  ->orWhereHas('customer', fn ($c) =>
                      $c->where('email', 'like', '%' . $request->search . '%')
                        ->orWhere('first_name', 'like', '%' . $request->search . '%')
                        ->orWhere('last_name', 'like', '%' . $request->search . '%')
                  );
            });
        }

        if ($request->filled('from_date')) $query->whereDate('created_at', '>=', $request->from_date);
        if ($request->filled('to_date'))   $query->whereDate('created_at', '<=', $request->to_date);

        $orders = $query->orderBy('created_at', 'desc')->paginate(20);

        return response()->json([
            'data' => collect($orders->items())->map(function ($order) {
                $arr = $order->toArray();
                $arr['credit_account_deduction'] = (float) ($order->metadata['credit_account_deduction'] ?? 0);
                return $arr;
            }),
            'meta' => [
                'current_page' => $orders->currentPage(),
                'last_page'    => $orders->lastPage(),    // ✅ ADD THIS
                'per_page'     => $orders->perPage(),
                'total'        => $orders->total(),
                'from'         => $orders->firstItem(),   // optional but useful
                'to'           => $orders->lastItem(),    // optional but useful
            ],
        ]);

    }

    public function adminCustomerOrders(Request $request, $customerId)
    {
        $query = Order::with(['customer'])
              ->withCount('items')
              ->where('customer_id', $customerId);

        if ($request->filled('status'))         $query->where('status', $request->status);
        if ($request->filled('payment_status')) $query->where('payment_status', $request->payment_status);
        if ($request->filled('order_type'))     $query->where('order_type', $request->order_type);
        if ($request->filled('total'))     $query->where('total', $request->total);

        $orders = $query->orderBy($request->get('sort_by', 'created_at'), $request->get('sort_order', 'desc'))
                        ->paginate($request->get('per_page', 10));

        $mapped = $orders->getCollection()->map(function ($order) {
            $arr = $order->toArray();
            $arr['credit_account_deduction'] = (float) ($order->metadata['credit_account_deduction'] ?? 0);
            return $arr;
        });

        return response()->json($orders->setCollection($mapped), 200);
    }

    public function adminShow(Request $request, $id)
    {
        $order = Order::with(['items.product', 'customer', 'assignedTo', 'quote', 'promoCode', 'referralCode', 'payments'])->findOrFail($id);
        //return response()->json(['order' => $order], 200);
        return response()->json([
        'order' => array_merge($order->toArray(), [
            'promo_code'    => $order->promoCode?->code,
            'referral_code' => $order->referralCode?->code,
            'credit_account_deduction' => (float) ($order->metadata['credit_account_deduction'] ?? 0),
        ]),
    ], 200);
    }

    public function statistics(Request $request)
    {
        $allOrders = Order::with('items')->get();

        $orderNetKes = function ($order) {
            $total     = (float) ($order->total ?? 0);
            $refunded  = (float) ($order->items->sum('refund_amount') ?? 0);
            $net       = max(0, $total - $refunded);
            $ccy       = $order->currency ?? 'KES';
            if ($ccy === 'KES') return $net;
            $totalKes  = (float) ($order->total_kes ?? 0);
            if ($totalKes > 0) return $total > 0 ? ($totalKes * ($net / $total)) : 0;
            $rate      = (float) ($order->exchange_rate_to_kes ?? 0);
            return $rate > 0 ? ($net * $rate) : 0;
        };

        $totalRevenueKes = 0;
        foreach ($allOrders->where('payment_status', 'paid') as $order) $totalRevenueKes += $orderNetKes($order);

        $todayOrders     = $allOrders->filter(fn ($o) => $o->created_at && $o->created_at->isToday());
        $todayRevenueKes = 0;
        foreach ($todayOrders->where('payment_status', 'paid') as $order) $todayRevenueKes += $orderNetKes($order);

        return response()->json([
            'total_orders'           => Order::count(),
            'pending'                => Order::where('status', 'pending')->count(),
            'confirmed'              => Order::where('status', 'confirmed')->count(),
            'processing'             => Order::where('status', 'processing')->count(),
            'shipped'                => Order::where('status', 'shipped')->count(),
            'delivered'              => Order::where('status', 'delivered')->count(),
            'cancelled'              => Order::where('status', 'cancelled')->count(),
            'total_revenue'          => $totalRevenueKes,
            'today'                  => $todayOrders->count(),
            'today_revenue'          => $todayRevenueKes,
            'gross_revenue'          => Order::where('payment_status', 'paid')->sum('total'),
            'unpaid_amount'          => Order::where('payment_status', 'unpaid')->sum('total'),
            'average_order_value'    => Order::avg('total'),
            'orders_with_backorder'  => Order::whereHas('items', fn ($q) => $q->where('backorder_quantity', '>', 0))->count(),
        ], 200);
    }

    public function customerOrderStatistics($customerId)
    {
        $customer = Customer::findOrFail($customerId);

        // ✅ ALL ORDERS ONLY (no filtering anywhere)
        $orders = Order::where('customer_id', $customerId)->get();

        $totalOrders = $orders->count();

        $totalSpent = $orders->sum('total_kes');

        $avgOrderValue = $totalOrders > 0
            ? $totalSpent / $totalOrders
            : 0;

        $firstOrder = $orders->sortBy('created_at')->first();
        $lastOrder  = $orders->sortByDesc('created_at')->first();

        return response()->json([
            'total_orders' => $totalOrders,
            'total_spent' => (float) $totalSpent,
            'average_order_value' => round($avgOrderValue, 2),
            'first_order_date' => $firstOrder?->created_at,
            'last_order_date' => $lastOrder?->created_at,
        ]);
    }

    // GET /admin/orders/{id}/activity  — used in OrderDetail

    // GET /admin/orders/activity  — used in activity logs page
    public function getAllOrderActivity(Request $request): JsonResponse
    {
        $query = OrderActivityLog::with('order:id,order_number')
            ->orderByDesc('created_at');

        if ($request->filled('order_id'))  $query->where('order_id', $request->order_id);
        if ($request->filled('severity'))  $query->where('severity', $request->severity);
        if ($request->filled('action'))    $query->where('action', 'like', "%{$request->action}%");
        if ($request->filled('performed_by')) $query->where('performed_by', 'like', "%{$request->performed_by}%");

        return response()->json(
            $query->paginate($request->integer('per_page', 50))
        );
    }

    // ========================================
    // SHARED ORDER ITEM CREATION
    // ========================================

    // ========================================
    // HELPER METHODS
    // ========================================

}