<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\Customer;
use App\Models\CustomerTier;
use App\Models\CustomerTypeDiscount;
use App\Models\Currency;
use App\Models\Hamper;
use App\Models\HamperOrder;
use App\Models\LoyaltyPointTransaction;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Project;
use App\Models\ProjectMilestone;
use App\Models\Quote;
use App\Models\QuoteRequest;
use App\Models\ReferralCode;
use App\Models\ReferralCodeUsage;
use App\Models\Service;
use App\Models\ShippingOption;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class ReportsController extends Controller
{
    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    private function periodDates(Request $request): array
    {
        $period = $request->get('period', '30d');

        if ($period === 'custom') {
            $start = $request->get('start') ? Carbon::parse($request->get('start'))->startOfDay() : now()->subDays(30)->startOfDay();
            $end   = $request->get('end')   ? Carbon::parse($request->get('end'))->endOfDay()     : now()->endOfDay();
        } else {
            $end = now()->endOfDay();
            $start = match ($period) {
                '7d'  => now()->subDays(7)->startOfDay(),
                '90d' => now()->subDays(90)->startOfDay(),
                '12m' => now()->subMonths(12)->startOfDay(),
                default => now()->subDays(30)->startOfDay(),
            };
        }

        return [$start, $end];
    }

    private function orderNetKes(Order $order): float
    {
        $totalKes = (float) ($order->total_kes ?? 0);
        $refunded = (float) ($order->items_sum_refund_amount ?? 0);

        // convert refund to KES if foreign currency
        if ($order->currency !== 'KES' && (float)($order->total ?? 0) > 0) {
            $ratio    = $totalKes / (float) $order->total;
            $refunded = $refunded * $ratio;
        }

        return max(0, $totalKes - $refunded);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET /admin/reports/revenue
    // ──────────────────────────────────────────────────────────────────────────

    // ── revenue() ────────────────────────────────────────────────────────────────

    public function revenue(Request $request): JsonResponse
    {
        [$start, $end] = $this->periodDates($request);

        // All-time total (intentionally unfiltered — headline KPI)
        $totalRevenueKes = Order::where('payment_status', 'paid')
            ->withSum('items as items_sum_refund_amount', 'refund_amount')
            ->get(['id', 'total_kes', 'total', 'currency'])
            ->sum(fn ($o) => $this->orderNetKes($o));

        // ✅ Everything below should use the PERIOD, not all-time
        $periodPaid = Order::where('payment_status', 'paid')
            ->whereBetween('paid_at', [$start, $end])
            ->withSum('items as items_sum_refund_amount', 'refund_amount')
            ->get();

        $periodRevenueKes = $periodPaid->sum(fn ($o) => $this->orderNetKes($o));

        // ✅ avg + paid count scoped to period
        $periodCount = $periodPaid->count();
        $avgKes      = $periodCount > 0 ? $periodRevenueKes / $periodCount : 0;

        // ✅ unpaid scoped to period (created_at since unpaid orders have no paid_at)
        $unpaidKes = Order::where('payment_status', '!=', 'paid')
            ->whereBetween('created_at', [$start, $end])   // ← was missing period filter
            ->withSum('items as items_sum_refund_amount', 'refund_amount')
            ->get(['id', 'total_kes', 'total', 'currency'])->sum(fn ($o) => $this->orderNetKes($o));

        // ✅ by_currency scoped to period
        $byCurrency = Order::selectRaw('currency, COUNT(*) as order_count, SUM(total) as total_native, SUM(total_kes) as total_kes')
            ->where('payment_status', 'paid')
            ->whereBetween('paid_at', [$start, $end])       // ← was missing period filter
            ->groupBy('currency')
            ->get()
            ->map(function ($row) {
                try {
                    $sym = Currency::where('code', $row->currency)->value('symbol') ?? $row->currency;
                } catch (\Exception $e) {
                    $sym = $row->currency;
                }
                return [
                    'currency'      => $row->currency,
                    'native_symbol' => $sym,
                    'order_count'   => (int) $row->order_count,
                    'total_native'  => (float) $row->total_native,
                    'total_kes'     => (float) $row->total_kes,
                ];
            })
            ->sortByDesc('total_kes')
            ->values();

        // Trend stays as-is (always 12-month rolling)
        $trendMonths = collect();
        for ($i = 11; $i >= 0; $i--) {
            $trendMonths->push(now()->subMonths($i)->format('Y-m'));
        }
        $trendRaw = Order::selectRaw("DATE_FORMAT(paid_at,'%Y-%m') as month, SUM(total_kes) as revenue")
            ->where('payment_status', 'paid')
            ->whereNotNull('paid_at')
            ->where('paid_at', '>=', now()->subMonths(11)->startOfMonth())
            ->groupBy('month')
            ->pluck('revenue', 'month');

        $trend = $trendMonths->map(fn ($m) => [
            'month' => $m,
            'label' => Carbon::createFromFormat('Y-m', $m)->format('M y'),
            'value' => (float) ($trendRaw[$m] ?? 0),
        ])->values();

        return response()->json([
            'total_revenue_kes'   => round($totalRevenueKes, 2),
            'period_revenue_kes'  => round($periodRevenueKes, 2),
            'avg_order_value_kes' => round($avgKes, 2),       // ✅ now period-scoped
            'paid_orders'         => $periodCount,            // ✅ now period-scoped
            'unpaid_kes'          => round($unpaidKes, 2),    // ✅ now period-scoped
            'by_currency'         => $byCurrency,             // ✅ now period-scoped
            'trend'               => $trend,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET /admin/reports/orders
    // ──────────────────────────────────────────────────────────────────────────

    public function orders(Request $request): JsonResponse
    {
        [$start, $end] = $this->periodDates($request);

        // 1. Fetch orders within the period for the specific status counts
        // We use a query builder here so we don't load thousands of models into memory just to count them
        $periodQuery = Order::whereBetween('created_at', [$start, $end]);

        // 2. Handle "Today" stats (this part was mostly fine, but let's keep it clean)
        $todayOrders = Order::whereDate('created_at', Carbon::today())->get();
        $todayRevenueKes = $todayOrders->where('payment_status', 'paid')
            ->sum(fn ($o) => $this->orderNetKes($o));

        // 3. The Trend Logic (keep your existing 12-month logic as is)
        $months = collect();
        for ($i = 11; $i >= 0; $i--) {
            $months->push(now()->subMonths($i)->format('Y-m'));
        }
        $rawCounts = Order::selectRaw("DATE_FORMAT(created_at,'%Y-%m') as month, COUNT(*) as count")
            ->where('created_at', '>=', now()->subMonths(11)->startOfMonth())
            ->groupBy('month')
            ->pluck('count', 'month');

        $trend = $months->map(fn ($m) => [
            'month' => $m,
            'label' => Carbon::createFromFormat('Y-m', $m)->format('M y'),
            'value' => (int) ($rawCounts[$m] ?? 0),
        ])->values();

        return response()->json([
            'total_orders'          => Order::count(), // Total ever
            'period_orders'         => (clone $periodQuery)->count(), // Orders in 7d/30d/90d
            
            // Use the $periodQuery to make sure these status numbers actually change when you filter!
            'pending'               => (clone $periodQuery)->where('status', 'pending')->count(),
            'confirmed'             => (clone $periodQuery)->where('status', 'confirmed')->count(),
            'processing'            => (clone $periodQuery)->where('status', 'processing')->count(),
            'shipped'               => (clone $periodQuery)->where('status', 'shipped')->count(),
            'delivered'             => (clone $periodQuery)->where('status', 'delivered')->count(),
            'cancelled'             => (clone $periodQuery)->where('status', 'cancelled')->count(),
            
            'today'                 => $todayOrders->count(),
            'today_revenue'         => round($todayRevenueKes, 2),
            'average_order_value'   => round((clone $periodQuery)->avg('total_kes') ?? 0, 2),
            'orders_with_backorder' => (clone $periodQuery)->whereHas('items', fn ($q) => $q->where('backorder_quantity', '>', 0))->count(),
            'trend'                 => $trend,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET /admin/reports/products
    // ──────────────────────────────────────────────────────────────────────────

    public function products(Request $request): JsonResponse
    {
        [$start, $end] = $this->periodDates($request);

        // Inventory overview
        $totalProducts  = Product::count();
        $activeProducts = Product::whereIn('status', ['active', 'published'])->count();
        $inStock        = Product::where('in_stock', true)->count();
        $outOfStock     = Product::where('in_stock', false)->count();
        $lowStock       = Product::where('in_stock', true)->where('stock_quantity', '>', 0)->where('stock_quantity', '<=', 10)->count();
        $featured       = Product::where('is_featured', true)->count();
        $onSale         = Product::where('on_sale', true)->count();

        // Top products by revenue (from paid order items in period)
        $topByRevenue = OrderItem::select(
                'order_items.product_id',
                'order_items.product_name',
                'order_items.product_sku',
                'order_items.brand_name',
                DB::raw('SUM(order_items.line_total_after_discount) as revenue'),
                DB::raw('SUM(order_items.quantity) as qty_sold'),
                DB::raw('COUNT(DISTINCT order_items.order_id) as order_count')
            )
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.payment_status', 'paid')
            ->whereNotNull('order_items.product_id')
            ->whereBetween('orders.created_at', [$start, $end])
            ->where('order_items.item_type', 'product')
            ->groupBy('order_items.product_id', 'order_items.product_name', 'order_items.product_sku', 'order_items.brand_name')
            ->orderByDesc('revenue')
            ->limit(10)
            ->get()
            ->map(fn ($r, $i) => [
                'rank'        => $i + 1,
                'product_id'  => $r->product_id,
                'name'        => $r->product_name,
                'sku'         => $r->product_sku,
                'brand'       => $r->brand_name,
                'revenue'     => round((float) $r->revenue, 2),
                'qty_sold'    => (int) $r->qty_sold,
                'order_count' => (int) $r->order_count,
            ])
            ->values();

        // Top products by quantity sold
        $topByQty = OrderItem::select(
                'order_items.product_id',
                'order_items.product_name',
                'order_items.product_sku',
                'order_items.brand_name',
                DB::raw('SUM(order_items.quantity) as qty_sold'),
                DB::raw('SUM(order_items.line_total_after_discount) as revenue')
            )
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.payment_status', 'paid')
            ->whereNotNull('order_items.product_id')
            ->whereBetween('orders.created_at', [$start, $end])
            ->where('order_items.item_type', 'product')
            ->groupBy('order_items.product_id', 'order_items.product_name', 'order_items.product_sku', 'order_items.brand_name')
            ->orderByDesc('qty_sold')
            ->limit(10)
            ->get()
            ->map(fn ($r, $i) => [
                'rank'     => $i + 1,
                'name'     => $r->product_name,
                'sku'      => $r->product_sku,
                'brand'    => $r->brand_name,
                'qty_sold' => (int) $r->qty_sold,
                'revenue'  => round((float) $r->revenue, 2),
            ])
            ->values();

        // Products by brand (all time from catalog)
        $byBrand = Product::select(
                DB::raw('brands.name as brand_name'),
                DB::raw('COUNT(products.id) as product_count'),
                DB::raw('SUM(CASE WHEN products.in_stock = 1 THEN 1 ELSE 0 END) as in_stock_count')
            )
            ->leftJoin('brands', 'brands.id', '=', 'products.brand_id')
            ->whereNotNull('products.brand_id')
            ->groupBy('brands.name')
            ->orderByDesc('product_count')
            ->limit(10)
            ->get()
            ->map(fn ($r) => [
                'brand'         => $r->brand_name,
                'product_count' => (int) $r->product_count,
                'in_stock'      => (int) $r->in_stock_count,
            ])
            ->values();

        // Products by category
        $byCategory = Product::select(
                DB::raw('categories.name as category_name'),
                DB::raw('COUNT(products.id) as product_count'),
                DB::raw('SUM(CASE WHEN products.in_stock = 1 THEN 1 ELSE 0 END) as in_stock_count')
            )
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->whereNotNull('products.category_id')
            ->groupBy('categories.name')
            ->orderByDesc('product_count')
            ->limit(10)
            ->get()
            ->map(fn ($r) => [
                'category'      => $r->category_name,
                'product_count' => (int) $r->product_count,
                'in_stock'      => (int) $r->in_stock_count,
            ])
            ->values();

        // Revenue by brand from order items
        $brandRevenue = OrderItem::select(
                'order_items.brand_name',
                DB::raw('SUM(order_items.line_total_after_discount) as revenue'),
                DB::raw('SUM(order_items.quantity) as qty_sold'),
                DB::raw('COUNT(DISTINCT order_items.order_id) as order_count')
            )
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.payment_status', 'paid')
            ->whereNotNull('order_items.brand_name')
            ->whereBetween('orders.created_at', [$start, $end])
            ->where('order_items.item_type', 'product')
            ->groupBy('order_items.brand_name')
            ->orderByDesc('revenue')
            ->limit(10)
            ->get()
            ->map(fn ($r, $i) => [
                'rank'        => $i + 1,
                'brand'       => $r->brand_name,
                'revenue'     => round((float) $r->revenue, 2),
                'qty_sold'    => (int) $r->qty_sold,
                'order_count' => (int) $r->order_count,
            ])
            ->values();

        return response()->json([
            'total_products'  => $totalProducts,
            'active_products' => $activeProducts,
            'in_stock'        => $inStock,
            'out_of_stock'    => $outOfStock,
            'low_stock'       => $lowStock,
            'featured'        => $featured,
            'on_sale'         => $onSale,
            'top_by_revenue'  => $topByRevenue,
            'top_by_quantity' => $topByQty,
            'by_brand'        => $byBrand,
            'by_category'     => $byCategory,
            'brand_revenue'   => $brandRevenue,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET /admin/reports/brands
    // ──────────────────────────────────────────────────────────────────────────

    public function brands(Request $request): JsonResponse
    {
        [$start, $end] = $this->periodDates($request);

        $totalBrands    = Brand::count();
        $activeBrands   = Brand::where('is_active', true)->count();
        $featuredBrands = Brand::where('is_featured', true)->count();

        // Top brands by revenue (from order items — product items only)
        $topByRevenue = OrderItem::select(
                'order_items.brand_name',
                DB::raw('SUM(order_items.line_total_after_discount) as revenue'),
                DB::raw('SUM(order_items.quantity) as qty_sold'),
                DB::raw('COUNT(DISTINCT order_items.order_id) as order_count')
            )
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.payment_status', 'paid')
            ->whereNotNull('order_items.brand_name')
            ->whereBetween('orders.created_at', [$start, $end])
            ->where('order_items.item_type', 'product')
            ->groupBy('order_items.brand_name')
            ->orderByDesc('revenue')
            ->limit(10)
            ->get()
            ->map(fn ($r, $i) => [
                'rank'        => $i + 1,
                'brand'       => $r->brand_name,
                'revenue'     => round((float) $r->revenue, 2),
                'qty_sold'    => (int) $r->qty_sold,
                'order_count' => (int) $r->order_count,
            ])
            ->values();

        // Brands by product count (catalog)
        $byProductCount = Brand::select(
                'brands.id',
                'brands.name',
                'brands.is_active',
                'brands.is_featured',
                DB::raw('COUNT(products.id) as product_count'),
                DB::raw('SUM(CASE WHEN products.in_stock = 1 THEN 1 ELSE 0 END) as in_stock_count')
            )
            ->leftJoin('products', 'products.brand_id', '=', 'brands.id')
            ->groupBy('brands.id', 'brands.name', 'brands.is_active', 'brands.is_featured')
            ->orderByDesc('product_count')
            ->limit(10)
            ->get()
            ->map(fn ($r) => [
                'id'            => $r->id,
                'brand'         => $r->name,
                'is_active'     => (bool) $r->is_active,
                'is_featured'   => (bool) $r->is_featured,
                'product_count' => (int) $r->product_count,
                'in_stock'      => (int) $r->in_stock_count,
            ])
            ->values();

        return response()->json([
            'total_brands'    => $totalBrands,
            'active_brands'   => $activeBrands,
            'featured_brands' => $featuredBrands,
            'top_by_revenue'  => $topByRevenue,
            'by_product_count'=> $byProductCount,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET /admin/reports/services
    // ──────────────────────────────────────────────────────────────────────────

    public function services(Request $request): JsonResponse
    {
        [$start, $end] = $this->periodDates($request);

        $totalServices    = Service::count();
        $activeServices   = Service::whereIn('status', ['active', 'published'])->count();
        $featuredServices = Service::where('is_featured', true)->count();

        // Top services by revenue (from order items where item_type = 'service')
        $topByRevenue = OrderItem::select(
                'order_items.service_id',
                'order_items.service_name',
                'order_items.service_category',
                DB::raw('SUM(order_items.line_total_after_discount) as revenue'),
                DB::raw('SUM(order_items.quantity) as qty_sold'),
                DB::raw('COUNT(DISTINCT order_items.order_id) as order_count')
            )
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.payment_status', 'paid')
            ->where('order_items.item_type', 'service')
            ->whereBetween('orders.created_at', [$start, $end])
            ->groupBy('order_items.service_id', 'order_items.service_name', 'order_items.service_category')
            ->orderByDesc('revenue')
            ->limit(10)
            ->get()
            ->map(fn ($r, $i) => [
                'rank'        => $i + 1,
                'service_id'  => $r->service_id,
                'name'        => $r->service_name,
                'category'    => $r->service_category,
                'revenue'     => round((float) $r->revenue, 2),
                'qty_sold'    => (int) $r->qty_sold,
                'order_count' => (int) $r->order_count,
            ])
            ->values();

        // Services by category — derived from actual order items (what was ordered, not just the catalog)
        $byCategory = OrderItem::select(
                'order_items.service_category',
                DB::raw('COUNT(DISTINCT order_items.service_id) as service_count'),
                DB::raw('COUNT(DISTINCT order_items.order_id) as order_count'),
                DB::raw('SUM(order_items.line_total_after_discount) as revenue')
            )
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('order_items.item_type', 'service')
            ->whereNotNull('order_items.service_category')
            ->where('orders.payment_status', 'paid')
            ->whereBetween('orders.created_at', [$start, $end])
            ->groupBy('order_items.service_category')
            ->orderByDesc('order_count')
            ->get()
            ->map(fn ($r) => [
                'category'      => $r->service_category,
                'service_count' => (int) $r->service_count,
                'order_count'   => (int) $r->order_count,
                'revenue'       => round((float) $r->revenue, 2),
            ])
            ->values();

        // Service vs product revenue split
        $serviceRevenue = OrderItem::join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.payment_status', 'paid')
            ->where('order_items.item_type', 'service')
            ->whereBetween('orders.created_at', [$start, $end])
            ->sum('order_items.line_total_after_discount');

        $productRevenue = OrderItem::join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.payment_status', 'paid')
            ->where('order_items.item_type', 'product')
            ->whereBetween('orders.created_at', [$start, $end])
            ->sum('order_items.line_total_after_discount');

        return response()->json([
            'total_services'    => $totalServices,
            'active_services'   => $activeServices,
            'featured_services' => $featuredServices,
            'top_by_revenue'    => $topByRevenue,
            'by_category'       => $byCategory,
            'revenue_split'     => [
                'service_revenue' => round((float) $serviceRevenue, 2),
                'product_revenue' => round((float) $productRevenue, 2),
            ],
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET /admin/reports/tickets
    // ──────────────────────────────────────────────────────────────────────────

    public function tickets(Request $request): JsonResponse
    {
        [$start, $end] = $this->periodDates($request);

        // 1. Base Query for the selected period
        $periodQuery = Ticket::whereBetween('created_at', [$start, $end]);

        // 2. Ticket Status Counts (Filtered by Period)
        $open       = (clone $periodQuery)->where('status', 'open')->count();
        $inProgress = (clone $periodQuery)->where('status', 'in_progress')->count();
        $resolved   = (clone $periodQuery)->where('status', 'resolved')->count();
        $closed     = (clone $periodQuery)->where('status', 'closed')->count();
        $onHold     = (clone $periodQuery)->where('status', 'on_hold')->count();
        $waitingCustomer = (clone $periodQuery)->where('status', 'waiting_customer')->count();
        $unassigned = (clone $periodQuery)->whereNull('assigned_to')->count();
        $periodTotal = (clone $periodQuery)->count();

        // 3. Average first response time for the period (hours)
        $avgFirstResponseHours = 0;
        $responded = (clone $periodQuery)
            ->whereNotNull('first_responded_at')
            ->get(['created_at', 'first_responded_at']);
            
        if ($responded->isNotEmpty()) {
            $total_mins = $responded->sum(fn ($t) => $t->created_at->diffInMinutes($t->first_responded_at));
            $avgFirstResponseHours = round($total_mins / $responded->count() / 60, 1);
        }

        // 4. Average resolution time for the period (hours)
        $avgResolutionHours = 0;
        $resolvedTickets = (clone $periodQuery)
            ->whereNotNull('resolved_at')
            ->get(['created_at', 'resolved_at']);
            
        if ($resolvedTickets->isNotEmpty()) {
            $total_mins = $resolvedTickets->sum(fn ($t) => $t->created_at->diffInMinutes($t->resolved_at));
            $avgResolutionHours = round($total_mins / $resolvedTickets->count() / 60, 1);
        }

        // 5. By priority (Filtered)
        $priorityCounts = (clone $periodQuery)
            ->selectRaw('priority, COUNT(*) as count')
            ->whereNotNull('priority')
            ->groupBy('priority')
            ->pluck('count', 'priority');

        // 6. By category (Filtered)
        $byCategory = (clone $periodQuery)
            ->selectRaw('category, COUNT(*) as count')
            ->whereNotNull('category')
            ->groupBy('category')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($r) => [
                'category' => $r->category,
                'count'    => (int) $r->count,
            ])
            ->values();

        // 7. Monthly trend (Keep as 12-month historical view)
        $months = collect();
        for ($i = 11; $i >= 0; $i--) {
            $months->push(now()->subMonths($i)->format('Y-m'));
        }
        $rawCounts = Ticket::selectRaw("DATE_FORMAT(created_at,'%Y-%m') as month, COUNT(*) as count")
            ->where('created_at', '>=', now()->subMonths(11)->startOfMonth())
            ->groupBy('month')
            ->pluck('count', 'month');

        $trend = $months->map(fn ($m) => [
            'month' => $m,
            'label' => Carbon::createFromFormat('Y-m', $m)->format('M y'),
            'value' => (int) ($rawCounts[$m] ?? 0),
        ])->values();

        // 8. Resolution rate for the period
        $resolutionRate = $periodTotal > 0 ? round((($resolved + $closed) / $periodTotal) * 100, 1) : 0;

        return response()->json([
            'total'                     => Ticket::count(), // All time total
            'period_total'              => $periodTotal,    // Total in filter
            'open'                      => $open,
            'in_progress'               => $inProgress,
            'resolved'                  => $resolved,
            'closed'                    => $closed,
            'on_hold'                   => $onHold,
            'waiting_customer'          => $waitingCustomer,
            'unassigned'                => $unassigned,
            'period_resolved'           => $resolved + $closed,
            'avg_first_response_hours'  => $avgFirstResponseHours,
            'avg_resolution_hours'      => $avgResolutionHours,
            'resolution_rate'           => $resolutionRate,
            'by_priority'               => [
                'urgent' => (int) ($priorityCounts['urgent'] ?? 0),
                'high'   => (int) ($priorityCounts['high']   ?? 0),
                'medium' => (int) ($priorityCounts['medium'] ?? 0),
                'low'    => (int) ($priorityCounts['low']    ?? 0),
            ],
            'by_category'               => $byCategory,
            'trend'                     => $trend,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET /admin/reports/promos
    // ──────────────────────────────────────────────────────────────────────────

    public function promos(Request $request): JsonResponse
    {
        [$start, $end] = $this->periodDates($request);

        // ── Sub-selects of promo vs referral code IDs ─────────────────────────
        // Used repeatedly so we build them once as plain arrays (small tables).
        $promoCodeIds    = ReferralCode::where('type', '!=', 'customer_referral')->pluck('id');
        $referralCodeIds = ReferralCode::where('type', 'customer_referral')->pluck('id');

        // ── All-time code inventory (promo codes only) ────────────────────────
        $totalCodes    = ReferralCode::where('type', '!=', 'customer_referral')->count();
        $activeCodes   = ReferralCode::where('type', '!=', 'customer_referral')->where('status', 'active')->count();
        $expiredCodes  = ReferralCode::where('type', '!=', 'customer_referral')
            ->where(function ($q) {
                $q->where('status', 'expired')
                  ->orWhere(function ($q2) {
                      $q2->whereNotNull('valid_until')->where('valid_until', '<', now());
                  });
            })->count();
        $depletedCodes = ReferralCode::where('type', '!=', 'customer_referral')->where('status', 'depleted')->count();
        $pausedCodes   = ReferralCode::where('type', '!=', 'customer_referral')->where('status', 'paused')->count();
        $expiringSoon  = ReferralCode::where('type', '!=', 'customer_referral')->expiringSoon(7)->count();

        // ── Period-scoped financial impact (promo codes only) ─────────────────
        $periodUses = Order::whereIn('promo_code_id', $promoCodeIds)
            ->whereBetween('created_at', [$start, $end])
            ->whereNotNull('promo_code_id')
            ->count();

        $periodDiscountGiven = Order::whereIn('promo_code_id', $promoCodeIds)
            ->whereBetween('created_at', [$start, $end])
            ->sum('promo_discount');

        $periodRevenueFromPromos = Order::whereIn('promo_code_id', $promoCodeIds)
            ->whereBetween('created_at', [$start, $end])
            ->sum('total_kes');

        // ── All-time financial totals (promo codes only, backward-compat) ─────
        $totalUses              = ReferralCode::where('type', '!=', 'customer_referral')->sum('times_used');
        $totalDiscountGiven     = ReferralCode::where('type', '!=', 'customer_referral')->sum('total_discount_given');
        $totalRevenueFromPromos = ReferralCode::where('type', '!=', 'customer_referral')->sum('total_revenue');

        // ── Top codes by revenue (all types, frontend splits by type) ─────────
        $topByRevenue = ReferralCode::select(
                'id', 'code', 'name', 'type', 'reward_type', 'reward_value',
                'times_used', 'successful_uses', 'total_revenue', 'total_discount_given',
                'average_order_value', 'conversion_rate', 'status'
            )
            ->orderByDesc('total_revenue')
            ->limit(20)
            ->get()
            ->values()
            ->map(fn ($r, $i) => [
                'rank'            => $i + 1,
                'code'            => $r->code,
                'name'            => $r->name,
                'type'            => $r->type,
                'reward_type'     => $r->reward_type,
                'reward_value'    => (float) $r->reward_value,
                'uses'            => (int) $r->times_used,
                'successful_uses' => (int) $r->successful_uses,
                'revenue'         => round((float) $r->total_revenue, 2),
                'discount_given'  => round((float) $r->total_discount_given, 2),
                'avg_order_value' => round((float) $r->average_order_value, 2),
                'conversion_rate' => round((float) $r->conversion_rate, 1),
                'status'          => $r->status,
            ]);

        // ── By type breakdown (all-time) ──────────────────────────────────────
        $byType = ReferralCode::selectRaw(
                'type, COUNT(*) as count, SUM(total_revenue) as revenue, SUM(times_used) as uses'
            )
            ->groupBy('type')
            ->get()
            ->map(fn ($r) => [
                'type'    => $r->type,
                'count'   => (int) $r->count,
                'revenue' => round((float) $r->revenue, 2),
                'uses'    => (int) $r->uses,
            ])
            ->values();

        // ── Referral programme stats (all-time) ───────────────────────────────
        $totalReferralCodes = $referralCodeIds->count();

        $totalReferrals = $referralCodeIds->isEmpty() ? 0
            : ReferralCodeUsage::whereIn('referral_code_id', $referralCodeIds)->count();

        $completedReferrals = $referralCodeIds->isEmpty() ? 0
            : ReferralCodeUsage::whereIn('referral_code_id', $referralCodeIds)
                ->where('status', 'completed')->count();

        $pendingReferrals = $referralCodeIds->isEmpty() ? 0
            : ReferralCodeUsage::whereIn('referral_code_id', $referralCodeIds)
                ->where('status', 'pending')->count();

        $totalReferrerRewards = ReferralCode::where('type', 'customer_referral')
            ->sum('total_referrer_rewards');

        $conversionRate = $totalReferrals > 0
            ? round(($completedReferrals / $totalReferrals) * 100, 1)
            : 0;

        $referralStats = [
            'total_referral_codes'   => $totalReferralCodes,
            'total_referrals'        => $totalReferrals,
            'completed_referrals'    => $completedReferrals,
            'pending_referrals'      => $pendingReferrals,
            'conversion_rate'        => $conversionRate,
            'total_referrer_rewards' => round((float) $totalReferrerRewards, 2),
        ];

        // ── Trend: promo code usage over last 12 months ───────────────────────
        $months = collect();
        for ($i = 11; $i >= 0; $i--) {
            $months->push(now()->subMonths($i)->format('Y-m'));
        }

        if ($promoCodeIds->isEmpty()) {
            $trendRaw = collect();
        } else {
            $trendRaw = Order::whereIn('promo_code_id', $promoCodeIds)
                ->where('created_at', '>=', now()->subMonths(11)->startOfMonth())
                ->selectRaw("DATE_FORMAT(created_at,'%Y-%m') as month, COUNT(*) as count, SUM(promo_discount) as discount")
                ->groupBy('month')
                ->get()
                ->keyBy('month');
        }

        $trend = $months->map(fn ($m) => [
            'month'    => $m,
            'label'    => Carbon::createFromFormat('Y-m', $m)->format('M y'),
            'value'    => (int) ($trendRaw[$m]?->count ?? 0),
            'discount' => round((float) ($trendRaw[$m]?->discount ?? 0), 2),
        ])->values();

        return response()->json([
            // Inventory (all-time, promo codes only)
            'total_codes'                  => $totalCodes,
            'active_codes'                 => $activeCodes,
            'expired_codes'                => $expiredCodes,
            'depleted_codes'               => $depletedCodes,
            'paused_codes'                 => $pausedCodes,
            'expiring_soon'                => $expiringSoon,

            // Period-scoped impact
            'period_uses'                  => $periodUses,
            'period_discount_given'        => round((float) $periodDiscountGiven, 2),
            'period_revenue_from_promos'   => round((float) $periodRevenueFromPromos, 2),

            // All-time totals (backward compat)
            'total_uses'                   => (int) $totalUses,
            'total_discount_given'         => round((float) $totalDiscountGiven, 2),
            'total_revenue_from_promos'    => round((float) $totalRevenueFromPromos, 2),

            // Tables
            'top_by_revenue'               => $topByRevenue,
            'by_type'                      => $byType,

            // Referral programme
            'referrals'                    => $referralStats,

            // Trend
            'trend'                        => $trend,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET /admin/reports/quote-funnel
    // ──────────────────────────────────────────────────────────────────────────

    public function quoteFunnel(Request $request): JsonResponse
    {
        [$start, $end] = $this->periodDates($request);

        $totalRequests = QuoteRequest::count();
        $quotedCount   = QuoteRequest::quoted()->count();
        $convertedToOrders = Quote::whereNotNull('converted_to_order_id')->count();
        $totalQuotes       = Quote::count();

        $reqToQuoteRate   = $totalRequests > 0 ? ($quotedCount / $totalRequests) * 100 : 0;
        $quoteToOrderRate = $totalQuotes   > 0 ? ($convertedToOrders / $totalQuotes) * 100 : 0;
        $endToEndRate     = $totalRequests > 0 ? ($convertedToOrders / $totalRequests) * 100 : 0;

        $avgResponseHours = 0;
        $responded = QuoteRequest::whereNotNull('quoted_at')->get(['created_at', 'quoted_at']);
        if ($responded->isNotEmpty()) {
            $total = $responded->sum(fn ($r) => $r->created_at->diffInHours($r->quoted_at));
            $avgResponseHours = round($total / $responded->count(), 1);
        }

        $periodRequests = QuoteRequest::whereBetween('created_at', [$start, $end])->count();
        $periodQuoted   = QuoteRequest::quoted()->whereBetween('created_at', [$start, $end])->count();

        return response()->json([
            'total_requests'           => $totalRequests,
            'period_requests'          => $periodRequests,
            'period_quoted'            => $periodQuoted,
            'converted_to_quotes'      => $quotedCount,
            'converted_to_orders'      => $convertedToOrders,
            'total_quotes'             => $totalQuotes,
            'req_to_quote_rate'        => round($reqToQuoteRate, 2),
            'quote_to_order_rate'      => round($quoteToOrderRate, 2),
            'end_to_end_rate'          => round($endToEndRate, 2),
            'avg_response_hours'       => $avgResponseHours,
            'pending'                  => QuoteRequest::pending()->count(),
            'reviewing'                => QuoteRequest::reviewing()->count(),
            'quoted'                   => $quotedCount,
            'requires_clarification'   => QuoteRequest::requiresClarification()->count(),
            'rejected'                 => QuoteRequest::where('status', 'rejected')->count(),
            'expired'                  => QuoteRequest::where('status', 'expired')->count(),
            'unassigned'               => QuoteRequest::unassigned()->count(),
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET /admin/reports/projects
    // ──────────────────────────────────────────────────────────────────────────

    public function projects(Request $request): JsonResponse
{
    [$start, $end] = $this->periodDates($request);

    // 1. Filtered Status Counts
    $statusCounts = Project::whereBetween('created_at', [$start, $end])
        ->selectRaw('status, COUNT(*) as count')
        ->groupBy('status')
        ->pluck('count', 'status');

    $byStatus = [];
    foreach (['planning', 'active', 'on_hold', 'completed', 'cancelled'] as $s) {
        $byStatus[$s] = (int) ($statusCounts[$s] ?? 0);
    }

    // 2. Filtered Priority Counts
    $priorityCounts = Project::whereBetween('created_at', [$start, $end])
        ->selectRaw('priority, COUNT(*) as count')
        ->whereNotNull('priority')
        ->groupBy('priority')
        ->pluck('count', 'priority');

    $total          = array_sum($byStatus);
    $completed      = $byStatus['completed'];
    $completionRate = $total > 0 ? ($completed / $total) * 100 : 0;

    // 3. Overdue Projects (Usually you want to see ALL currently overdue, 
    // but if you want it filtered by period, add the whereBetween)
    $overdueCount = Project::whereNotNull('target_end_date')
        ->where('target_end_date', '<', now())
        ->whereNotIn('status', ['completed', 'cancelled'])
        ->whereBetween('created_at', [$start, $end]) // Filtered
        ->count();

    $unassigned = Project::whereNull('owner_admin_id')
        ->whereBetween('created_at', [$start, $end]) // Filtered
        ->count();

    $overdueMilestones = ProjectMilestone::whereNotNull('due_date')
        ->where('due_date', '<', now())
        ->whereNotIn('status', ['completed', 'approved'])
        ->whereBetween('created_at', [$start, $end]) // Filtered
        ->count();

    // 4. Trend Logic (Keep as is - 12 months is standard for trends)
    $months = collect();
    for ($i = 11; $i >= 0; $i--) {
        $months->push(now()->subMonths($i)->format('Y-m'));
    }
    $rawCounts = Project::selectRaw("DATE_FORMAT(created_at,'%Y-%m') as month, COUNT(*) as count")
        ->where('created_at', '>=', now()->subMonths(11)->startOfMonth())
        ->groupBy('month')
        ->pluck('count', 'month');

    $createdPerMonth = $months->map(fn ($m) => [
        'month' => $m,
        'label' => Carbon::createFromFormat('Y-m', $m)->format('M y'),
        'value' => (int) ($rawCounts[$m] ?? 0),
    ])->values();

    return response()->json([
        'total'              => $total,
        'planning'           => $byStatus['planning'],
        'active'             => $byStatus['active'],
        'on_hold'            => $byStatus['on_hold'],
        'completed'          => $byStatus['completed'],
        'cancelled'          => $byStatus['cancelled'],
        'overdue'            => $overdueCount,
        'unassigned'         => $unassigned,
        'overdue_milestones' => $overdueMilestones,
        'completion_rate'    => round($completionRate, 2),
        'by_priority'        => [
            'urgent' => (int) ($priorityCounts['urgent'] ?? 0),
            'high'   => (int) ($priorityCounts['high']   ?? 0),
            'medium' => (int) ($priorityCounts['medium'] ?? 0),
            'low'    => (int) ($priorityCounts['low']    ?? 0),
        ],
        'created_per_month'  => $createdPerMonth,
    ]);
}

    // ──────────────────────────────────────────────────────────────────────────
    // GET /admin/reports/customers
    // ──────────────────────────────────────────────────────────────────────────

    public function customers(Request $request): JsonResponse
    {
        [$start, $end] = $this->periodDates($request);

        $total    = Customer::count();
        $avgLTV   = $total > 0 ? Customer::avg('total_spent') : 0;

        $newCustomers = Customer::whereBetween('created_at', [$start, $end])->count();

        // Top customers by spend
        // ✅ top_by_spend — derived from paid orders in period, not lifetime columns
        $topBySpend = DB::table('orders')
            ->join('customers', 'customers.id', '=', 'orders.customer_id')
            ->select(
                'customers.id',
                'customers.first_name',
                'customers.last_name',
                'customers.email',
                'customers.company_name',
                'customers.customer_type',
                'customers.tier',
                DB::raw('SUM(orders.total_kes) as period_spent'),
                DB::raw('COUNT(orders.id) as period_orders'),
                DB::raw('MAX(orders.created_at) as last_order_at')
            )
            ->where('orders.payment_status', 'paid')
            ->whereBetween('orders.created_at', [$start, $end])   // ← was missing
            ->whereNotNull('orders.customer_id')
            ->groupBy(
                'customers.id', 'customers.first_name', 'customers.last_name',
                'customers.email', 'customers.company_name',
                'customers.customer_type', 'customers.tier'
            )
            ->orderByDesc('period_spent')
            ->limit(10)
            ->get()
            ->map(fn ($c, $i) => [
                'rank'         => $i + 1,
                'id'           => $c->id,
                'name'         => trim("{$c->first_name} {$c->last_name}") ?: ($c->company_name ?? '—'),
                'email'        => $c->email,
                'type'         => $c->customer_type,
                'tier'         => $c->tier,
                'total_spent'  => round((float) $c->period_spent, 2),
                'total_orders' => (int) $c->period_orders,
                'last_order'   => $c->last_order_at
                    ? Carbon::parse($c->last_order_at)->toDateString()
                    : null,
            ])
            ->values();

        // ✅ top_by_orders — same approach, ordered by order count in period
        $topByOrders = DB::table('orders')
            ->join('customers', 'customers.id', '=', 'orders.customer_id')
            ->select(
                'customers.id',
                'customers.first_name',
                'customers.last_name',
                'customers.email',
                'customers.company_name',
                'customers.customer_type',
                'customers.tier',
                DB::raw('COUNT(orders.id) as period_orders'),
                DB::raw('SUM(orders.total_kes) as period_spent')
            )
            ->where('orders.payment_status', 'paid')
            ->whereBetween('orders.created_at', [$start, $end])   // ← was missing
            ->whereNotNull('orders.customer_id')
            ->groupBy(
                'customers.id', 'customers.first_name', 'customers.last_name',
                'customers.email', 'customers.company_name',
                'customers.customer_type', 'customers.tier'
            )
            ->orderByDesc('period_orders')
            ->limit(10)
            ->get()
            ->map(fn ($c, $i) => [
                'rank'         => $i + 1,
                'id'           => $c->id,
                'name'         => trim("{$c->first_name} {$c->last_name}") ?: ($c->company_name ?? '—'),
                'email'        => $c->email,
                'type'         => $c->customer_type,
                'tier'         => $c->tier,
                'total_orders' => (int) $c->period_orders,
                'total_spent'  => round((float) $c->period_spent, 2),
            ])
            ->values();

        // ── customers() — login hour fix only ────────────────────────────────────────
        $loginHours = DB::table('customers')
            ->join('users', 'users.id', '=', 'customers.user_id')
            ->selectRaw('HOUR(users.last_login_at) as hour, COUNT(*) as count')
            ->whereNotNull('users.last_login_at')
            ->groupBy('hour')
            ->orderBy('hour')
            ->pluck('count', 'hour');

        $loginHourDist = collect(range(0, 23))->map(fn($h) => [
            'hour' => $h,
            'label' => sprintf('%02d:00', $h),
            'count' => (int) ($loginHours[$h] ?? 0),
        ])->values();

        // Monthly new customers trend
        $months = collect();
        for ($i = 11; $i >= 0; $i--) {
            $months->push(now()->subMonths($i)->format('Y-m'));
        }
        $rawCounts = Customer::selectRaw("DATE_FORMAT(created_at,'%Y-%m') as month, COUNT(*) as count")
            ->where('created_at', '>=', now()->subMonths(11)->startOfMonth())
            ->groupBy('month')
            ->pluck('count', 'month');

        $trend = $months->map(fn ($m) => [
            'month' => $m,
            'label' => Carbon::createFromFormat('Y-m', $m)->format('M y'),
            'value' => (int) ($rawCounts[$m] ?? 0),
        ])->values();

        return response()->json([
            'total_customers'    => $total,
            'active_customers'   => Customer::where('status', 'active')->count(),
            'vip_customers'      => Customer::whereIn('tier', ['gold', 'platinum', 'diamond'])->count(),
            'with_credit'        => Customer::where('has_credit_account', true)->count(),
            'new_customers'      => $newCustomers,
            'avg_lifetime_value' => round((float) $avgLTV, 2),
            'by_tier'            => [
                'bronze'   => Customer::where('tier', 'bronze')->count(),
                'silver'   => Customer::where('tier', 'silver')->count(),
                'gold'     => Customer::where('tier', 'gold')->count(),
                'platinum' => Customer::where('tier', 'platinum')->count(),
            ],
            'by_type'            => [
                'individual' => Customer::where('customer_type', 'individual')->count(),
                'business'   => Customer::where('customer_type', 'business')->count(),
                'wholesale'  => Customer::where('customer_type', 'wholesale')->count(),
                'contractor' => Customer::where('customer_type', 'contractor')->count(),
            ],
            'top_by_spend'       => $topBySpend,
            'top_by_orders'      => $topByOrders,
            'login_hour_dist'    => $loginHourDist,
            'trend'              => $trend,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET /admin/reports/system
    // ──────────────────────────────────────────────────────────────────────────

    public function system(Request $request): JsonResponse
    {
        [$start, $end] = $this->periodDates($request);

        $tiers = CustomerTier::query()
            ->orderBy('sort_order')
            ->get()
            ->map(fn ($tier) => [
                'id'                        => $tier->id,
                'slug'                      => $tier->slug,
                'name'                      => $tier->name,
                'description'               => $tier->description,
                'color'                     => $tier->color,
                'discount_percentage'       => (float) $tier->discount_percentage,
                'free_shipping_threshold'   => (float) $tier->free_shipping_threshold,
                'loyalty_points_multiplier' => (float) $tier->loyalty_points_multiplier,
                'priority_support'          => (bool) $tier->priority_support,
                'min_orders'                => (int) $tier->min_orders,
                'min_spent'                 => (float) $tier->min_spent,
                'sort_order'                => (int) $tier->sort_order,
                'is_active'                 => (bool) $tier->is_active,
                'customers_count'           => (int) $tier->customers()->count(),
            ])
            ->values();

        $types = CustomerTypeDiscount::query()
            ->orderBy('sort_order')
            ->get()
            ->map(fn ($type) => [
                'id'                  => $type->id,
                'slug'                => $type->slug,
                'name'                => $type->name,
                'description'         => $type->description,
                'discount_percentage'  => (float) $type->discount_percentage,
                'sort_order'          => (int) $type->sort_order,
                'is_active'           => (bool) $type->is_active,
                'customers_count'     => (int) $type->customers()->count(),
            ])
            ->values();

        $shippingOptions = ShippingOption::query()
            ->orderBy('sort_order')
            ->get()
            ->map(fn ($option) => [
                'id'           => $option->id,
                'slug'         => $option->slug,
                'name'         => $option->name,
                'description'  => $option->description,
                'icon'         => $option->icon,
                'cost'         => (float) $option->cost,
                'free_above'   => (float) $option->free_above,
                'sort_order'   => (int) $option->sort_order,
                'is_active'    => (bool) $option->is_active,
            ])
            ->values();

        $customerBreakdown = Customer::selectRaw('tier, COUNT(*) as count')
            ->whereNotNull('tier')
            ->groupBy('tier')
            ->pluck('count', 'tier');

        $typeBreakdown = Customer::selectRaw('customer_type, COUNT(*) as count')
            ->whereNotNull('customer_type')
            ->groupBy('customer_type')
            ->pluck('count', 'customer_type');

        $ledgerSummary = LoyaltyPointTransaction::selectRaw(
            'COUNT(*) as total_transactions,
             SUM(CASE WHEN points > 0 THEN points ELSE 0 END) as points_earned,
             SUM(CASE WHEN points < 0 THEN ABS(points) ELSE 0 END) as points_redeemed,
             SUM(CASE WHEN type = "redemption" THEN 1 ELSE 0 END) as redemption_count,
             SUM(CASE WHEN type = "expiry" THEN 1 ELSE 0 END) as expiry_count,
             SUM(CASE WHEN type = "admin_grant" THEN 1 ELSE 0 END) as admin_grants,
             SUM(CASE WHEN type = "admin_deduct" THEN 1 ELSE 0 END) as admin_deductions,
             SUM(CASE WHEN expired_at IS NULL AND points > 0 THEN points ELSE 0 END) as active_points'
        )->first();

        $periodLedger = LoyaltyPointTransaction::whereBetween('created_at', [$start, $end]);
        $recentRedemptions = (clone $periodLedger)
            ->where('type', 'redemption')
            ->count();

        $duePoints = LoyaltyPointTransaction::due()->count();

        return response()->json([
            'tiers'              => $tiers,
            'types'              => $types,
            'shipping_options'   => $shippingOptions,
            'customer_breakdown' => [
                'tiers' => $customerBreakdown,
                'types' => $typeBreakdown,
            ],
            'ledger' => [
                'total_transactions'  => (int)   ($ledgerSummary->total_transactions ?? 0),
                'points_earned'       => (int)   ($ledgerSummary->points_earned      ?? 0),
                'points_redeemed'     => (int)   ($ledgerSummary->points_redeemed    ?? 0),
                'redemption_count'    => (int)   ($ledgerSummary->redemption_count   ?? 0),
                'expiry_count'        => (int)   ($ledgerSummary->expiry_count       ?? 0),
                'admin_grants'        => (int)   ($ledgerSummary->admin_grants       ?? 0),
                'admin_deductions'    => (int)   ($ledgerSummary->admin_deductions   ?? 0),
                'active_points'       => (int)   ($ledgerSummary->active_points      ?? 0),
                'recent_redemptions'  => (int)   $recentRedemptions,
                'due_points'          => (int)   $duePoints,
            ],
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET /admin/reports/extras
    // ──────────────────────────────────────────────────────────────────────────

    public function extras(Request $request): JsonResponse
    {
        [$start, $end] = $this->periodDates($request);

        // ── Hampers ──────────────────────────────────────────────────────────
        // HamperOrder is the transaction record — it has its own total, hamper_id, status, etc.
        $hamperOrders = HamperOrder::whereBetween('created_at', [$start, $end])->get();

        $periodRevenue = $hamperOrders->sum(fn ($ho) => (float) ($ho->total ?? 0));

        $topHampers = $hamperOrders
            ->groupBy('hamper_id')
            ->map(function ($group) {
                $first = $group->first();
                $hamper = Hamper::find($first->hamper_id);
                return [
                    'id'      => $first->hamper_id,
                    'name'    => $hamper?->name ?? ($first->hamper_snapshot['name'] ?? 'Unknown'),
                    'count'   => $group->count(),
                    'revenue' => round($group->sum(fn ($ho) => (float) ($ho->total ?? 0)), 2),
                ];
            })
            ->sortByDesc('revenue')
            ->take(5)
            ->values();

        // ── Bookings ─────────────────────────────────────────────────────────
        $bookings = Booking::whereBetween('created_at', [$start, $end])->get();

        $statusDist = $bookings
            ->groupBy('status')
            ->map(fn ($g) => $g->count())
            ->toArray();

        // Service revenue comes from paid orders that contain service-type items
        $serviceRevenue = Order::where('payment_status', 'paid')
            ->whereBetween('paid_at', [$start, $end])
            ->whereHas('items', fn ($q) => $q->whereIn('item_type', ['service', 'custom_service']))
            ->withSum('items as items_sum_refund_amount', 'refund_amount')
            ->get(['id', 'total_kes', 'total', 'currency'])
            ->sum(fn ($o) => $this->orderNetKes($o));

        return response()->json([
            'hampers' => [
                'period_orders'  => $hamperOrders->count(),
                'period_revenue' => round($periodRevenue, 2),
                'top_hampers'    => $topHampers,
            ],
            'bookings' => [
                'period_placed'   => $bookings->count(),
                'service_revenue' => round((float) $serviceRevenue, 2),
                'status_dist'     => $statusDist,
            ],
        ]);
    }
}
