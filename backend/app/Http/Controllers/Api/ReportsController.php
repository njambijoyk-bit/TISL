<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Customer;
use App\Models\Currency;
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
use App\Models\Ticket;
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
        $total    = (float) ($order->total ?? 0);
        $refunded = (float) ($order->items_sum_refund_amount ?? 0);
        $net      = max(0, $total - $refunded);
        $ccy      = $order->currency ?? 'KES';

        if ($ccy === 'KES') return $net;

        $totalKes = (float) ($order->total_kes ?? 0);
        if ($totalKes > 0 && $total > 0) {
            return $totalKes * ($net / $total);
        }

        $rate = (float) ($order->exchange_rate_to_kes ?? 0);
        return $rate > 0 ? ($net * $rate) : 0;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET /admin/reports/revenue
    // ──────────────────────────────────────────────────────────────────────────

    public function revenue(Request $request): JsonResponse
    {
        [$start, $end] = $this->periodDates($request);

        $allPaid = Order::with('items')->where('payment_status', 'paid')->get();
        $totalRevenueKes = $allPaid->sum(fn ($o) => $this->orderNetKes($o));

        $periodPaid = Order::with('items')
            ->where('payment_status', 'paid')
            ->whereBetween('paid_at', [$start, $end])
            ->get();

        $periodRevenueKes = $periodPaid->sum(fn ($o) => $this->orderNetKes($o));

        $paidCount = $allPaid->count();
        $avgKes    = $paidCount > 0 ? $totalRevenueKes / $paidCount : 0;

        $unpaidKes = Order::with('items')
            ->where('payment_status', '!=', 'paid')
            ->get()
            ->sum(fn ($o) => $this->orderNetKes($o));

        $byCurrency = Order::selectRaw('currency, COUNT(*) as order_count, SUM(total) as total_native, SUM(total_kes) as total_kes')
            ->where('payment_status', 'paid')
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
            'avg_order_value_kes' => round($avgKes, 2),
            'paid_orders'         => $paidCount,
            'unpaid_kes'          => round($unpaidKes, 2),
            'by_currency'         => $byCurrency,
            'trend'               => $trend,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET /admin/reports/orders
    // ──────────────────────────────────────────────────────────────────────────

    public function orders(Request $request): JsonResponse
    {
        [$start, $end] = $this->periodDates($request);

        $allOrders    = Order::with('items')->get();
        $periodOrders = Order::whereBetween('created_at', [$start, $end])->get();

        $todayOrders     = $allOrders->filter(fn ($o) => $o->created_at?->isToday());
        $todayRevenueKes = $todayOrders->where('payment_status', 'paid')
            ->sum(fn ($o) => $this->orderNetKes($o));

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
            'total_orders'          => Order::count(),
            'period_orders'         => $periodOrders->count(),
            'pending'               => Order::where('status', 'pending')->count(),
            'confirmed'             => Order::where('status', 'confirmed')->count(),
            'processing'            => Order::where('status', 'processing')->count(),
            'shipped'               => Order::where('status', 'shipped')->count(),
            'delivered'             => Order::where('status', 'delivered')->count(),
            'cancelled'             => Order::where('status', 'cancelled')->count(),
            'today'                 => $todayOrders->count(),
            'today_revenue'         => round($todayRevenueKes, 2),
            'average_order_value'   => round(Order::avg('total_kes') ?? 0, 2),
            'orders_with_backorder' => Order::whereHas('items', fn ($q) => $q->where('backorder_quantity', '>', 0))->count(),
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
        $activeProducts = Product::where('status', 'active')->count();
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
        $activeBrands   = Brand::active()->count();
        $featuredBrands = Brand::featured()->count();

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
        $activeServices   = Service::where('status', 'active')->count();
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

        $total      = Ticket::count();
        $open       = Ticket::where('status', 'open')->count();
        $inProgress = Ticket::where('status', 'in_progress')->count();
        $resolved   = Ticket::where('status', 'resolved')->count();
        $closed     = Ticket::where('status', 'closed')->count();
        $onHold     = Ticket::where('status', 'on_hold')->count();
        $unassigned = Ticket::whereNull('assigned_to')->count();

        // Period tickets
        $periodTotal    = Ticket::whereBetween('created_at', [$start, $end])->count();
        $periodResolved = Ticket::whereBetween('created_at', [$start, $end])->where('status', 'resolved')->count();

        // Average first response time (hours)
        $avgFirstResponseHours = 0;
        $responded = Ticket::whereNotNull('first_responded_at')->get(['created_at', 'first_responded_at']);
        if ($responded->isNotEmpty()) {
            $total_hrs = $responded->sum(fn ($t) => $t->created_at->diffInMinutes($t->first_responded_at));
            $avgFirstResponseHours = round($total_hrs / $responded->count() / 60, 1);
        }

        // Average resolution time (hours)
        $avgResolutionHours = 0;
        $resolvedTickets = Ticket::whereNotNull('resolved_at')->get(['created_at', 'resolved_at']);
        if ($resolvedTickets->isNotEmpty()) {
            $total_hrs = $resolvedTickets->sum(fn ($t) => $t->created_at->diffInMinutes($t->resolved_at));
            $avgResolutionHours = round($total_hrs / $resolvedTickets->count() / 60, 1);
        }

        // By priority
        $priorityCounts = Ticket::selectRaw('priority, COUNT(*) as count')
            ->whereNotNull('priority')
            ->groupBy('priority')
            ->pluck('count', 'priority');

        // By category
        $byCategory = Ticket::selectRaw('category, COUNT(*) as count')
            ->whereNotNull('category')
            ->groupBy('category')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($r) => [
                'category' => $r->category,
                'count'    => (int) $r->count,
            ])
            ->values();

        // Monthly trend
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

        // Resolution rate
        $resolutionRate = $total > 0 ? round((($resolved + $closed) / $total) * 100, 1) : 0;

        return response()->json([
            'total'                     => $total,
            'open'                      => $open,
            'in_progress'               => $inProgress,
            'resolved'                  => $resolved,
            'closed'                    => $closed,
            'on_hold'                   => $onHold,
            'unassigned'                => $unassigned,
            'period_total'              => $periodTotal,
            'period_resolved'           => $periodResolved,
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

        $totalCodes   = ReferralCode::count();
        $activeCodes  = ReferralCode::where('status', 'active')->count();
        $expiredCodes = ReferralCode::where('status', 'expired')
            ->orWhere(fn ($q) => $q->whereNotNull('valid_until')->where('valid_until', '<', now()))
            ->count();
        $depletedCodes = ReferralCode::where('status', 'depleted')->count();
        $pausedCodes   = ReferralCode::where('status', 'paused')->count();
        $expiringSoon  = ReferralCode::expiringSoon(7)->count();

        // Totals
        $totalDiscountGiven     = ReferralCode::sum('total_discount_given');
        $totalRevenueFromPromos = ReferralCode::sum('total_revenue');
        $totalUses              = ReferralCode::sum('times_used');
        $totalReferrerRewards   = ReferralCode::sum('total_referrer_rewards');

        // Top performing codes by revenue
        $topByRevenue = ReferralCode::select('id', 'code', 'name', 'type', 'reward_type', 'reward_value',
                'times_used', 'successful_uses', 'total_revenue', 'total_discount_given',
                'average_order_value', 'conversion_rate', 'status')
            ->orderByDesc('total_revenue')
            ->limit(10)
            ->get()
            ->map(fn ($r, $i) => [
                'rank'              => $i + 1,
                'code'              => $r->code,
                'name'              => $r->name,
                'type'              => $r->type,
                'reward_type'       => $r->reward_type,
                'reward_value'      => (float) $r->reward_value,
                'uses'              => (int) $r->times_used,
                'successful_uses'   => (int) $r->successful_uses,
                'revenue'           => round((float) $r->total_revenue, 2),
                'discount_given'    => round((float) $r->total_discount_given, 2),
                'avg_order_value'   => round((float) $r->average_order_value, 2),
                'conversion_rate'   => round((float) $r->conversion_rate, 1),
                'status'            => $r->status,
            ])
            ->values();

        // Top codes by usage count
        $topByUsage = ReferralCode::select('id', 'code', 'name', 'type', 'times_used', 'total_revenue', 'status')
            ->orderByDesc('times_used')
            ->limit(10)
            ->get()
            ->map(fn ($r, $i) => [
                'rank'    => $i + 1,
                'code'    => $r->code,
                'name'    => $r->name,
                'type'    => $r->type,
                'uses'    => (int) $r->times_used,
                'revenue' => round((float) $r->total_revenue, 2),
                'status'  => $r->status,
            ])
            ->values();

        // By type breakdown
        $byType = ReferralCode::selectRaw('type, COUNT(*) as count, SUM(total_revenue) as revenue, SUM(times_used) as uses')
            ->groupBy('type')
            ->get()
            ->map(fn ($r) => [
                'type'    => $r->type,
                'count'   => (int) $r->count,
                'revenue' => round((float) $r->revenue, 2),
                'uses'    => (int) $r->uses,
            ])
            ->values();

        // ── Referral-specific stats — sourced directly from referral_code_usage table ──
        $totalReferralCodes  = ReferralCode::where('type', 'customer_referral')->count();
        $totalReferrals      = ReferralCodeUsage::count();
        $completedReferrals  = ReferralCodeUsage::where('status', 'completed')->count();
        $pendingReferrals    = ReferralCodeUsage::where('status', 'pending')->count();
        $periodReferrals     = ReferralCodeUsage::whereBetween('created_at', [$start, $end])->count();
        $periodCompleted     = ReferralCodeUsage::where('status', 'completed')
                                ->whereBetween('completed_at', [$start, $end])->count();
        $totalRewardsPaid    = ReferralCodeUsage::where('referrer_reward_paid', true)
                                ->sum('referrer_reward_amount');
        $conversionRate      = $totalReferrals > 0
                                ? round(($completedReferrals / $totalReferrals) * 100, 1)
                                : 0;

        $referralStats = [
            'total_referral_codes'   => $totalReferralCodes,
            'total_referrals'        => $totalReferrals,
            'completed_referrals'    => $completedReferrals,
            'pending_referrals'      => $pendingReferrals,
            'period_referrals'       => $periodReferrals,
            'period_completed'       => $periodCompleted,
            'conversion_rate'        => $conversionRate,
            'total_referrer_rewards' => round((float) ($totalReferrerRewards + $totalRewardsPaid), 2),
        ];

        // Period usage trend
        $months = collect();
        for ($i = 11; $i >= 0; $i--) {
            $months->push(now()->subMonths($i)->format('Y-m'));
        }
        $trendRaw = Order::selectRaw("DATE_FORMAT(orders.created_at,'%Y-%m') as month, COUNT(*) as count, SUM(orders.discount_amount) as discount")
            ->whereNotNull('referral_code_id')
            ->where('created_at', '>=', now()->subMonths(11)->startOfMonth())
            ->groupBy('month')
            ->get()
            ->keyBy('month');

        $trend = $months->map(fn ($m) => [
            'month'    => $m,
            'label'    => Carbon::createFromFormat('Y-m', $m)->format('M y'),
            'value'    => (int) ($trendRaw[$m]?->count ?? 0),
            'discount' => round((float) ($trendRaw[$m]?->discount ?? 0), 2),
        ])->values();

        return response()->json([
            'total_codes'              => $totalCodes,
            'active_codes'             => $activeCodes,
            'expired_codes'            => $expiredCodes,
            'depleted_codes'           => $depletedCodes,
            'paused_codes'             => $pausedCodes,
            'expiring_soon'            => $expiringSoon,
            'total_discount_given'     => round((float) $totalDiscountGiven, 2),
            'total_revenue_from_promos'=> round((float) $totalRevenueFromPromos, 2),
            'total_uses'               => (int) $totalUses,
            'top_by_revenue'           => $topByRevenue,
            'top_by_usage'             => $topByUsage,
            'by_type'                  => $byType,
            'referrals'                => $referralStats,
            'trend'                    => $trend,
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

        $statusCounts = Project::selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        $byStatus = [];
        foreach (['planning', 'active', 'on_hold', 'completed', 'cancelled'] as $s) {
            $byStatus[$s] = (int) ($statusCounts[$s] ?? 0);
        }

        $priorityCounts = Project::selectRaw('priority, COUNT(*) as count')
            ->whereNotNull('priority')
            ->groupBy('priority')
            ->pluck('count', 'priority');

        $total          = array_sum($byStatus);
        $completed      = $byStatus['completed'];
        $completionRate = $total > 0 ? ($completed / $total) * 100 : 0;

        $overdueCount = Project::whereNotNull('target_end_date')
            ->where('target_end_date', '<', now())
            ->whereNotIn('status', ['completed', 'cancelled'])
            ->count();

        $unassigned = Project::whereNull('owner_admin_id')->count();

        $overdueMilestones = ProjectMilestone::whereNotNull('due_date')
            ->where('due_date', '<', now())
            ->whereNotIn('status', ['completed', 'approved'])
            ->count();

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
        $topBySpend = Customer::select('id', 'first_name', 'last_name', 'email', 'company_name',
                'customer_type', 'tier', 'total_spent', 'total_orders', 'last_order_date')
            ->orderByDesc('total_spent')
            ->limit(10)
            ->get()
            ->map(fn ($c, $i) => [
                'rank'         => $i + 1,
                'id'           => $c->id,
                'name'         => trim("{$c->first_name} {$c->last_name}") ?: ($c->company_name ?? '—'),
                'email'        => $c->email,
                'type'         => $c->customer_type,
                'tier'         => $c->tier,
                'total_spent'  => round((float) $c->total_spent, 2),
                'total_orders' => (int) $c->total_orders,
                'last_order'   => $c->last_order_date?->toDateString(),
            ])
            ->values();

        // Top customers by order count
        $topByOrders = Customer::select('id', 'first_name', 'last_name', 'email', 'company_name',
                'customer_type', 'tier', 'total_orders', 'total_spent')
            ->orderByDesc('total_orders')
            ->limit(10)
            ->get()
            ->map(fn ($c, $i) => [
                'rank'         => $i + 1,
                'id'           => $c->id,
                'name'         => trim("{$c->first_name} {$c->last_name}") ?: ($c->company_name ?? '—'),
                'email'        => $c->email,
                'type'         => $c->customer_type,
                'tier'         => $c->tier,
                'total_orders' => (int) $c->total_orders,
                'total_spent'  => round((float) $c->total_spent, 2),
            ])
            ->values();

        // Login hour distribution (0-23)
        $loginHours = Customer::selectRaw('HOUR(last_login_at) as hour, COUNT(*) as count')
            ->whereNotNull('last_login_at')
            ->groupBy('hour')
            ->orderBy('hour')
            ->pluck('count', 'hour');

        $loginHourDist = collect(range(0, 23))->map(fn ($h) => [
            'hour'  => $h,
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
            'active_customers'   => Customer::active()->count(),
            'vip_customers'      => Customer::vip()->count(),
            'with_credit'        => Customer::withCredit()->count(),
            'new_customers'      => $newCustomers,
            'avg_lifetime_value' => round((float) $avgLTV, 2),
            'by_tier'            => [
                'bronze'   => Customer::byTier('bronze')->count(),
                'silver'   => Customer::byTier('silver')->count(),
                'gold'     => Customer::byTier('gold')->count(),
                'platinum' => Customer::byTier('platinum')->count(),
            ],
            'by_type'            => [
                'individual' => Customer::byType('individual')->count(),
                'business'   => Customer::byType('business')->count(),
                'wholesale'  => Customer::byType('wholesale')->count(),
                'contractor' => Customer::byType('contractor')->count(),
            ],
            'top_by_spend'       => $topBySpend,
            'top_by_orders'      => $topByOrders,
            'login_hour_dist'    => $loginHourDist,
            'trend'              => $trend,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET /admin/reports/summary
    // ──────────────────────────────────────────────────────────────────────────

    public function summary(Request $request): JsonResponse
    {
        [$start, $end] = $this->periodDates($request);

        $allPaid         = Order::with('items')->where('payment_status', 'paid')->get();
        $totalRevenueKes = $allPaid->sum(fn ($o) => $this->orderNetKes($o));

        return response()->json([
            'total_revenue_kes'   => round($totalRevenueKes, 2),
            'total_orders'        => Order::count(),
            'total_quote_requests'=> QuoteRequest::count(),
            'total_projects'      => Project::count(),
            'total_customers'     => Customer::count(),
            'total_products'      => Product::count(),
            'total_tickets'       => Ticket::count(),
            'open_tickets'        => Ticket::where('status', 'open')->count(),
            'active_promo_codes'  => ReferralCode::where('status', 'active')->count(),
            'pending_orders'      => Order::where('status', 'pending')->count(),
            'pending_requests'    => QuoteRequest::pending()->count(),
            'active_projects'     => Project::where('status', 'active')->count(),
            'overdue_projects'    => Project::whereNotNull('target_end_date')
                                        ->where('target_end_date', '<', now())
                                        ->whereNotIn('status', ['completed', 'cancelled'])
                                        ->count(),
        ]);
    }
}