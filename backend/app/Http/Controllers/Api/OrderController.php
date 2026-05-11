<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Customer;
use App\Models\Quote;
use App\Models\Currency;
use Illuminate\Http\Request;
use App\Mail\OrderConfirmation;
use App\Mail\OrderShipped;
use App\Services\Mail\OrderMailService;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use App\Services\PromoCodeService;

class OrderController extends Controller
{
    public function __construct(private OrderMailService $mailer) {}
    // ========================================
    // SHARED PRICING HELPER
    // ========================================

    /**
    * Shared pricing calculation for ALL item types across all order methods.
    *
    * Frontend / DB convention:
    *   line_total                = qty × original_price              (gross / before discount)
    *   line_total_after_discount = qty × unit_price                  (net / final payable)
    *   discount_amount           = line_total - line_total_after_discount
    *                             = positive for discount
    *                             = negative for markup
    *
    * Therefore:
    *   line_total = line_total_after_discount + discount_amount
    *
    * @param  float $qty
    * @param  float $unitPrice   Effective / final sell price per unit
    * @param  float $discAmount  Signed discount amount for the whole line
    * @return array{lineTotal: float, lineAfter: float, origPrice: float}
    */
    private function calcPricing(float $qty, float $unitPrice, float $discAmount): array
    {
        $lineAfter = round($qty * $unitPrice, 2);
        $lineTotal = round($lineAfter + $discAmount, 2);

        return [
            'lineTotal' => $lineTotal,
            'lineAfter' => $lineAfter,
        ];
    }

    private function recalcCustomerStats(int $customerId): void
    {
        $customer = \App\Models\Customer::find($customerId);
        if (!$customer) return;

        $realTotal = \App\Models\Order::where('customer_id', $customerId)
            ->whereNotIn('status', ['cancelled', 'failed'])
            ->sum('total_kes');

        $realCount = \App\Models\Order::where('customer_id', $customerId)
            ->whereNotIn('status', ['cancelled', 'failed'])
            ->count();

        $customer->update([
            'total_orders'        => $realCount,
            'total_spent'         => $realTotal,
            'average_order_value' => $realCount > 0
                ? round($realTotal / $realCount, 2)
                : 0,
            'last_order_date'     => \App\Models\Order::where('customer_id', $customerId)
                ->whereNotIn('status', ['cancelled', 'failed'])
                ->latest('created_at')
                ->value('created_at'),
        ]);
    }

    // ========================================
    // CUSTOMER ROUTES
    // ========================================

    /**
     * Get customer's orders (CUSTOMER)
     */
    public function myOrders(Request $request)
    {
        $query = Order::with(['items.product'])
            ->where('customer_id', $request->user()->customer->id);

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        $sortBy    = $request->get('sort_by', 'created_at');
        $sortOrder = $request->get('sort_order', 'desc');
        $query->orderBy($sortBy, $sortOrder);

        $orders = $query->paginate($request->get('per_page', 20));

        return response()->json($orders, 200);
    }

    /**
     * Create new order / Checkout (CUSTOMER or GUEST)
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'customer_email'         => 'required|email',
            'customer_phone'         => 'required|string',
            'shipping_address'       => 'required|string',
            'delivery_method'        => 'required|in:pickup,standard_delivery,express_delivery,courier',
            'payment_method'         => 'required|in:request_invoice,pay_on_delivery,mpesa,bank_transfer,credit_card,credit',
            'customer_notes'         => 'nullable|string',
            'items'                  => 'required|array|min:1',
            'items.*.product_id'     => 'nullable|exists:products,id',
            'items.*.service_id'     => 'nullable|exists:services,id',
            'items.*.item_type'      => 'required|in:product,service,fee,custom_product,custom_service',
            'items.*.is_custom_item' => 'nullable|boolean',
            'items.*.quantity'       => 'required|numeric|min:0.01',
            'apply_store_credit'     => 'nullable|boolean',      
            'store_credit_amount'    => 'nullable|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            // ✅ STEP 1: VALIDATE STOCK WITH BUFFER (200 units)
            foreach ($request->items as $item) {
                if (empty($item['product_id'])) continue;

                $product      = Product::findOrFail($item['product_id']);
                $requestedQty = floatval($item['quantity']);
                $currentStock = floatval($product->stock_quantity);
                $maxAllowed   = $currentStock + 200;

                if ($requestedQty > $maxAllowed) {
                    DB::rollBack();
                    return response()->json([
                        'message'       => "Order quantity exceeds maximum allowed for {$product->name}",
                        'product'       => $product->name,
                        'current_stock' => $currentStock,
                        'max_allowed'   => $maxAllowed,
                        'requested'     => $requestedQty,
                    ], 400);
                }
            }

            // ✅ STEP 2: Get or create customer
            $customer = null;
            if (Auth::check()) {
                $customer = $request->user()->customer;
            } else {
                $customer = Customer::where('email', $request->customer_email)->first();
                if (!$customer) {
                    $customer = Customer::create([
                        'email'    => $request->customer_email,
                        'phone'    => $request->customer_phone,
                        'is_guest' => true,
                    ]);
                }
            }

            // ✅ STEP 3: Build items data
            $subtotal  = 0;
            $itemsData = [];

            foreach ($request->items as $item) {

                // ── Custom item (no product_id, no service_id) ──────────
                if (empty($item['product_id']) && empty($item['service_id'])) {
                    $qty        = floatval($item['quantity']        ?? 1);
                    $unitPrice  = floatval($item['unit_price']      ?? 0);
                    $discAmount = floatval($item['discount_amount'] ?? 0);
                    $p          = $this->calcPricing($qty, $unitPrice, $discAmount);

                    $itemsData[] = [
                        'product'                   => null,
                        'is_custom_item'            => true,
                        'item_type'                 => $item['item_type'],
                        'quantity'                  => $qty,
                        'backorder_quantity'        => 0,
                        'in_stock_quantity'         => 0,
                        'fulfillment_status'        => 'in_stock',
                        'unit_price'                => $unitPrice,
                        'line_total'                => $p['lineTotal'],
                        'line_total_after_discount' => $p['lineAfter'],
                        'discount_amount'           => $discAmount,
                        'is_bulk_pricing'           => false,
                        'description'               => $item['product_name'] ?? $item['description'] ?? '',
                        'service_id'                => null,
                        'service_name'              => null,
                        'service_description'       => null,
                        'service_category'          => null,
                        'unit_of_measure'           => $item['unit_of_measure']     ?? 'each',
                        'pricing_notes'             => $item['pricing_notes']       ?? null,
                        'notes'                     => $item['notes']               ?? null,
                        'is_taxable'                => $item['is_taxable']          ?? true,
                        'is_negotiated_price'       => $item['is_negotiated_price'] ?? false,
                        'requires_site_visit'       => $item['requires_site_visit'] ?? false,
                        'estimated_hours'           => $item['estimated_hours']     ?? null,
                        'hourly_rate'               => $item['hourly_rate']         ?? null,
                        'labor_cost'                => $item['labor_cost']          ?? null,
                        'material_cost'             => $item['material_cost']       ?? null,
                        'display_order'             => $item['display_order']       ?? 0,
                        'variant_details'           => $item['variant_details']     ?? null,
                        'custom_item_details'       => [
                            'name'          => $item['product_name'] ?? $item['description'] ?? null,
                            'unit_price'    => $unitPrice,
                            'item_type'     => $item['item_type'],
                            'notes'         => $item['notes']         ?? null,
                            'pricing_notes' => $item['pricing_notes'] ?? null,
                        ],
                    ];

                    $subtotal += $p['lineAfter']; // final payable / net
                    continue;
                }

                // ── Real service ─────────────────────────────────────────
                if (!empty($item['service_id']) && empty($item['product_id'])) {
                    $service    = \App\Models\Service::findOrFail($item['service_id']);
                    $qty        = floatval($item['quantity']        ?? 1);
                    $unitPrice  = floatval($item['unit_price']      ?? $service->price ?? 0);
                    $discAmount = floatval($item['discount_amount'] ?? 0);
                    $p          = $this->calcPricing($qty, $unitPrice, $discAmount);

                    $itemsData[] = [
                        'product'                   => null,
                        'is_custom_item'            => false,
                        'item_type'                 => 'service',
                        'quantity'                  => $qty,
                        'backorder_quantity'        => 0,
                        'in_stock_quantity'         => 0,
                        'fulfillment_status'        => 'in_stock',
                        'unit_price'                => $unitPrice,
                        
                        'line_total'                => $p['lineTotal'],
                        'line_total_after_discount' => $p['lineAfter'],
                        'discount_amount'           => $discAmount,
                        'is_bulk_pricing'           => false,
                        'description'               => $item['description'] ?? $service->name,
                        'service_id'                => $service->id,
                        'service_name'              => $service->name,
                        'service_description'       => $service->short_description ?? $service->description ?? null,
                        'service_category'          => optional($service->serviceCategory)->name,
                        'unit_of_measure'           => $item['unit_of_measure'] ?? 'hour',
                        'pricing_notes'             => $item['pricing_notes']   ?? null,
                        'notes'                     => $item['notes']           ?? null,
                        'is_taxable'                => $item['is_taxable']      ?? true,
                        'is_negotiated_price'       => $item['is_negotiated_price'] ?? false,
                        'requires_site_visit'       => $item['requires_site_visit'] ?? false,
                        'estimated_hours'           => $item['estimated_hours'] ?? null,
                        'hourly_rate'               => $item['hourly_rate']     ?? null,
                        'labor_cost'                => $item['labor_cost']      ?? null,
                        'material_cost'             => $item['material_cost']   ?? null,
                        'display_order'             => $item['display_order']   ?? 0,
                        'variant_details'           => $item['variant_details'] ?? null,
                        'custom_item_details'       => null,
                    ];

                    $subtotal += $p['lineAfter']; // final payable / net
                    continue;
                }

                // ── Real product ─────────────────────────────────────────
                $product      = Product::findOrFail($item['product_id']);
                $requestedQty = floatval($item['quantity']);
                $currentStock = floatval($product->stock_quantity);

                $rawBackorder      = max(0, $requestedQty - $currentStock);
                $backorderQty      = (int) ceil($rawBackorder);
                $inStockQty        = min($requestedQty, $currentStock);
                $fulfillmentStatus = 'in_stock';
                if ($backorderQty > 0) {
                    $fulfillmentStatus = $inStockQty > 0 ? 'partial' : 'backorder';
                }

                $basePrice     = (float) $product->price;
                $isBulkPricing = false;

                if ($product->bulk_pricing && is_array($product->bulk_pricing)) {
                    foreach ($product->bulk_pricing as $tier) {
                        if (isset($tier['min_qty'], $tier['max_qty'], $tier['price'])) {
                            if ($requestedQty >= $tier['min_qty'] && $requestedQty <= $tier['max_qty']) {
                                $basePrice     = (float) $tier['price'];
                                $isBulkPricing = true;
                                break;
                            }
                        }
                    }
                }

                if ($request->order_type === 'bulk') $isBulkPricing = true;

                $unitPrice  = floatval($item['unit_price']      ?? $basePrice);
                $discAmount = floatval($item['discount_amount'] ?? 0);
                $p          = $this->calcPricing($requestedQty, $unitPrice, $discAmount);

                $itemsData[] = [
                    'product'                   => $product,
                    'is_custom_item'            => false,
                    'item_type'                 => 'product',
                    'quantity'                  => $requestedQty,
                    'backorder_quantity'        => $backorderQty,
                    'in_stock_quantity'         => $inStockQty,
                    'fulfillment_status'        => $fulfillmentStatus,
                    'unit_price'                => $unitPrice,
                    'unit_of_measure'           => $item['unit_of_measure']     ?? 'each',
                    
                    'line_total'                => $p['lineTotal'],
                    'line_total_after_discount' => $p['lineAfter'],
                    'discount_amount'           => $discAmount,
                    'is_bulk_pricing'           => $isBulkPricing,
                    'variant_details'           => $item['variant_details'] ?? null,
                    'custom_item_details'       => null,

                    'pricing_notes'             => $item['pricing_notes']       ?? null,
                    'notes'                     => $item['notes']               ?? null,
                    'is_taxable'                => $item['is_taxable']          ?? true,
                    'is_negotiated_price'       => $item['is_negotiated_price'] ?? false,
                    'display_order'             => $item['display_order']       ?? 0,
                ];

                $subtotal += $p['lineAfter']; // final payable / net
            }

            // Customer-level discount
            $discount = 0;
            if ($customer && $customer->discount_percentage > 0) {
                $discount = ($customer->discount_percentage / 100) * $subtotal;
            }

            // Referral discount (first order only, separate column)
            $referralDiscount = 0;
            $referralCodeId   = null;
            if ($customer && $customer->hasReferralDiscount()) {
                $referralCode = $customer->referralCode;
                if ($referralCode && $referralCode->is_valid) {
                    $referralDiscount = $referralCode->calculateDiscount($subtotal);
                    $referralCodeId   = $referralCode->id;
                    $referralCode->recordAttempt();
                }
            }

            // ── Promo code discount (optional, separate column) ───────────────────────
            $promoDiscount = 0;
            $promoCodeId   = null;
            if ($request->filled('promo_code') && $customer) {
                $promoService = new PromoCodeService();
                $promoResult  = $promoService->validatePromoCode(
                    code:             $request->promo_code,
                    customer:         $customer,
                    orderValue:       $subtotal,
                    referralDiscount: $referralDiscount,
                    exchangeRateToKes: (float) ($request->exchange_rate_to_kes ?? 1.0),
                );
                if ($promoResult['valid']) {
                    $promoDiscount = $promoResult['discount'];
                    $promoCodeId   = $promoResult['code']->id;
                    $promoResult['code']->recordAttempt();
                }
            }

            $shippingCost  = $this->calculateShippingCost($request->delivery_method, $subtotal);
            $taxableAmount = $subtotal - $discount - $referralDiscount - $promoDiscount;
            $tax           = $taxableAmount * 0.16;
            $total         = $subtotal - $discount - $referralDiscount - $promoDiscount + $tax + $shippingCost;

            // ── Store credit deduction ────────────────────────────────────────────────────
            $exchangeRate            = (float) ($request->exchange_rate_to_kes ?? 1.0);
            $preliminaryTotalKes     = round($total * ($exchangeRate > 0 ? $exchangeRate : 1), 2);
            $creditDeductionKes      = 0;
            $creditDeductionCurrency = 0;

            if ($customer && $request->boolean('apply_store_credit') && (float) $customer->store_credit > 0) {
                $requested = (float) ($request->input('store_credit_amount') ?? $customer->store_credit);
                $deduction = app(\App\Services\LoyaltyService::class)->applyStoreCreditToOrder(
                    customer:     $customer,
                    requestedKes: $requested,
                    totalKes:     $preliminaryTotalKes,
                    exchangeRate: $exchangeRate,
                );
                $creditDeductionKes      = $deduction['deduction_kes'];
                $creditDeductionCurrency = $deduction['deduction_order_currency'];
                $total                  -= $creditDeductionCurrency;
            }
            
            $totalORDQty    = (int) round(collect($request->items)->sum('quantity'));
            $year        = date('Y');
            $customerId  = $customer->id ?? 'G-U-E-S-T';
            $datePart    = date('dm'); // DDMM e.g. 1503 for March 15
            $attempts = 0;

            do {
                $random      = str_pad(random_int(0, 999), 3, '0', STR_PAD_LEFT);
                $orderNumber = "ORD-{$year}-{$customerId}-{$totalORDQty}-{$datePart}{$random}";
                $attempts++;
                if ($attempts > 25) {
                    throw new \Exception('Could not generate unique order number after 10 attempts.');
                }
            } while (Order::withTrashed()->where('order_number', $orderNumber)->exists());

            // ✅ STEP 4: Create order
            $order = Order::create([
                'order_number' => $orderNumber,
                'customer_id'              => $customer->id,
                'placed_by'                => Auth::check() ? Auth::id() : null,
                'subtotal'                 => $subtotal,
                'tax'                      => $tax,

                'referral_code_id'         => $referralCodeId,
                'referral_discount'        => $referralDiscount,
                'promo_code_id'            => $promoCodeId,
                'promo_discount'           => $promoDiscount,
                'store_credit_deduction'     => $creditDeductionCurrency,  
                'store_credit_deduction_kes' => $creditDeductionKes,  
                'discount'                 => $discount, 
                
                'currency'                 => $request->currency           ?? 'KES',
                'exchange_rate_to_kes'     => $request->exchange_rate_to_kes ?? 1,
                'shipping_cost'            => $shippingCost,
                'total'                    => $total,
                'payment_method'           => $request->payment_method,
                'payment_status'           => 'unpaid',
                'status'                   => 'pending',
                'priority'                 => 'medium',
                'shipping_address'         => $request->shipping_address,
                'billing_address'          => $request->shipping_address,
                'billing_same_as_shipping' => true,
                'delivery_method'          => $request->delivery_method,
                'order_type'               => 'standard',
                'customer_notes'           => $request->customer_notes,
                'billing_schedule'         => $request->billing_schedule   ?? null,
                'project_name'             => $request->project_name       ?? null,
                'service_start_date'       => $request->service_start_date ?? null,
                'service_end_date'         => $request->service_end_date   ?? null,
            ]);

            $order->applyKesSnapshot();

            // ── Spend store credit ────────────────────────────────────────────────────────
            if ($creditDeductionKes > 0) {
                try {
                    app(\App\Services\LoyaltyService::class)->spendCredit($customer, $creditDeductionKes, $order);
                } catch (\Exception $e) {
                    Log::warning("Store credit spend failed for order {$order->id}: " . $e->getMessage());
                }
            }

            // ── Record promo code usage if applied ────────────────────────────────────
            if ($promoCodeId) {
                $promoService = new PromoCodeService();
                $promoService->recordPromoUsage(
                    \App\Models\ReferralCode::find($promoCodeId),
                    $order->subtotal_kes,                     // ✅ KES revenue
                    $promoDiscount * $order->exchange_rate_to_kes // ✅ KES discount
                );
            }

            // ✅ STEP 5: Create order items
            $this->createOrderItems($order->id, $itemsData);

            DB::commit();

            try {
                //Mail::to($customer->email)->send(new OrderConfirmation($order));
                $order->load(['items.product', 'customer']);
                $this->mailer->sendOrderCreated($order);

            } catch (\Exception $e) {
                Log::error('Order confirmation email failed: ' . $e->getMessage());
            }

            return response()->json([
                'message' => 'Order created successfully',
                'order'   => $order->load('items.product'),
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Order creation failed: ' . $e->getMessage());
            Log::error('Stack trace: ' . $e->getTraceAsString());
            return response()->json(['message' => 'Failed to create order', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Get single order (CUSTOMER - own orders)
     */
    public function show(Request $request, $id)
    {
        $order = Order::with(['items.product', 'customer', 'promoCode', 'referralCode'])->findOrFail($id);

        if ($request->user()->customer->id !== $order->customer_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        //return response()->json(['order' => $order], 200);
        return response()->json([
        'order' => array_merge($order->toArray(), [
            'promo_code'    => $order->promoCode?->code,
            'referral_code' => $order->referralCode?->code,
        ]),
    ], 200);
    }

    /**
     * Customer soft-deletes their own pending/unpaid order
     * DELETE /customer/orders/{id}/trash
     */
    public function customerTrash(Request $request, $id)
    {
        DB::beginTransaction();
        try {
            $order = Order::with('items.product')->findOrFail($id);

            if ($request->user()->customer->id !== $order->customer_id) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $currentUserId = $request->user()->id ?? null;
            if (!is_null($order->placed_by) && $order->placed_by !== $currentUserId) {
                return response()->json([
                    'message' => 'This order was created by our team and cannot be managed online. Please contact support for assistance.',
                    'code'    => 'admin_created_order',
                ], 400);
            }

            if ($order->status !== 'pending') {
                return response()->json(['message' => 'Only pending orders can be deleted.', 'current_status' => $order->status], 400);
            }

            if ($order->payment_status !== 'unpaid') {
                return response()->json(['message' => 'Only unpaid orders can be deleted online. Please contact support.', 'current_payment_status' => $order->payment_status], 400);
            }

            if ($order->trashed()) {
                return response()->json(['message' => 'Order is already in trash'], 400);
            }

            foreach ($order->items as $item) {
                if (!$item->product_id || $item->is_custom_item) continue;
                $product = $item->product;
                if (!$product) continue;
                $quantityToReturn = $item->quantity - $item->quantity_returned;
                if ($quantityToReturn > 0) {
                    $product->increment('stock_quantity', $quantityToReturn);
                    if ($product->stock_quantity > 0 && !$product->in_stock) {
                        $product->update(['in_stock' => true]);
                    }
                }
            }

            $order->update([
                'customer_notes' => ($order->customer_notes ? $order->customer_notes . "\n\n" : '')
                    . '[MOVED TO TRASH BY CUSTOMER on ' . now()->format('Y-m-d H:i:s') . ']',
            ]);

            $order->delete();
            DB::commit();

            return response()->json([
                'message'    => "Order {$order->order_number} moved to trash and inventory returned",
                'deleted_at' => $order->fresh()->deleted_at,
            ], 200);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Customer trash order failed', ['order_id' => $id, 'error' => $e->getMessage()]);
            return response()->json(['message' => 'Failed to delete order', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Update order (CUSTOMER - only pending orders)
     * PUT /customer/orders/{id}
     */
    public function customerUpdate(Request $request, $id)
    {
        $order = Order::findOrFail($id);

        if ($request->user()->customer->id !== $order->customer_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($order->status !== 'pending') {
            return response()->json(['message' => 'Only pending orders can be updated'], 400);
        }

        $validator = Validator::make($request->all(), [
            'payment_method'         => 'required|in:request_invoice,pay_on_delivery,mpesa,bank_transfer,credit_card,credit',
            'delivery_method'        => 'required|in:pickup,standard_delivery,express_delivery,courier',
            'courier_company'        => 'required_if:delivery_method,courier|nullable|string',
            'order_type'             => 'required|in:standard,bulk,b2b,quotation,service,mixed,project,subscription',
            'shipping_address'       => 'required|string',
            'customer_notes'         => 'nullable|string',
            'items'                  => 'required|array|min:1',
            'items.*.product_id'     => 'nullable|exists:products,id',
            'items.*.service_id'     => 'nullable|exists:services,id',
            'items.*.item_type'      => 'required|in:product,service,fee,custom_product,custom_service',
            'items.*.is_custom_item' => 'nullable|boolean',
            'items.*.quantity'       => 'required|numeric|min:0.01',
            'items.*.variant_details' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            $totalQty = collect($request->items)->sum('quantity');

            if ($request->order_type === 'bulk' && $totalQty <= 100) {
                DB::rollBack();
                return response()->json(['message' => 'Bulk orders must have more than 100 items total', 'current_total' => $totalQty], 400);
            }

            // ✅ STEP 1: VALIDATE STOCK WITH BUFFER
            foreach ($request->items as $item) {
                if (empty($item['product_id'])) continue;

                $product      = Product::findOrFail($item['product_id']);
                $requestedQty = floatval($item['quantity']);
                $currentStock = floatval($product->stock_quantity);

                $existingItem = $order->items()->where('product_id', $product->id)->first();
                if ($existingItem) $currentStock += $existingItem->in_stock_quantity;

                $maxAllowed = $currentStock + 200;

                if ($requestedQty > $maxAllowed) {
                    DB::rollBack();
                    return response()->json([
                        'message'       => "Order quantity exceeds maximum allowed for {$product->name}",
                        'product'       => $product->name,
                        'current_stock' => $currentStock,
                        'max_allowed'   => $maxAllowed,
                        'requested'     => $requestedQty,
                    ], 400);
                }
            }

            // ✅ STEP 2: Restore stock from old items, then delete them
            foreach ($order->items as $oldItem) {
                if ($oldItem->product && $oldItem->in_stock_quantity > 0) {
                    $oldItem->product->increment('stock_quantity', $oldItem->in_stock_quantity);
                    $oldItem->product->update(['in_stock' => true]);
                }
            }
            $order->items()->delete();

            // ✅ STEP 3: Build new items data
            $subtotal  = 0;
            $itemsData = [];

            foreach ($request->items as $item) {

                // ── Custom item ──────────────────────────────────────────
                if (empty($item['product_id']) && empty($item['service_id'])) {
                    $qty        = floatval($item['quantity']        ?? 1);
                    $unitPrice  = floatval($item['unit_price']      ?? 0);
                    $discAmount = floatval($item['discount_amount'] ?? 0);
                    $p          = $this->calcPricing($qty, $unitPrice, $discAmount);

                    $itemsData[] = [
                        'product'                   => null,
                        'is_custom_item'            => true,
                        'item_type'                 => $item['item_type'],
                        'quantity'                  => $qty,
                        'backorder_quantity'        => 0,
                        'in_stock_quantity'         => 0,
                        'fulfillment_status'        => 'in_stock',
                        'unit_price'                => $unitPrice,
                        
                        'line_total'                => $p['lineTotal'],
                        'line_total_after_discount' => $p['lineAfter'],
                        'discount_amount'           => $discAmount,
                        'is_bulk_pricing'           => false,
                        'description'               => $item['product_name'] ?? $item['description'] ?? '',
                        'service_id'                => null,
                        'service_name'              => null,
                        'service_description'       => null,
                        'service_category'          => null,
                        'unit_of_measure'           => $item['unit_of_measure']     ?? 'each',
                        'pricing_notes'             => $item['pricing_notes']       ?? null,
                        'notes'                     => $item['notes']               ?? null,
                        'is_taxable'                => $item['is_taxable']          ?? true,
                        'is_negotiated_price'       => $item['is_negotiated_price'] ?? false,
                        'requires_site_visit'       => $item['requires_site_visit'] ?? false,
                        'estimated_hours'           => $item['estimated_hours']     ?? null,
                        'hourly_rate'               => $item['hourly_rate']         ?? null,
                        'labor_cost'                => $item['labor_cost']          ?? null,
                        'material_cost'             => $item['material_cost']       ?? null,
                        'display_order'             => $item['display_order']       ?? 0,
                        'variant_details'           => $item['variant_details']     ?? null,
                        'custom_item_details'       => [
                            'name'          => $item['product_name'] ?? $item['description'] ?? null,
                            'unit_price'    => $unitPrice,
                            'item_type'     => $item['item_type'],
                            'notes'         => $item['notes']         ?? null,
                            'pricing_notes' => $item['pricing_notes'] ?? null,
                        ],
                    ];

                    $subtotal += $p['lineAfter'];
                    continue;
                }

                // ── Real service ─────────────────────────────────────────
                if (!empty($item['service_id']) && empty($item['product_id'])) {
                    $service    = \App\Models\Service::findOrFail($item['service_id']);
                    $qty        = floatval($item['quantity']        ?? 1);
                    $unitPrice  = floatval($item['unit_price']      ?? $service->price ?? 0);
                    $discAmount = floatval($item['discount_amount'] ?? 0);
                    $p          = $this->calcPricing($qty, $unitPrice, $discAmount);

                    $itemsData[] = [
                        'product'                   => null,
                        'is_custom_item'            => false,
                        'item_type'                 => 'service',
                        'quantity'                  => $qty,
                        'backorder_quantity'        => 0,
                        'in_stock_quantity'         => 0,
                        'fulfillment_status'        => 'in_stock',
                        'unit_price'                => $unitPrice,
                        
                        'line_total'                => $p['lineTotal'],
                        'line_total_after_discount' => $p['lineAfter'],
                        'discount_amount'           => $discAmount,
                        'is_bulk_pricing'           => false,
                        'description'               => $item['description'] ?? $service->name,
                        'service_id'                => $service->id,
                        'service_name'              => $service->name,
                        'service_description'       => $service->short_description ?? $service->description ?? null,
                        'service_category'          => optional($service->serviceCategory)->name,
                        'unit_of_measure'           => $item['unit_of_measure'] ?? 'hour',
                        'pricing_notes'             => $item['pricing_notes']   ?? null,
                        'notes'                     => $item['notes']           ?? null,
                        'is_taxable'                => $item['is_taxable']      ?? true,
                        'is_negotiated_price'       => $item['is_negotiated_price'] ?? false,
                        'requires_site_visit'       => $item['requires_site_visit'] ?? false,
                        'estimated_hours'           => $item['estimated_hours'] ?? null,
                        'hourly_rate'               => $item['hourly_rate']     ?? null,
                        'labor_cost'                => $item['labor_cost']      ?? null,
                        'material_cost'             => $item['material_cost']   ?? null,
                        'display_order'             => $item['display_order']   ?? 0,
                        'variant_details'           => $item['variant_details'] ?? null,
                        'custom_item_details'       => null,
                    ];

                    $subtotal += $p['lineAfter'];
                    continue;
                }

                // ── Real product ─────────────────────────────────────────
                $product      = Product::findOrFail($item['product_id']);
                $requestedQty = floatval($item['quantity']);
                $currentStock = floatval($product->stock_quantity);

                $rawBackorder      = max(0, $requestedQty - $currentStock);
                $backorderQty      = (int) ceil($rawBackorder);
                $inStockQty        = min($requestedQty, $currentStock);
                $fulfillmentStatus = 'in_stock';
                if ($backorderQty > 0) {
                    $fulfillmentStatus = $inStockQty > 0 ? 'partial' : 'backorder';
                }

                $basePrice     = (float) $product->price;
                $isBulkPricing = false;

                if ($product->bulk_pricing && is_array($product->bulk_pricing)) {
                    foreach ($product->bulk_pricing as $tier) {
                        if (isset($tier['min_qty'], $tier['max_qty'], $tier['price'])) {
                            if ($requestedQty >= $tier['min_qty'] && $requestedQty <= $tier['max_qty']) {
                                $basePrice     = (float) $tier['price'];
                                $isBulkPricing = true;
                                break;
                            }
                        }
                    }
                }

                if ($request->order_type === 'bulk') $isBulkPricing = true;

                $unitPrice  = floatval($item['unit_price']      ?? $basePrice);
                $discAmount = floatval($item['discount_amount'] ?? 0);
                $p          = $this->calcPricing($requestedQty, $unitPrice, $discAmount);

                $itemsData[] = [
                    'product'                   => $product,
                    'is_custom_item'            => false,
                    'item_type'                 => 'product',
                    'quantity'                  => $requestedQty,
                    'backorder_quantity'        => $backorderQty,
                    'in_stock_quantity'         => $inStockQty,
                    'fulfillment_status'        => $fulfillmentStatus,
                    'unit_price'                => $unitPrice,
                    'unit_of_measure'           => $item['unit_of_measure']     ?? 'each',
                    
                    'line_total'                => $p['lineTotal'],
                    'line_total_after_discount' => $p['lineAfter'],
                    'discount_amount'           => $discAmount,
                    'is_bulk_pricing'           => $isBulkPricing,
                    'variant_details'           => $item['variant_details'] ?? null,
                    'custom_item_details'       => null,

                    'pricing_notes'             => $item['pricing_notes']       ?? null,
                    'notes'                     => $item['notes']               ?? null,
                    'is_taxable'                => $item['is_taxable']          ?? true,
                    'is_negotiated_price'       => $item['is_negotiated_price'] ?? false,
                    'display_order'             => $item['display_order']       ?? 0,
                ];

                $subtotal += $p['lineAfter'];
            }

            $customer      = $order->customer;
            $discount      = 0;
            if ($customer && $customer->discount_percentage > 0) {
                $discount = ($customer->discount_percentage / 100) * $subtotal;
            }

            // Preserve both discounts — never recalculate on edit, only cap at subtotal
            $referralDiscount = min(
                (float) ($order->referral_discount ?? 0),
                $subtotal  // cap: referral discount can never exceed new subtotal
            );
            
            $promoDiscount = min((float) ($order->promo_discount    ?? 0), $subtotal - $referralDiscount);

            $shippingCost  = $this->calculateShippingCost($request->delivery_method, $subtotal);
            $taxableAmount = $subtotal - $discount - $referralDiscount - $promoDiscount;
            $tax           = $taxableAmount * 0.16;
            $total         = $subtotal - $discount - $referralDiscount - $promoDiscount + $tax + $shippingCost;
            // Carry forward existing store credit deduction
            $existingCreditDeduction    = (float) ($order->store_credit_deduction     ?? 0);
            $existingCreditDeductionKes = (float) ($order->store_credit_deduction_kes ?? 0);
            $total -= $existingCreditDeduction;

            // ✅ STEP 4: Update order
            $order->update([
                'subtotal'         => $subtotal,
                'tax'              => $tax,
                'referral_discount'=> $referralDiscount,
                'promo_discount'   => $promoDiscount,
                'store_credit_deduction'     => $existingCreditDeduction,
                'store_credit_deduction_kes' => $existingCreditDeductionKes,
                'discount'         => $discount,
                'shipping_cost'    => $shippingCost,
                'total'            => $total,
                'payment_method'   => $request->payment_method,
                'delivery_method'  => $request->delivery_method,
                'courier_company'  => $request->delivery_method === 'courier' ? $request->courier_company : null,
                'order_type'       => $request->order_type,
                'shipping_address' => $request->shipping_address,
                'customer_notes'   => $request->customer_notes,
            ]);
            $order->applyKesSnapshot();

            // ✅ STEP 5: Create new order items
            $this->createOrderItems($order->id, $itemsData, true);
            // Recalculate average order value only (don't re-increment total_orders/total_spent)
            $customer = $order->fresh()->customer;
            if ($customer && $customer->total_orders > 0) {
                $realTotal = \App\Models\Order::where('customer_id', $customer->id)
                    ->whereNotIn('status', ['cancelled', 'failed'])
                    ->sum('total_kes');
                $customer->update(['total_spent' => $realTotal, 'average_order_value' => round($realTotal / $customer->total_orders, 2)]);
            }

            DB::commit();

            return response()->json([
                'message' => 'Order updated successfully',
                'order'   => $order->fresh('items.product', 'customer'),
            ], 200);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Order update failed: ' . $e->getMessage());
            Log::error('Stack trace: ' . $e->getTraceAsString());
            return response()->json(['message' => 'Failed to update order', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Submit rating and feedback for delivered order (CUSTOMER)
     */
    public function rateOrder(Request $request, $id)
    {
        $order = Order::findOrFail($id);

        if ($request->user()->customer->id !== $order->customer_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($order->status !== 'delivered') {
            return response()->json(['message' => 'Only delivered orders can be rated'], 400);
        }

        if ($order->rating !== null) {
            return response()->json(['message' => 'This order has already been rated'], 400);
        }

        $validator = Validator::make($request->all(), [
            'rating'   => 'required|integer|min:1|max:10',
            'feedback' => 'nullable|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $order->update(['rating' => $request->rating, 'feedback' => $request->feedback]);

        return response()->json(['message' => 'Rating submitted successfully', 'order' => $order], 200);
    }

    /**
     * Cancel order (CUSTOMER - PENDING + UNPAID ONLY)
     */
    public function customerCancel(Request $request, $id)
    {
        $validator = Validator::make($request->all(), ['reason' => 'required|string|max:500']);
        if ($validator->fails()) return response()->json(['errors' => $validator->errors()], 422);

        $order = Order::with('items.product')->findOrFail($id);

        if ($order->customer_id !== $request->user()->customer->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $currentUserId = $request->user()->id ?? null;
        if (!is_null($order->placed_by) && $order->placed_by !== $currentUserId) {
            return response()->json([
                'message' => 'This order was created by our team and cannot be managed online. Please contact support for assistance.',
                'code'    => 'admin_created_order',
            ], 400);
        }

        if ($order->status !== 'pending') {
            return response()->json(['message' => 'You can only cancel orders with pending status.', 'current_status' => $order->status], 400);
        }

        if ($order->payment_status !== 'unpaid') {
            return response()->json(['message' => 'You can only cancel unpaid orders.', 'current_payment_status' => $order->payment_status], 400);
        }

        DB::beginTransaction();
        try {
            foreach ($order->items as $item) {
                if ($item->product && $item->in_stock_quantity > 0) {
                    $item->product->increment('stock_quantity', $item->in_stock_quantity);
                    if (!$item->product->in_stock && $item->product->stock_quantity > 0) {
                        $item->product->update(['in_stock' => true]);
                    }
                }
            }

            $order->update([
                'status'              => 'cancelled',
                'cancelled_at'        => now(),
                'cancellation_reason' => $request->reason,
                'customer_notes'      => ($order->customer_notes ? $order->customer_notes . "\n\n" : '')
                    . '[CANCELLED BY CUSTOMER on ' . now()->format('Y-m-d H:i:s') . '] ' . $request->reason,
            ]);

            $order->refresh();
            $order->applyKesSnapshot();
            $this->refundOrderStoreCredit($order);
            DB::commit();

            try {
                $this->mailer->sendOrderCancelled($order->fresh(['items.product', 'customer']));
            } catch (\Exception $e) {
                Log::error('Customer cancel email failed: ' . $e->getMessage());
            }

            return response()->json([
                'message' => 'Order cancelled successfully.',
                'order'   => $order->fresh(['items.product', 'customer']),
            ], 200);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Customer order cancellation failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to cancel order', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Restore cancelled order (CUSTOMER - CANCELLED + UNPAID ONLY)
     */
    public function customerRestore(Request $request, $id)
    {
        $order = Order::with('items.product')->findOrFail($id);

        if ($order->customer_id !== $request->user()->customer->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $currentUserId = $request->user()->id ?? null;
        if (!is_null($order->placed_by) && $order->placed_by !== $currentUserId) {
            return response()->json([
                'message' => 'This order was created by our team and cannot be managed online.',
                'code'    => 'admin_created_order',
            ], 400);
        }

        if ($order->status !== 'cancelled') {
            return response()->json(['message' => 'Only cancelled orders can be restored.', 'current_status' => $order->status], 400);
        }

        if ($order->payment_status !== 'unpaid') {
            return response()->json(['message' => 'Only unpaid orders can be restored.', 'current_payment_status' => $order->payment_status], 400);
        }

        DB::beginTransaction();
        try {
            foreach ($order->items as $item) {
                if ($item->product && $item->in_stock_quantity > 0) {
                    if ($item->product->stock_quantity < $item->in_stock_quantity) {
                        DB::rollBack();
                        return response()->json([
                            'message'         => "Insufficient stock to restore. {$item->product_name} needs {$item->in_stock_quantity} but only {$item->product->stock_quantity} available.",
                            'product'         => $item->product_name,
                            'available_stock' => $item->product->stock_quantity,
                            'required_stock'  => $item->in_stock_quantity,
                        ], 400);
                    }
                    $item->product->decrement('stock_quantity', $item->in_stock_quantity);
                    if ($item->product->stock_quantity <= 0) $item->product->update(['in_stock' => false]);
                }
            }

            $order->update([
                'status'              => 'pending',
                'cancelled_at'        => null,
                'cancellation_reason' => null,
                'customer_notes'      => ($order->customer_notes ? $order->customer_notes . "\n\n" : '')
                    . '[RESTORED BY CUSTOMER on ' . now()->format('Y-m-d H:i:s') . ']',
            ]);

            $this->rechargeOrderStoreCredit($order);
            DB::commit();

            return response()->json([
                'message' => 'Order restored successfully.',
                'order'   => $order->fresh(['items.product', 'customer']),
            ], 200);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Customer order restoration failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to restore order', 'error' => $e->getMessage()], 500);
        }
    }

    // ========================================
    // ADMIN ROUTES
    // ========================================

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
            'data' => $orders->items(),
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

        return response()->json($orders, 200);
    }

    public function trashIndex(Request $request)
    {
        $query = Order::onlyTrashed()->with(['customer', 'items']);

        if ($request->filled('payment_status')) $query->where('payment_status', $request->payment_status);

        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('id', $s)
                  ->orWhere('order_number', 'like', "%{$s}%")
                  ->orWhereHas('customer', fn ($c) =>
                      $c->where('email', 'like', "%{$s}%")
                        ->orWhere('first_name', 'like', "%{$s}%")
                        ->orWhere('last_name', 'like', "%{$s}%")
                  );
            });
        }

        if ($request->filled('from_date')) $query->whereDate('deleted_at', '>=', $request->from_date);
        if ($request->filled('to_date'))   $query->whereDate('deleted_at', '<=', $request->to_date);

        $orders = $query->orderBy('deleted_at', 'desc')->paginate($request->get('per_page', 20));

        return response()->json([
            'data' => $orders->items(),
            'meta' => ['current_page' => $orders->currentPage(), 'per_page' => $orders->perPage(), 'total' => $orders->total()],
        ]);
    }

    public function adminShow(Request $request, $id)
    {
        $order = Order::with(['items.product', 'customer', 'assignedTo', 'quote', 'promoCode', 'referralCode'])->findOrFail($id);
        //return response()->json(['order' => $order], 200);
        return response()->json([
        'order' => array_merge($order->toArray(), [
            'promo_code'    => $order->promoCode?->code,
            'referral_code' => $order->referralCode?->code,
        ]),
    ], 200);
    }

    public function update(Request $request, $id)
    {
        $order = Order::findOrFail($id);

        $data = $request->validate([
            'subtotal'                => 'nullable|numeric|min:0',
            'tax'                     => 'nullable|numeric|min:0',
            'shipping_cost'           => 'nullable|numeric|min:0',
            'discount'                => 'nullable|numeric|min:0',
            'total'                   => 'nullable|numeric|min:0',
            'order_type'              => 'nullable|in:standard,quotation,bulk,b2b,service,mixed,project,subscription',
            'tracking_number'         => 'nullable|string',
            'courier_company'         => 'nullable|string',
            'estimated_delivery_date' => 'nullable|date',
        ]);

        $financialChanged = false;
        foreach (['subtotal', 'tax', 'discount', 'shipping_cost', 'total'] as $field) {
            if (isset($data[$field]) && $data[$field] != $order->$field) $financialChanged = true;
        }

        if ($financialChanged) OrderItem::where('order_id', $order->id)->update(['is_negotiated_price' => true]);
        if (isset($data['order_type']) && $data['order_type'] === 'bulk' && $order->order_type !== 'bulk') {
            OrderItem::where('order_id', $order->id)->update(['is_bulk_pricing' => true]);
        }

        $order->update($data);

        return response()->json(['message' => 'Order updated successfully', 'order' => $order->fresh('items.product', 'customer')], 200);
    }

    public function destroy(Request $request, $id)
    {
        DB::beginTransaction();
        try {
            $order = Order::with(['items'])->findOrFail($id);

            if ($order->trashed()) {
                return response()->json(['message' => 'Order is already in trash'], 400);
            }

            $user = $request->user();
            $isSuperAdmin = $user && in_array($user->role, ['super_admin']);

            $safeForDeletion =
                in_array($order->status, ['failed', 'cancelled']) ||
                ($order->status === 'pending' && $order->payment_status === 'unpaid');

            if (!$isSuperAdmin && !$safeForDeletion) {
                return response()->json([
                    'message' => 'This order cannot be moved to trash in its current state.',
                    'hint'    => 'Cancel the order first, then trash it.',
                    'status'  => $order->status,
                ], 400);
            }

            // IMPORTANT:
            // If order is already cancelled, stock was already handled during cancellation.
            // So do NOT touch inventory again.
            if ($order->status !== 'cancelled') {
                foreach ($order->items as $item) {
                    if (!$item->product_id || $item->is_custom_item) {
                        continue;
                    }

                    $product = Product::find($item->product_id);
                    if (!$product) {
                        continue;
                    }

                    // Use in_stock_quantity because that is what was actually reserved
                    $qtyToReturn = (float) ($item->in_stock_quantity ?? 0);

                    if ($qtyToReturn > 0) {
                        $product->increment('stock_quantity', $qtyToReturn);

                        if ($product->stock_quantity > 0 && !$product->in_stock) {
                            $product->update(['in_stock' => true]);
                        }
                    }
                }
            }

            $order->delete();
            DB::commit();

            $isRisky = in_array($order->status, ['shipped', 'delivered']);

            return response()->json([
                'message'    => $order->status === 'cancelled'
                    ? "Order {$order->order_number} moved to trash"
                    : "Order {$order->order_number} moved to trash and inventory returned",
                'deleted_at' => $order->fresh()->deleted_at,
                'warning'    => $isRisky ? "This order was {$order->status}. Trashing it may hide active fulfillment history." : null,
                'is_risky'   => $isRisky,
            ], 200);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Order deletion failed', [
                'order_id' => $id,
                'error'    => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Failed to delete order',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    public function restore($id)
    {
        DB::beginTransaction();
        try {
            $order = Order::withTrashed()->with('items')->findOrFail($id);

            if (!$order->trashed()) {
                return response()->json(['message' => 'Order is not deleted'], 400);
            }

            // IMPORTANT:
            // If the order status is cancelled, restoring it should NOT affect inventory.
            if ($order->status !== 'cancelled') {
                foreach ($order->items as $item) {
                    if (!$item->product_id || $item->is_custom_item) {
                        continue;
                    }

                    $product = Product::find($item->product_id);
                    if (!$product) {
                        continue;
                    }

                    // Use in_stock_quantity because that is what should be reserved back
                    $qtyToReserve = (float) ($item->in_stock_quantity ?? 0);

                    if ($qtyToReserve > 0) {
                        if ($product->stock_quantity < $qtyToReserve) {
                            throw new \Exception("Insufficient stock for {$product->name}.");
                        }

                        $product->decrement('stock_quantity', $qtyToReserve);

                        if ($product->stock_quantity <= 0) {
                            $product->update(['in_stock' => false]);
                        }
                    }
                }
            }

            $order->restore();
            DB::commit();

            return response()->json([
                'message'      => $order->status === 'cancelled'
                    ? 'Order restored successfully'
                    : 'Order restored successfully and inventory reserved',
                'order_number' => $order->order_number,
            ], 200);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Order restoration failed: ' . $e->getMessage());

            return response()->json([
                'message' => 'Failed to restore order',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    public function restoreMultiple(Request $request)
    {
        $data = $request->validate(['order_ids' => 'required|array|min:1', 'order_ids.*' => 'required|integer']);

        DB::beginTransaction();
        try {
            $orders   = Order::onlyTrashed()->with('items.product')->whereIn('id', $data['order_ids'])->get();
            $restored = 0;
            $failed   = [];

            foreach ($orders as $order) {
                try {
                    // If cancelled, do not touch stock
                    if ($order->status !== 'cancelled') {
                        foreach ($order->items as $item) {
                            if (!$item->product_id || $item->is_custom_item) {
                                continue;
                            }

                            $product = $item->product;
                            if (!$product) {
                                throw new \Exception("Product not found for item: {$item->product_name}");
                            }

                            $qtyToReserve = (float) ($item->in_stock_quantity ?? 0);

                            if ($qtyToReserve > 0) {
                                if ($product->stock_quantity < $qtyToReserve) {
                                    throw new \Exception("Insufficient stock for {$product->name}.");
                                }

                                $product->decrement('stock_quantity', $qtyToReserve);

                                if ($product->stock_quantity <= 0) {
                                    $product->update(['in_stock' => false]);
                                }
                            }
                        }
                    }

                    $order->restore();
                    $restored++;
                } catch (\Exception $e) {
                    $failed[] = [
                        'order_number' => $order->order_number,
                        'reason'       => $e->getMessage(),
                    ];
                }
            }

            DB::commit();
            return response()->json(['message' => "Successfully restored {$restored} order(s)", 'restored_count' => $restored, 'failed_orders' => $failed], 200);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to restore orders', 'error' => $e->getMessage()], 500);
        }
    }

    public function forceDelete(Request $request, $id)
    {
        DB::beginTransaction();
        try {
            $order       = Order::withTrashed()->with('items')->findOrFail($id);
            $itemCount   = $order->items()->count();
            $orderNumber = $order->order_number;
            $order->items()->delete();
            $order->forceDelete();
            DB::commit();
            return response()->json(['message' => "Order {$orderNumber} permanently deleted", 'items_deleted' => $itemCount], 200);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to permanently delete order', 'error' => $e->getMessage()], 500);
        }
    }

    public function forceDeleteMultiple(Request $request)
    {
        $data = $request->validate(['order_ids' => 'required|array|min:1', 'order_ids.*' => 'required|integer']);

        DB::beginTransaction();
        try {
            $orders  = Order::withTrashed()->with('items')->whereIn('id', $data['order_ids'])->get();
            $deleted = 0;
            $failed  = [];

            foreach ($orders as $order) {
                try {
                    $order->items()->delete();
                    $order->forceDelete();
                    $deleted++;
                } catch (\Exception $e) {
                    $failed[] = ['order_number' => $order->order_number, 'reason' => $e->getMessage()];
                }
            }

            DB::commit();
            return response()->json(['message' => "Permanently deleted {$deleted} order(s)", 'deleted_count' => $deleted, 'failed_orders' => $failed], 200);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to permanently delete orders', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * CREATE ORDER FOR CUSTOMER (ADMIN)
     * POST /admin/orders
     */
    public function adminCreateOrder(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'customer_id'            => 'required|exists:customers,id',
            'items'                  => 'required|array|min:1',
            'items.*.product_id'     => 'nullable|exists:products,id',
            'items.*.service_id'     => 'nullable|exists:services,id',
            'items.*.item_type'      => 'required|in:product,service,fee,custom_product,custom_service',
            'items.*.is_custom_item' => 'nullable|boolean',
            'items.*.quantity'       => 'required|numeric|min:0.01',
            'items.*.allow_backorder' => 'boolean',
            'items.*.discount'       => 'nullable|numeric',
            'delivery_method'        => 'required|in:pickup,standard_delivery,express_delivery,courier',
            'shipping_address'       => 'required|string',
            'priority'               => 'nullable|in:low,medium,high,urgent',
            'order_type'             => 'nullable|in:standard,quotation,bulk,b2b,service,mixed,project,subscription',
            'customer_notes'         => 'nullable|string',
            'admin_notes'            => 'nullable|string',
            'payment_status'         => 'nullable|in:unpaid,paid,partially_paid',
            'payment_reference'      => 'nullable|string',
            'apply_tax'              => 'boolean',
            'discount'               => 'nullable|numeric',
            'currency'               => 'nullable|string|max:10',
            'exchange_rate_to_kes'   => 'nullable|numeric',
            'billing_address'        => 'nullable|string',
            'billing_same_as_shipping' => 'nullable|boolean',
            'billing_schedule'       => 'nullable|in:one_time,milestone_based,monthly,hourly,fixed_price',
            'project_name'           => 'nullable|string',
            'service_start_date'     => 'nullable|date',
            'service_end_date'       => 'nullable|date',
            'shipping_cost'          => 'nullable|numeric|min:0',
            'subtotal_kes'           => 'nullable|numeric',
            'total_kes'              => 'nullable|numeric',
            'apply_store_credit'     => 'nullable|boolean',      
            'store_credit_amount'    => 'nullable|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            // ✅ STEP 1: VALIDATE STOCK WITH BUFFER
            foreach ($request->items as $itemData) {
                if (empty($itemData['product_id'])) continue;

                $product      = Product::findOrFail($itemData['product_id']);
                $requestedQty = floatval($itemData['quantity']);
                $currentStock = floatval($product->stock_quantity);
                $maxAllowed   = $currentStock + 200;

                if ($requestedQty > $maxAllowed) {
                    DB::rollBack();
                    return response()->json([
                        'message'       => "Order quantity exceeds maximum allowed for {$product->name}",
                        'product'       => $product->name,
                        'current_stock' => $currentStock,
                        'max_allowed'   => $maxAllowed,
                        'requested'     => $requestedQty,
                        'note'          => 'Maximum backorder quantity is 200 units above current stock',
                    ], 400);
                }
            }

            $customer  = Customer::findOrFail($request->customer_id);
            $subtotal  = 0;
            $itemsData = [];

            foreach ($request->items as $item) {

                // ── Custom item ──────────────────────────────────────────
                if (empty($item['product_id']) && empty($item['service_id'])) {
                    $qty        = floatval($item['quantity']        ?? 1);
                    $unitPrice  = floatval($item['unit_price']      ?? 0);
                    $discAmount = floatval($item['discount_amount'] ?? 0);
                    $p          = $this->calcPricing($qty, $unitPrice, $discAmount);

                    $itemsData[] = [
                        'product'                   => null,
                        'is_custom_item'            => true,
                        'item_type'                 => $item['item_type'],
                        'quantity'                  => $qty,
                        'backorder_quantity'        => 0,
                        'in_stock_quantity'         => 0,
                        'fulfillment_status'        => 'in_stock',
                        'unit_price'                => $unitPrice,
                        
                        'line_total'                => $p['lineTotal'],
                        'line_total_after_discount' => $p['lineAfter'],
                        'discount_amount'           => $discAmount,
                        'is_bulk_pricing'           => false,
                        'description'               => $item['product_name'] ?? $item['description'] ?? '',
                        'service_id'                => null,
                        'service_name'              => null,
                        'service_description'       => null,
                        'service_category'          => null,
                        'unit_of_measure'           => $item['unit_of_measure']     ?? 'each',
                        'pricing_notes'             => $item['pricing_notes']       ?? null,
                        'notes'                     => $item['notes']               ?? null,
                        'is_taxable'                => $item['is_taxable']          ?? true,
                        'is_negotiated_price'       => $item['is_negotiated_price'] ?? false,
                        'requires_site_visit'       => $item['requires_site_visit'] ?? false,
                        'estimated_hours'           => $item['estimated_hours']     ?? null,
                        'hourly_rate'               => $item['hourly_rate']         ?? null,
                        'labor_cost'                => $item['labor_cost']          ?? null,
                        'material_cost'             => $item['material_cost']       ?? null,
                        'display_order'             => $item['display_order']       ?? 0,
                        'variant_details'           => $item['variant_details']     ?? null,
                        'custom_item_details'       => [
                            'name'          => $item['product_name'] ?? $item['description'] ?? null,
                            'unit_price'    => $unitPrice,
                            'item_type'     => $item['item_type'],
                            'notes'         => $item['notes']         ?? null,
                            'pricing_notes' => $item['pricing_notes'] ?? null,
                        ],
                    ];

                    $subtotal += $p['lineAfter'];
                    continue;
                }

                // ── Real service ─────────────────────────────────────────
                if (!empty($item['service_id']) && empty($item['product_id'])) {
                    $service    = \App\Models\Service::findOrFail($item['service_id']);
                    $qty        = floatval($item['quantity']        ?? 1);
                    $unitPrice  = floatval($item['unit_price']      ?? $service->price ?? 0);
                    $discAmount = floatval($item['discount_amount'] ?? 0);
                    $p          = $this->calcPricing($qty, $unitPrice, $discAmount);

                    $itemsData[] = [
                        'product'                   => null,
                        'is_custom_item'            => false,
                        'item_type'                 => 'service',
                        'quantity'                  => $qty,
                        'backorder_quantity'        => 0,
                        'in_stock_quantity'         => 0,
                        'fulfillment_status'        => 'in_stock',
                        'unit_price'                => $unitPrice,
                        
                        'line_total'                => $p['lineTotal'],
                        'line_total_after_discount' => $p['lineAfter'],
                        'discount_amount'           => $discAmount,
                        'is_bulk_pricing'           => false,
                        'description'               => $item['description'] ?? $service->name,
                        'service_id'                => $service->id,
                        'service_name'              => $service->name,
                        'service_description'       => $service->short_description ?? $service->description ?? null,
                        'service_category'          => optional($service->serviceCategory)->name,
                        'unit_of_measure'           => $item['unit_of_measure'] ?? 'hour',
                        'pricing_notes'             => $item['pricing_notes']   ?? null,
                        'notes'                     => $item['notes']           ?? null,
                        'is_taxable'                => $item['is_taxable']      ?? true,
                        'is_negotiated_price'       => $item['is_negotiated_price'] ?? false,
                        'requires_site_visit'       => $item['requires_site_visit'] ?? false,
                        'estimated_hours'           => $item['estimated_hours'] ?? null,
                        'hourly_rate'               => $item['hourly_rate']     ?? null,
                        'labor_cost'                => $item['labor_cost']      ?? null,
                        'material_cost'             => $item['material_cost']   ?? null,
                        'display_order'             => $item['display_order']   ?? 0,
                        'variant_details'           => $item['variant_details'] ?? null,
                        'custom_item_details'       => null,
                    ];

                    $subtotal += $p['lineAfter'];
                    continue;
                }

                // ── Real product ─────────────────────────────────────────
                $product      = Product::findOrFail($item['product_id']);
                $requestedQty = floatval($item['quantity']);
                $currentStock = floatval($product->stock_quantity);

                $rawBackorder      = max(0, $requestedQty - $currentStock);
                $backorderQty      = (int) ceil($rawBackorder);
                $inStockQty        = min($requestedQty, $currentStock);
                $fulfillmentStatus = 'in_stock';
                if ($backorderQty > 0) {
                    $fulfillmentStatus = $inStockQty > 0 ? 'partial' : 'backorder';
                }

                $basePrice     = (float) $product->price;
                $isBulkPricing = false;

                if ($product->bulk_pricing && is_array($product->bulk_pricing)) {
                    foreach ($product->bulk_pricing as $tier) {
                        if (isset($tier['min_qty'], $tier['max_qty'], $tier['price'])) {
                            if ($requestedQty >= $tier['min_qty'] && $requestedQty <= $tier['max_qty']) {
                                $basePrice     = (float) $tier['price'];
                                $isBulkPricing = true;
                                break;
                            }
                        }
                    }
                }

                if ($request->order_type === 'bulk') $isBulkPricing = true;

                $unitPrice  = floatval($item['unit_price']      ?? $basePrice);
                $discAmount = floatval($item['discount_amount'] ?? 0);
                $p          = $this->calcPricing($requestedQty, $unitPrice, $discAmount);

                $itemsData[] = [
                    'product'                   => $product,
                    'is_custom_item'            => false,
                    'item_type'                 => 'product',
                    'quantity'                  => $requestedQty,
                    'backorder_quantity'        => $backorderQty,
                    'in_stock_quantity'         => $inStockQty,
                    'fulfillment_status'        => $fulfillmentStatus,
                    'unit_price'                => $unitPrice,
                    'unit_of_measure'           => $item['unit_of_measure']     ?? 'each',
                    
                    'line_total'                => $p['lineTotal'],
                    'line_total_after_discount' => $p['lineAfter'],
                    'discount_amount'           => $discAmount,
                    'is_bulk_pricing'           => $isBulkPricing,
                    'variant_details'           => $item['variant_details'] ?? null,
                    'custom_item_details'       => null,

                    'pricing_notes'             => $item['pricing_notes']       ?? null,
                    'notes'                     => $item['notes']               ?? null,
                    'is_taxable'                => $item['is_taxable']          ?? true,
                    'is_negotiated_price'       => $item['is_negotiated_price'] ?? false,
                    'display_order'             => $item['display_order']       ?? 0,
                ];

                $subtotal += $p['lineAfter'];
            }

            // ── Referral discount (if customer was referred and hasn't ordered yet) ──
            $referralDiscount = 0;
            $referralCodeId   = null;

            if ($customer && $customer->hasReferralDiscount()) {
                $referralCode = $customer->referralCode;
                if ($referralCode && $referralCode->is_valid) {
                    $referralDiscount = $referralCode->calculateDiscount($subtotal);
                    $referralCodeId   = $referralCode->id;
                    $referralCode->recordAttempt();
                }
            }

            // ── Promo code discount ───────────────────────────────────────────────────
            $promoDiscount = 0;
            $promoCodeId   = null;

            if ($request->filled('promo_code')) {
                $promoService = new PromoCodeService();
                $promoResult  = $promoService->validatePromoCode(
                    code:             $request->promo_code,
                    customer:         $customer,
                    orderValue:       $subtotal,
                    referralDiscount: $referralDiscount,
                    exchangeRateToKes: (float) ($request->exchange_rate_to_kes ?? 1.0), 
                );
                if ($promoResult['valid']) {
                    $promoDiscount = $promoResult['discount'];
                    $promoCodeId   = $promoResult['code']->id;
                    $promoResult['code']->recordAttempt();
                }
            }
            $orderDiscount         = floatval($request->discount ?? 0);
            $subtotalAfterDiscount = $subtotal - $orderDiscount - $referralDiscount - $promoDiscount;

            $applyTax              = $request->apply_tax ?? true;
            $tax                   = $applyTax ? ($subtotalAfterDiscount * 0.16) : 0;
            $shippingCost          = $request->has('shipping_cost') && $request->shipping_cost !== null
                                        ? floatval($request->shipping_cost)
                                        : $this->calculateShippingCost($request->delivery_method, $subtotalAfterDiscount);
            $total                 = $subtotalAfterDiscount + $tax + $shippingCost;

            // ── Store credit deduction ────────────────────────────────────────────────
            $exchangeRate            = (float) ($request->exchange_rate_to_kes ?? 1.0);
            $preliminaryTotalKes     = round($total * ($exchangeRate > 0 ? $exchangeRate : 1), 2);
            $creditDeductionKes      = 0;
            $creditDeductionCurrency = 0;

            if ($request->boolean('apply_store_credit') && (float) $customer->store_credit > 0) {
                $requested = (float) ($request->input('store_credit_amount') ?? $customer->store_credit);
                $deduction = app(\App\Services\LoyaltyService::class)->applyStoreCreditToOrder(
                    customer:     $customer,
                    requestedKes: $requested,
                    totalKes:     $preliminaryTotalKes,
                    exchangeRate: $exchangeRate,
                );
                $creditDeductionKes      = $deduction['deduction_kes'];
                $creditDeductionCurrency = $deduction['deduction_order_currency'];
                $total                  -= $creditDeductionCurrency;
            }

            $totalORDQty   = (int) round(collect($request->items)->sum('quantity'));
            $year       = date('Y');
            $placedBy   = $request->user()->id ?? 'ADM';
            $customerId = $customer->id        ?? 'G-U-E-S-T';
            $datePart   = date('dm');

            $attempts = 0;
            do {
                $random      = str_pad(random_int(0, 999), 3, '0', STR_PAD_LEFT);
                $orderNumber = "ORD-{$year}-{$placedBy}-{$customerId}-{$totalORDQty}-{$datePart}{$random}";
                $attempts++;
                if ($attempts > 10) {
                    throw new \Exception('Could not generate unique order number after 10 attempts.');
                }
            } while (Order::withTrashed()->where('order_number', $orderNumber)->exists());

            // ✅ STEP 3: Create order
            $order = Order::create([
                'order_number'             => $orderNumber,
                'customer_id'              => $customer->id,
                'status'                   => 'pending',
                'payment_status'           => $request->payment_status    ?? 'unpaid',
                'payment_reference'        => $request->payment_reference ?? null,
                'payment_method'           => $request->payment_method    ?? 'request_invoice',
                'subtotal'                 => $subtotal,

                'referral_code_id'         => $referralCodeId,
                'referral_discount'        => $referralDiscount,
                'promo_code_id'            => $promoCodeId,
                'promo_discount'           => $promoDiscount,
                'store_credit_deduction'     => $creditDeductionCurrency,  
                'store_credit_deduction_kes' => $creditDeductionKes, 
                'discount'                 => $orderDiscount,

                'currency'                 => $request->currency           ?? 'KES',
                'exchange_rate_to_kes'     => $request->exchange_rate_to_kes ?? 1,
                'tax'                      => $tax,
                'shipping_cost'            => $shippingCost,
                'total'                    => $total,
                'delivery_method'          => $request->delivery_method,
                'shipping_address'         => $request->shipping_address,
                'billing_address'          => $request->billing_address ?? $request->shipping_address,
                'billing_same_as_shipping' => $request->billing_same_as_shipping ?? true,
                'priority'                 => $request->priority   ?? 'medium',
                'order_type'               => $request->order_type ?? 'standard',
                'customer_notes'           => $request->customer_notes ?? null,
                'admin_notes'              => $request->admin_notes    ?? null,
                'placed_by'                => $request->user()->id,
                'billing_schedule'         => $request->billing_schedule   ?? null,
                'project_name'             => $request->project_name       ?? null,
                'service_start_date'       => $request->service_start_date ?? null,
                'service_end_date'         => $request->service_end_date   ?? null,
            ]);

            $order->applyKesSnapshot();
            if ($creditDeductionKes > 0) {
                try {
                    app(\App\Services\LoyaltyService::class)->spendCredit($customer, $creditDeductionKes, $order);
                } catch (\Exception $e) {
                    Log::warning("Store credit spend failed for order {$order->id}: " . $e->getMessage());
                }
            }

            // ── Record promo code usage if applied ────────────────────────────────────
            if ($promoCodeId) {
                $promoService = new PromoCodeService();
                $promoService->recordPromoUsage(
                    \App\Models\ReferralCode::find($promoCodeId),
                    $order->subtotal_kes,                     // ✅ KES revenue
                    $promoDiscount * $order->exchange_rate_to_kes // ✅ KES discount
                );
            }

            // ✅ STEP 4: Create order items
            $this->createOrderItems($order->id, $itemsData, true);
            Log::info('ITEM_DATA_BEFORE_SAVE', [
    'items' => $itemsData
]);


            DB::commit();

            $order->load(['items', 'customer']);

            try {
                $this->mailer->sendOrderCreated($order);
            } catch (\Exception $e) {
                Log::error('Admin order created email failed: ' . $e->getMessage());
            }

            $hasBackorder     = collect($itemsData)->sum('backorder_quantity') > 0;
            $backorderMessage = $hasBackorder ? ' (includes ' . collect($itemsData)->sum('backorder_quantity') . ' item(s) on backorder)' : '';

            return response()->json([
                'message'       => "Order {$orderNumber} created successfully for {$customer->first_name} {$customer->last_name}{$backorderMessage}",
                'order'         => $order,
                'has_backorder' => $hasBackorder,
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Admin order creation failed: ' . $e->getMessage());
            Log::error('Stack trace: ' . $e->getTraceAsString());
            return response()->json(['message' => 'Failed to create order', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * UPDATE EXISTING ORDER (ADMIN)
     * PUT /admin/orders/{id}/edit
     *
     * Allowed when order status is: pending, confirmed, processing, failed
     * AND payment_status is: unpaid or failed
     *
     * Keeps same order_number.
     * Restores stock from old items, deletes them, then rebuilds fresh.
     */
    public function adminUpdateOrder(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'items'                    => 'required|array|min:1',
            'items.*.product_id'       => 'nullable|exists:products,id',
            'items.*.service_id'       => 'nullable|exists:services,id',
            'items.*.item_type'        => 'required|in:product,service,fee,custom_product,custom_service',
            'items.*.is_custom_item'   => 'nullable|boolean',
            'items.*.quantity'         => 'required|numeric|min:0.01',
            'items.*.allow_backorder'  => 'nullable|boolean',
            'delivery_method'          => 'required|in:pickup,standard_delivery,express_delivery,courier',
            'shipping_address'         => 'required|string',
            'billing_address'          => 'nullable|string',
            'billing_same_as_shipping' => 'nullable|boolean',
            'priority'                 => 'nullable|in:low,medium,high,urgent',
            'order_type'               => 'nullable|in:standard,quotation,bulk,b2b,service,mixed,project,subscription',
            'customer_notes'           => 'nullable|string',
            'admin_notes'              => 'nullable|string',
            'payment_method'           => 'nullable|in:request_invoice,pay_on_delivery,mpesa,bank_transfer,credit_card,credit',
            'apply_tax'                => 'nullable|boolean',
            'discount'                 => 'nullable|numeric|min:0',
            'currency'                 => 'nullable|string|max:10',
            'exchange_rate_to_kes'     => 'nullable|numeric',
            'shipping_cost'            => 'nullable|numeric|min:0',
            'billing_schedule'         => 'nullable|in:one_time,milestone_based,monthly,hourly,fixed_price',
            'project_name'             => 'nullable|string',
            'service_start_date'       => 'nullable|date',
            'service_end_date'         => 'nullable|date',
            'customer_id'              => 'nullable|exists:customers,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            $order = Order::with('items.product')->findOrFail($id);

            // ── Guard: only editable in these states ──────────────────────────
            $editableStatuses = ['pending', 'confirmed', 'processing', 'failed'];
            $editablePayments = ['unpaid', 'failed'];

            if (!in_array($order->status, $editableStatuses)) {
                return response()->json([
                    'message'        => "Order cannot be edited in '{$order->status}' status. Only pending, confirmed, processing, or failed orders can be edited.",
                    'current_status' => $order->status,
                ], 400);
            }

            if (!in_array($order->payment_status, $editablePayments)) {
                return response()->json([
                    'message'                => "Order cannot be edited with payment status '{$order->payment_status}'. Only unpaid or failed payment orders can be edited.",
                    'current_payment_status' => $order->payment_status,
                ], 400);
            }

            // ── STEP 1: Validate stock with buffer ────────────────────────────
            foreach ($request->items as $itemData) {
                if (empty($itemData['product_id'])) continue;

                $product      = Product::findOrFail($itemData['product_id']);
                $requestedQty = floatval($itemData['quantity']);
                $currentStock = floatval($product->stock_quantity);

                $existingItem = $order->items->where('product_id', $product->id)->first();
                if ($existingItem) {
                    $currentStock += floatval($existingItem->in_stock_quantity ?? 0);
                }

                $maxAllowed = $currentStock + 200;

                if ($requestedQty > $maxAllowed) {
                    DB::rollBack();
                    return response()->json([
                        'message'       => "Order quantity exceeds maximum allowed for {$product->name}",
                        'product'       => $product->name,
                        'current_stock' => $currentStock,
                        'max_allowed'   => $maxAllowed,
                        'requested'     => $requestedQty,
                    ], 400);
                }
            }

            // ── STEP 2: Restore stock from old items, then delete them ─────────
            foreach ($order->items as $oldItem) {
                if ($oldItem->product && !$oldItem->is_custom_item && ($oldItem->in_stock_quantity ?? 0) > 0) {
                    $oldItem->product->increment('stock_quantity', $oldItem->in_stock_quantity);
                    $oldItem->product->update(['in_stock' => true]);
                }
            }
            $order->items()->delete();

            // ── STEP 3: Build new items data ──────────────────────────────────
            $subtotal  = 0;
            $itemsData = [];

            foreach ($request->items as $item) {

                // ── Custom item ───────────────────────────────────────────────
                if (empty($item['product_id']) && empty($item['service_id'])) {
                    $qty        = floatval($item['quantity']        ?? 1);
                    $unitPrice  = floatval($item['unit_price']      ?? 0);
                    $discAmount = floatval($item['discount_amount'] ?? 0);
                    $p          = $this->calcPricing($qty, $unitPrice, $discAmount);

                    $itemsData[] = [
                        'product'                   => null,
                        'is_custom_item'            => true,
                        'item_type'                 => $item['item_type'],
                        'quantity'                  => $qty,
                        'backorder_quantity'        => 0,
                        'in_stock_quantity'         => 0,
                        'fulfillment_status'        => 'in_stock',
                        'unit_price'                => $unitPrice,
                        'line_total'                => $p['lineTotal'],
                        'line_total_after_discount' => $p['lineAfter'],
                        'discount_amount'           => $discAmount,
                        'is_bulk_pricing'           => false,
                        'description'               => $item['product_name'] ?? $item['description'] ?? '',
                        'service_id'                => null,
                        'service_name'              => null,
                        'service_description'       => null,
                        'service_category'          => null,
                        'unit_of_measure'           => $item['unit_of_measure']     ?? 'each',
                        'pricing_notes'             => $item['pricing_notes']       ?? null,
                        'notes'                     => $item['notes']               ?? null,
                        'is_taxable'                => $item['is_taxable']          ?? true,
                        'is_negotiated_price'       => $item['is_negotiated_price'] ?? false,
                        'requires_site_visit'       => $item['requires_site_visit'] ?? false,
                        'estimated_hours'           => $item['estimated_hours']     ?? null,
                        'hourly_rate'               => $item['hourly_rate']         ?? null,
                        'labor_cost'                => $item['labor_cost']          ?? null,
                        'material_cost'             => $item['material_cost']       ?? null,
                        'display_order'             => $item['display_order']       ?? 0,
                        'variant_details'           => $item['variant_details']     ?? null,
                        'custom_item_details'       => [
                            'name'          => $item['product_name'] ?? $item['description'] ?? null,
                            'unit_price'    => $unitPrice,
                            'item_type'     => $item['item_type'],
                            'notes'         => $item['notes']         ?? null,
                            'pricing_notes' => $item['pricing_notes'] ?? null,
                        ],
                    ];

                    $subtotal += $p['lineAfter'];
                    continue;
                }

                // ── Real service ──────────────────────────────────────────────
                if (!empty($item['service_id']) && empty($item['product_id'])) {
                    $service    = \App\Models\Service::findOrFail($item['service_id']);
                    $qty        = floatval($item['quantity']        ?? 1);
                    $unitPrice  = floatval($item['unit_price']      ?? $service->price ?? 0);
                    $discAmount = floatval($item['discount_amount'] ?? 0);
                    $p          = $this->calcPricing($qty, $unitPrice, $discAmount);

                    $itemsData[] = [
                        'product'                   => null,
                        'is_custom_item'            => false,
                        'item_type'                 => 'service',
                        'quantity'                  => $qty,
                        'backorder_quantity'        => 0,
                        'in_stock_quantity'         => 0,
                        'fulfillment_status'        => 'in_stock',
                        'unit_price'                => $unitPrice,
                        'line_total'                => $p['lineTotal'],
                        'line_total_after_discount' => $p['lineAfter'],
                        'discount_amount'           => $discAmount,
                        'is_bulk_pricing'           => false,
                        'description'               => $item['description']     ?? $service->name,
                        'service_id'                => $service->id,
                        'service_name'              => $service->name,
                        'service_description'       => $service->short_description ?? $service->description ?? null,
                        'service_category'          => optional($service->serviceCategory)->name,
                        'unit_of_measure'           => $item['unit_of_measure']     ?? 'hour',
                        'pricing_notes'             => $item['pricing_notes']       ?? null,
                        'notes'                     => $item['notes']               ?? null,
                        'is_taxable'                => $item['is_taxable']          ?? true,
                        'is_negotiated_price'       => $item['is_negotiated_price'] ?? false,
                        'requires_site_visit'       => $item['requires_site_visit'] ?? false,
                        'estimated_hours'           => $item['estimated_hours']     ?? null,
                        'hourly_rate'               => $item['hourly_rate']         ?? null,
                        'labor_cost'                => $item['labor_cost']          ?? null,
                        'material_cost'             => $item['material_cost']       ?? null,
                        'display_order'             => $item['display_order']       ?? 0,
                        'variant_details'           => $item['variant_details']     ?? null,
                        'custom_item_details'       => null,
                    ];

                    $subtotal += $p['lineAfter'];
                    continue;
                }

                // ── Real product ──────────────────────────────────────────────
                $product      = Product::findOrFail($item['product_id']);
                $requestedQty = floatval($item['quantity']);
                $currentStock = floatval($product->stock_quantity);

                $rawBackorder      = max(0, $requestedQty - $currentStock);
                $backorderQty      = (int) ceil($rawBackorder);
                $inStockQty        = min($requestedQty, $currentStock);
                $fulfillmentStatus = 'in_stock';
                if ($backorderQty > 0) {
                    $fulfillmentStatus = $inStockQty > 0 ? 'partial' : 'backorder';
                }

                $basePrice     = (float) $product->price;
                $isBulkPricing = false;

                if ($product->bulk_pricing && is_array($product->bulk_pricing)) {
                    foreach ($product->bulk_pricing as $tier) {
                        if (isset($tier['min_qty'], $tier['max_qty'], $tier['price'])) {
                            if ($requestedQty >= $tier['min_qty'] && $requestedQty <= $tier['max_qty']) {
                                $basePrice     = (float) $tier['price'];
                                $isBulkPricing = true;
                                break;
                            }
                        }
                    }
                }

                if ($request->order_type === 'bulk') $isBulkPricing = true;

                $unitPrice  = floatval($item['unit_price']      ?? $basePrice);
                $discAmount = floatval($item['discount_amount'] ?? 0);
                $p          = $this->calcPricing($requestedQty, $unitPrice, $discAmount);

                $itemsData[] = [
                    'product'                   => $product,
                    'is_custom_item'            => false,
                    'item_type'                 => 'product',
                    'quantity'                  => $requestedQty,
                    'backorder_quantity'        => $backorderQty,
                    'in_stock_quantity'         => $inStockQty,
                    'fulfillment_status'        => $fulfillmentStatus,
                    'unit_price'                => $unitPrice,
                    'line_total'                => $p['lineTotal'],
                    'line_total_after_discount' => $p['lineAfter'],
                    'discount_amount'           => $discAmount,
                    'is_bulk_pricing'           => $isBulkPricing,
                    'variant_details'           => $item['variant_details']     ?? null,
                    'custom_item_details'       => null,

                    // ── These were missing — now fully populated ──────────────
                    'description'               => $item['description']         ?? $product->name,
                    'service_id'                => null,
                    'service_name'              => null,
                    'service_description'       => null,
                    'service_category'          => null,
                    'unit_of_measure'           => $item['unit_of_measure']     ?? 'each',
                    'pricing_notes'             => $item['pricing_notes']       ?? null,
                    'notes'                     => $item['notes']               ?? null,
                    'is_taxable'                => $item['is_taxable']          ?? true,
                    'is_negotiated_price'       => $item['is_negotiated_price'] ?? false,
                    'requires_site_visit'       => false,
                    'estimated_hours'           => null,
                    'hourly_rate'               => null,
                    'labor_cost'                => null,
                    'material_cost'             => null,
                    'display_order'             => $item['display_order']       ?? 0,
                ];

                $subtotal += $p['lineAfter'];
            }

            // ── STEP 4: Recalculate totals ─────────────────────────────────────
            // Preserve the original referral discount — never recalculate on update
            // hasReferralDiscount() checks total_orders === 0 which may no longer be true
            $referralDiscount = min(
                (float) ($order->referral_discount ?? 0),
                $subtotal  // cap: referral discount can never exceed new subtotal
            );

            $promoDiscount    = min((float) ($order->promo_discount    ?? 0), $subtotal - $referralDiscount);

            $orderDiscount         = floatval($request->discount ?? 0);
            $subtotalAfterDiscount = $subtotal - $orderDiscount - $referralDiscount - $promoDiscount;

            $applyTax              = $request->apply_tax ?? true;
            $tax                   = $applyTax ? ($subtotalAfterDiscount * 0.16) : 0;
            $shippingCost          = $request->has('shipping_cost') && $request->shipping_cost !== null
                                        ? floatval($request->shipping_cost)
                                        : $this->calculateShippingCost($request->delivery_method, $subtotalAfterDiscount);
            $total                 = $subtotalAfterDiscount + $tax + $shippingCost;
            // Carry forward existing store credit deduction
            $existingCreditDeduction    = (float) ($order->store_credit_deduction     ?? 0);
            $existingCreditDeductionKes = (float) ($order->store_credit_deduction_kes ?? 0);
            $total -= $existingCreditDeduction;

            // ── STEP 5: Update order ───────────────────────────────────────────
            $order->update([
                'customer_id'              => $request->customer_id          ?? $order->customer_id,
                'subtotal'                 => $subtotal,
                'referral_code_id'         => $order->referral_code_id,
                'referral_discount'        => $referralDiscount,
                'promo_code_id'            => $order->promo_code_id,
                'promo_discount'           => $promoDiscount,
                'store_credit_deduction'     => $existingCreditDeduction,
                'store_credit_deduction_kes' => $existingCreditDeductionKes,
                'discount'                 => $orderDiscount,
                'currency'                 => $request->currency             ?? $order->currency,
                'exchange_rate_to_kes'     => $request->exchange_rate_to_kes ?? $order->exchange_rate_to_kes,
                'tax'                      => $tax,
                'shipping_cost'            => $shippingCost,
                'total'                    => $total,
                'delivery_method'          => $request->delivery_method,
                'shipping_address'         => $request->shipping_address,
                'billing_address'          => $request->billing_same_as_shipping
                                                ? $request->shipping_address
                                                : ($request->billing_address ?? $request->shipping_address),
                'billing_same_as_shipping' => $request->billing_same_as_shipping ?? true,
                'priority'                 => $request->priority             ?? $order->priority,
                'order_type'               => $request->order_type           ?? $order->order_type,
                'payment_method'           => $request->payment_method       ?? $order->payment_method,
                'customer_notes'           => $request->customer_notes       ?? $order->customer_notes,
                'admin_notes'              => $request->admin_notes
                                                ? (($order->admin_notes ? $order->admin_notes . "\n\n" : '') . '[EDITED BY ADMIN on ' . now()->format('Y-m-d H:i:s') . "]\n" . $request->admin_notes)
                                                : (($order->admin_notes ? $order->admin_notes . "\n\n" : '') . '[EDITED BY ADMIN on ' . now()->format('Y-m-d H:i:s') . ']'),
                'billing_schedule'         => $request->billing_schedule     ?? $order->billing_schedule,
                'project_name'             => $request->project_name         ?? $order->project_name,
                'service_start_date'       => $request->service_start_date   ?? $order->service_start_date,
                'service_end_date'         => $request->service_end_date     ?? $order->service_end_date,
            ]);

            $order->applyKesSnapshot();

            // ── STEP 6: Create new order items ─────────────────────────────────
            $this->createOrderItems($order->id, $itemsData, true);

            // ✅ STEP 7: Recalculate customer statistics after order edit
            // Recalculate stats for any affected customers
            $affectedCustomerIds = array_unique(array_filter([
                $order->getOriginal('customer_id'),
                $order->customer_id,
            ]));

            foreach ($affectedCustomerIds as $cid) {
                $affected = \App\Models\Customer::find($cid);
                $affected?->recalculateStatistics();
            }

            DB::commit();

            $order->load(['items', 'customer']);
            $hasBackorder     = collect($itemsData)->sum('backorder_quantity') > 0;
            $backorderMessage = $hasBackorder
                ? ' (includes ' . collect($itemsData)->sum('backorder_quantity') . ' item(s) on backorder)'
                : '';

            return response()->json([
                'message'       => "Order {$order->order_number} updated successfully{$backorderMessage}",
                'order'         => $order,
                'has_backorder' => $hasBackorder,
            ], 200);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Admin order update failed: ' . $e->getMessage());
            Log::error('Stack trace: ' . $e->getTraceAsString());
            return response()->json(['message' => 'Failed to update order', 'error' => $e->getMessage()], 500);
        }
    }

    public function updateStatus(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'status'      => 'required|in:pending,confirmed,processing,ready_for_pickup,shipped,delivered,cancelled,failed',
            'admin_notes' => 'nullable|string',
        ]);
        if ($validator->fails()) return response()->json(['errors' => $validator->errors()], 422);

        $order = Order::findOrFail($id);
        $order->update(['status' => $request->status, 'admin_notes' => $request->admin_notes ?? $order->admin_notes]);

        if ($request->status === 'confirmed' && !$order->confirmed_at) $order->update(['confirmed_at' => now()]);
        if ($request->status === 'delivered' && !$order->delivered_at) $order->update(['delivered_at' => now()]);
        if ($request->status === 'cancelled' && !$order->cancelled_at) {
            $order->update(['cancelled_at' => now(), 'cancellation_reason' => $request->cancellation_reason ?? 'Cancelled by admin']);
        }

        return response()->json(['message' => 'Order status updated successfully', 'order' => $order->fresh()], 200);
    }

    public function confirm(Request $request, $id)
    {
        $order = Order::findOrFail($id);
        if ($order->status !== 'pending') return response()->json(['message' => 'Only pending orders can be confirmed'], 400);
        $order->markAsConfirmed($request->user());

        try {
            $this->mailer->sendOrderConfirmed($order->load('customer'));
        } catch (\Exception $e) {
            Log::error('Order confirmed email failed: ' . $e->getMessage());
        }

        // ── Complete referral if this is the customer's first order ──
        if ($order->referral_code_id) {
            $usage = \App\Models\ReferralCodeUsage::where('referral_code_id', $order->referral_code_id)
                ->where('customer_id', $order->customer_id)
                ->where('status', 'pending')
                ->first();

            if ($usage) {
                $usage->complete($order); // triggers processReferrerReward() → KES 500 store credit
                // Update referral code success stats
                $referralCode = $order->referralCode;
                if ($referralCode) {
                    $referralCode->recordSuccess($order->referral_discount, $order->subtotal_kes);
                }
            }
        }

        // ── Update customer order stats → triggers loyalty + tier checks ──────
        $customer = $order->customer;
        if ($customer) {
            $customer->recalculateStatistics();
            // updateOrderStatistics() calls checkTierUpgrade() → triggerVipPromoIfEligible()
            // and triggerLoyaltyPromoIfEligible() — both wired in Customer model
        }
        
        return response()->json(['message' => 'Order confirmed successfully', 'order' => $order->fresh()], 200);
    }

    public function ship(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'tracking_number'         => 'required|string',
            'courier_company'         => 'required|string',
            'estimated_delivery_date' => 'nullable|date',
        ]);
        if ($validator->fails()) return response()->json(['errors' => $validator->errors()], 422);

        $order = Order::findOrFail($id);
        $order->update([
            'status'                   => 'shipped',
            'shipped_at'               => now(),
            'tracking_number'          => $request->tracking_number,
            'courier_company'          => $request->courier_company,
            'estimated_delivery_date'  => $request->estimated_delivery_date,
        ]);

        try {
            $this->mailer->sendOrderShipped($order->fresh(['customer']));
        } catch (\Exception $e) {
            Log::error('Order shipped email failed: ' . $e->getMessage());
        }

        return response()->json(['message' => 'Order marked as shipped', 'order' => $order->fresh()], 200);
    }

    public function deliver(Request $request, $id)
    {
        $order = Order::findOrFail($id);
        $order->markAsDelivered();
        return response()->json(['message' => 'Order marked as delivered', 'order' => $order->fresh()], 200);
    }

    public function generateInvoice(Request $request, $id)
    {
        $order = Order::with(['items.product', 'customer'])->findOrFail($id);
        if ($order->invoice_number) return response()->json(['message' => 'Invoice already generated', 'invoice_number' => $order->invoice_number], 200);
        $invoiceNumber = $order->generateInvoiceNumber();
        return response()->json(['message' => 'Invoice generated successfully', 'invoice_number' => $invoiceNumber, 'order' => $order->fresh()], 200);
    }

    public function updatePaymentStatus(Request $request, $id)  
    {  
        $validator = Validator::make($request->all(), [  
            'payment_status'    => 'required|in:unpaid,partially_paid,paid,refunded,failed',  
            'payment_reference' => 'nullable|string',  
            'amount_paid'       => 'nullable|numeric|min:0|required_if:payment_status,partially_paid',  
            'payment_method'    => 'nullable|in:mpesa,bank_transfer,cod,credit|required_if:payment_status,paid,partially_paid',  
        ]);  
        if ($validator->fails()) return response()->json(['errors' => $validator->errors()], 422);  
    
        $order = Order::findOrFail($id);  
    
        // If setting to paid or partially_paid, create a payment record  
        if (in_array($request->payment_status, ['paid', 'partially_paid'])) {  
            DB::beginTransaction();  
            try {  
                $snapshot = \App\Models\Payment::buildSnapshot($order);  
                $paymentNumber = \App\Models\Payment::generatePaymentNumber($order->id);  
                
                // For paid status, amount is the full order total  
                $amount = $request->payment_status === 'paid'   
                    ? $snapshot['snapshot_total_kes']   
                    : $request->amount_paid;  
                
                $payment = \App\Models\Payment::create([  
                    'order_id'                    => $order->id,  
                    'customer_id'                 => $order->customer_id,  
                    'initiated_by'                => $request->user()->id,  
                    'payment_number'              => $paymentNumber,  
                    'method'                      => $request->payment_method,  
                    'status'                      => 'confirmed', // Manual payments are auto-confirmed  
                    'currency'                    => $order->currency ?? 'KES',  
                    'exchange_rate_to_kes'        => $order->exchange_rate_to_kes ?? 1,  
                    'amount_expected'             => $amount,  
                    'amount_received'             => $amount,  
                    'mpesa_amount_confirmed'      => $amount,  
                    'mpesa_receipt_number'        => $request->payment_reference,  
                    'mpesa_transaction_date'      => now(),  
                    'is_partial'                  => $request->payment_status === 'partially_paid',  
                    ...$snapshot,  
                    'notes'                       => 'Manual payment recorded via admin panel',  
                    'initiated_at'                => now(),  
                    'confirmed_at'                => now(),  
                ]);  
    
                // Update order payment_reference and payment_method  
                $order->update([  
                    'payment_reference' => $request->payment_reference,  
                    'payment_method' => $request->payment_method === 'credit' ? 'credit' :   
                                    ($request->payment_method === 'cod' ? 'pay_on_delivery' : $request->payment_method),  
                ]);  
    
                // Sync order payment status based on all confirmed payments  
                $payment->syncOrderPaymentStatus();  
                
                DB::commit();  
                return response()->json(['message' => 'Payment status updated', 'order' => $order->fresh(), 'payment' => $payment], 200);  
            } catch (\Exception $e) {  
                DB::rollBack();  
                Log::error('Manual payment creation failed: ' . $e->getMessage());  
                return response()->json(['message' => 'Failed to record payment', 'error' => $e->getMessage()], 500);  
            }  
        }  
    
        // For other statuses (unpaid, refunded, failed), update directly  
        $order->update([  
            'payment_status'    => $request->payment_status,  
            'payment_reference' => $request->payment_reference ?? $order->payment_reference,  
        ]);  
        
        return response()->json(['message' => 'Payment status updated', 'order' => $order->fresh()], 200);  
    }

    public function adminCancel(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'cancellation_reason'                  => 'required|string|max:1000',
            'refund_items'                         => 'nullable|array',
            'refund_items.*.order_item_id'         => 'required|exists:order_items,id',
            'refund_items.*.refund_amount'         => 'required|numeric|min:0',
            'refund_items.*.quantity_returned'     => 'nullable|numeric|min:0|decimal:0,5',
            'refund_items.*.return_status'         => 'required|in:requested,approved,rejected,completed',
            'returnless_refund'                    => 'nullable|boolean',
        ]);
        if ($validator->fails()) return response()->json(['errors' => $validator->errors()], 422);

        DB::beginTransaction();
        try {
            $order           = Order::with('items')->findOrFail($id);
            $requiresRefund  = in_array($order->payment_status, ['paid', 'partially_paid']);
            $requiresReturn  = in_array($order->status, ['delivered', 'shipped']);
            $returnlessRefund = $request->input('returnless_refund', false);

            if (!$requiresRefund && !$requiresReturn) {
                foreach ($order->items as $item) {
                    if ($item->product && $item->in_stock_quantity > 0) {
                        $item->product->increment('stock_quantity', $item->in_stock_quantity);
                        $item->product->update(['in_stock' => true]);
                    }
                }
                $order->update(['status' => 'cancelled', 'cancelled_at' => now(), 'cancellation_reason' => $request->cancellation_reason]);

            } elseif ($requiresRefund && !$requiresReturn) {  
            // Calculate actual amount paid from payments table  
            $totalConfirmedPayments = $order->getTotalConfirmedPayments();  
            $totalOrderKes = (float) ($order->total_kes ?? $order->total ?? 0);  
            
            // Cap refund to actual amount paid  
            $maxRefundable = min($totalOrderKes, $totalConfirmedPayments);  
            
            // Calculate proportional refund per item  
            foreach ($order->items as $item) {  
                if ($item->product && $item->in_stock_quantity > 0) {  
                    $item->product->increment('stock_quantity', $item->in_stock_quantity);  
                    $item->product->update(['in_stock' => true]);  
                }  
                
                // Calculate proportional refund based on item's share of total  
                $itemShare = $totalOrderKes > 0 ? ($item->line_total_after_discount / $totalOrderKes) : 0;  
                $refundAmount = round($maxRefundable * $itemShare, 2);  
                
                $item->update(['refund_amount' => $refundAmount, 'return_status' => 'completed']);  
            }  
            $order->update(['status' => 'cancelled', 'cancelled_at' => now(), 'cancellation_reason' => $request->cancellation_reason, 'payment_status' => 'refunded']);
            
            } elseif ($requiresReturn) {
                if ($request->has('refund_items')) {
                    foreach ($request->refund_items as $refundItem) {
                        $orderItem    = OrderItem::findOrFail($refundItem['order_item_id']);
                        $actualReturn = $refundItem['quantity_returned'];
                        if ($actualReturn > $orderItem->quantity) {
                            DB::rollBack();
                            return response()->json(['message' => "Cannot return more than ordered for {$orderItem->product_name}."], 400);
                        }
                        $orderItem->update(['refund_amount' => $refundItem['refund_amount'], 'quantity_returned' => $actualReturn, 'return_status' => $refundItem['return_status']]);
                        if (in_array($refundItem['return_status'], ['approved', 'completed']) && $actualReturn > 0 && $orderItem->product) {
                            $orderItem->product->increment('stock_quantity', $actualReturn);
                            $orderItem->product->update(['in_stock' => true]);
                        }
                    }
                }
                if ($returnlessRefund) {
                    foreach ($order->items as $item) {
                        $item->update(['refund_amount' => $item->line_total_after_discount, 'quantity_returned' => 0, 'return_status' => 'completed']);
                    }
                }
                $order->update(['status' => 'cancelled', 'cancelled_at' => now(), 'cancellation_reason' => $request->cancellation_reason, 'payment_status' => 'refunded']);
            }

            $this->refundOrderStoreCredit($order);
            DB::commit();

            try {
                $this->mailer->sendOrderCancelled($order->fresh(['items.product', 'customer']));
            } catch (\Exception $e) {
                Log::error('Admin cancel email failed: ' . $e->getMessage());
            }

            return response()->json(['message' => 'Order cancelled successfully', 'order' => $order->fresh('items.product', 'customer'), 'requires_refund' => $requiresRefund, 'requires_return' => $requiresReturn], 200);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Admin cancel order failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to cancel order', 'error' => $e->getMessage()], 500);
        }
    }

    public function restoreOrder(Request $request, $id)
    {
        $validator = Validator::make($request->all(), ['restore_reason' => 'nullable|string|max:1000']);
        if ($validator->fails()) return response()->json(['errors' => $validator->errors()], 422);

        DB::beginTransaction();
        try {
            $order = Order::with('items')->findOrFail($id);
            if ($order->status !== 'cancelled') return response()->json(['message' => 'Only cancelled orders can be restored'], 400);

            $hadRefund = false;

            foreach ($order->items as $item) {
                // Reset any refund data
                if ($item->refund_amount > 0 || $item->quantity_returned > 0 || $item->return_status !== 'none') {
                    $hadRefund = true;

                    // If stock was physically returned (approved/completed), re-reserve it
                    if (
                        in_array($item->return_status, ['approved', 'completed']) &&
                        $item->quantity_returned > 0 &&
                        $item->product
                    ) {
                        if ($item->product->stock_quantity < $item->quantity_returned) {
                            DB::rollBack();
                            return response()->json([
                                'message' => "Insufficient stock to restore. {$item->product_name} needs {$item->quantity_returned} but only {$item->product->stock_quantity} available.",
                            ], 400);
                        }
                        $item->product->decrement('stock_quantity', $item->quantity_returned);
                        if ($item->product->stock_quantity <= 0) $item->product->update(['in_stock' => false]);
                    }

                    $item->update([
                        'refund_amount'     => 0,
                        'quantity_returned' => 0,
                        'return_status'     => 'none',
                    ]);
                }

                // Re-reserve stock for non-custom product items that were in stock
                if (!$item->is_custom_item && $item->product && $item->in_stock_quantity > 0) {
                    if ($item->product->stock_quantity < $item->in_stock_quantity) {
                        DB::rollBack();
                        return response()->json([
                            'message' => "Insufficient stock to restore. {$item->product_name} needs {$item->in_stock_quantity} but only {$item->product->stock_quantity} available.",
                        ], 400);
                    }
                    $item->product->decrement('stock_quantity', $item->in_stock_quantity);
                    if ($item->product->stock_quantity <= 0) $item->product->update(['in_stock' => false]);
                }
            }

            // Restore to the last meaningful pre-cancel status using timestamps
            // Never restore to delivered — that requires actual delivery confirmation
            $newStatus = 'pending';
            if ($order->confirmed_at) {
                $newStatus = 'confirmed';
            }

            // Always reset payment to unpaid — a refund was issued or payment needs reconfirmation
            // A new payment reference must be provided before marking paid again
            $order->update([
                'status'              => $newStatus,
                'payment_status'      => 'unpaid',
                'payment_reference'   => null,
                'paid_at'             => null,
                'cancelled_at'        => null,
                'cancellation_reason' => null,
                'admin_notes'         => ($order->admin_notes ? $order->admin_notes . "\n\n" : '')
                    . 'Order restored on ' . now()->format('Y-m-d H:i:s')
                    . ($request->restore_reason ? ': ' . $request->restore_reason : '')
                    . ($hadRefund ? ' [Payment reset to unpaid — new payment required]' : ''),
            ]);

            $this->rechargeOrderStoreCredit($order);
            DB::commit();
            return response()->json([
                'message'         => 'Order restored successfully. Payment has been reset — a new payment is required.',
                'order'           => $order->fresh('items.product', 'customer'),
                'had_refund'      => $hadRefund,
                'restored_status' => $newStatus,
                'payment_status'  => 'unpaid',
            ], 200);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Restore order failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to restore order', 'error' => $e->getMessage()], 500);
        }
    }

    public function bulkCancel(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'order_ids'           => 'required|array|min:1',
            'order_ids.*'         => 'required|exists:orders,id',
            'cancellation_reason' => 'required|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();

        try {
            $successCount = 0;
            $failedOrders = [];

            $orders = Order::with('items.product')
                ->whereIn('id', $request->order_ids)
                ->get();

            foreach ($orders as $order) {
                try {
                    if (!in_array($order->status, ['pending', 'confirmed', 'processing'])) {
                        $failedOrders[] = [
                            'order_number' => $order->order_number,
                            'reason'       => 'Only pending, confirmed, or processing orders can be bulk cancelled.',
                        ];
                        continue;
                    }

                    if ($order->payment_status !== 'unpaid') {
                        $failedOrders[] = [
                            'order_number' => $order->order_number,
                            'reason'       => 'Only unpaid orders can be bulk cancelled.',
                        ];
                        continue;
                    }

                    foreach ($order->items as $item) {
                        if ($item->product) {
                            $inStockQty = round((float) ($item->in_stock_quantity ?? 0), 4);

                            if ($inStockQty > 0) {
                                $newStock = round((float) $item->product->stock_quantity + $inStockQty, 4);

                                $item->product->update([
                                    'stock_quantity' => $newStock,
                                    'in_stock'       => $newStock > 0,
                                ]);
                            }
                        }
                    }

                    $order->update([
                        'status'              => 'cancelled',
                        'cancelled_at'        => now(),
                        'cancellation_reason' => $request->cancellation_reason,
                        'admin_notes'         => ($order->admin_notes ? $order->admin_notes . "\n\n" : '')
                            . 'Bulk cancelled on ' . now()->format('Y-m-d H:i:s')
                            . ': ' . $request->cancellation_reason,
                    ]);

                    $this->refundOrderStoreCredit($order);
                    $successCount++;
                } catch (\Exception $e) {
                    $failedOrders[] = [
                        'order_number' => $order->order_number,
                        'reason'       => $e->getMessage(),
                    ];
                }
            }

            DB::commit();

            return response()->json([
                'message'       => "Successfully cancelled {$successCount} order(s)",
                'success_count' => $successCount,
                'failed_orders' => $failedOrders,
            ], 200);

        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Failed to cancel orders',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    public function refundPreview(Request $request, $id)
    {
        $order = Order::with('items')->findOrFail($id);

        $requiresRefund = in_array($order->payment_status, ['paid', 'partially_paid']);
        $requiresReturn = in_array($order->status, ['delivered', 'shipped']) && $requiresRefund;

        $items = $order->items->map(function ($item) use ($requiresReturn) {
            $quantity = round((float) ($item->quantity ?? 0), 4);
            $quantityReturned = round((float) ($item->quantity_returned ?? 0), 4);

            return [
                'id'                      => $item->id,
                'product_name'            => $item->product_name,
                'product_sku'             => $item->product_sku,
                'quantity'                => $quantity,
                'quantity_returned'       => $quantityReturned,
                'max_returnable'          => max(0, round($quantity - $quantityReturned, 4)),
                'unit_price'              => (float) ($item->unit_price ?? 0),
                'line_total'              => (float) ($item->line_total_after_discount ?? 0),
                'current_refund_amount'   => (float) ($item->refund_amount ?? 0),
                'suggested_refund_amount' => $requiresReturn ? 0 : (float) ($item->line_total_after_discount ?? 0),
                'return_status'           => $item->return_status,
            ];
        });

        return response()->json([
            'order_number'    => $order->order_number,
            'status'          => $order->status,
            'payment_status'  => $order->payment_status,
            'total'           => (float) ($order->total ?? 0),
            'requires_refund' => $requiresRefund,
            'requires_return' => $requiresReturn,
            'items'           => $items,
        ], 200);
    }

    public function bulkRestore(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'order_ids'      => 'required|array|min:1',
            'order_ids.*'    => 'required|exists:orders,id',
            'restore_reason' => 'nullable|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();

        try {
            $successCount = 0;
            $failedOrders = [];

            $orders = Order::with('items.product')
                ->whereIn('id', $request->order_ids)
                ->where('status', 'cancelled')
                ->get();

            foreach ($orders as $order) {
                try {
                    if ($order->payment_status !== 'unpaid') {
                        $failedOrders[] = [
                            'order_number' => $order->order_number,
                            'reason'       => 'Only unpaid cancelled orders can be bulk restored.',
                        ];
                        continue;
                    }

                    foreach ($order->items as $item) {
                        if ($item->product) {
                            $inStockQty = round((float) ($item->in_stock_quantity ?? 0), 4);
                            $currentStock = round((float) ($item->product->stock_quantity ?? 0), 4);

                            if ($inStockQty > 0) {
                                if ($currentStock < $inStockQty) {
                                    throw new \Exception("Insufficient stock for {$item->product_name}");
                                }

                                $newStock = round($currentStock - $inStockQty, 4);

                                $item->product->update([
                                    'stock_quantity' => $newStock,
                                    'in_stock'       => $newStock > 0,
                                ]);
                            }
                        }

                        if (
                            (float) ($item->refund_amount ?? 0) > 0 ||
                            (float) ($item->quantity_returned ?? 0) > 0 ||
                            $item->return_status !== 'none'
                        ) {
                            $item->update([
                                'refund_amount'     => 0.00,
                                'quantity_returned' => 0.0000,
                                'return_status'     => 'none',
                            ]);
                        }
                    }

                    $order->update([
                        'status'              => 'pending',
                        'cancelled_at'        => null,
                        'cancellation_reason' => null,
                        'admin_notes'         => ($order->admin_notes ? $order->admin_notes . "\n\n" : '')
                            . 'Bulk restored on ' . now()->format('Y-m-d H:i:s')
                            . ($request->restore_reason ? ': ' . $request->restore_reason : ''),
                    ]);

                    try {
                        $this->mailer->sendOrderCancelled($order->fresh(['items.product', 'customer']));
                    } catch (\Exception $e) {
                        Log::error("Bulk cancel email failed for {$order->order_number}: " . $e->getMessage());
                    }

                    $this->rechargeOrderStoreCredit($order);
                    $successCount++;
                } catch (\Exception $e) {
                    $failedOrders[] = [
                        'order_number' => $order->order_number,
                        'reason'       => $e->getMessage(),
                    ];
                }
            }

            DB::commit();

            return response()->json([
                'message'       => "Successfully restored {$successCount} order(s)",
                'success_count' => $successCount,
                'failed_orders' => $failedOrders,
            ], 200);

        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Failed to restore orders',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    private function calculateNetTotal($order)
    {
        $totalRefunded = $order->items->sum('refund_amount');
        return [
            'original_total' => $order->total,
            'total_refunded' => $totalRefunded,
            'net_total'      => max(0, $order->total - $totalRefunded),
        ];
    }

    public function getNetTotal(Request $request, $id)
    {
        $order     = Order::with('items')->findOrFail($id);
        $netTotals = $this->calculateNetTotal($order);
        return response()->json(['order_number' => $order->order_number, 'status' => $order->status, 'payment_status' => $order->payment_status, ...$netTotals], 200);
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

    // ========================================
    // SHARED ORDER ITEM CREATION
    // ========================================

    /**
     * Create order items from prepared $itemsData array.
     * @param  int   $orderId
     * @param  array $itemsData
     * @param  bool  $incrementPurchaseCount  true for admin/customer-update, false for guest store
     */
    private function createOrderItems(int $orderId, array $itemsData, bool $incrementPurchaseCount = false): void
    {
        foreach ($itemsData as $itemData) {
            $isCustom   = $itemData['is_custom_item'] ?? false;
            $product    = $itemData['product'];
            $reservedAt = !$isCustom && ($itemData['in_stock_quantity'] ?? 0) > 0 ? now() : null;

            OrderItem::create([
                'order_id'                  => $orderId,
                'is_custom_item'            => $isCustom,
                'item_type'                 => $itemData['item_type']     ?? 'product',
                'product_id'                => $product?->id,
                'product_name'              => $product?->name
                                                ?? $itemData['service_name']
                                                ?? $itemData['description']
                                                ?? 'Custom Item',
                'product_sku'               => $product?->sku,
                'brand_name'                => optional($product?->brand)->name,
                'product_image'             => $product?->main_image,
                'service_id'                => $itemData['service_id']          ?? null,
                'service_name'              => $itemData['service_name']        ?? null,
                'service_description'       => $itemData['service_description'] ?? null,
                'service_category'          => $itemData['service_category']    ?? null,
                'description'               => $itemData['description']         ?? null,
                'quantity'                  => $itemData['quantity'],
                'unit_of_measure'           => $itemData['unit_of_measure']     ?? 'each',
                'backorder_quantity'        => $itemData['backorder_quantity'],
                'in_stock_quantity'         => $itemData['in_stock_quantity'],
                'fulfillment_status'        => $itemData['fulfillment_status'],
                'unit_price'                => $itemData['unit_price'],
                'line_total'                => $itemData['line_total'],
                'discount_amount'           => $itemData['discount_amount']     ?? 0,
                'line_total_after_discount' => $itemData['line_total_after_discount'] ?? $itemData['line_total'],
                'is_bulk_pricing'           => $itemData['is_bulk_pricing']     ?? false,
                'is_taxable'                => $itemData['is_taxable']          ?? true,
                'is_negotiated_price'       => $itemData['is_negotiated_price'] ?? false,
                'requires_site_visit'       => $itemData['requires_site_visit'] ?? false,
                'pricing_notes'             => $itemData['pricing_notes']       ?? null,
                'notes'                     => $itemData['notes']               ?? null,
                'estimated_hours'           => $itemData['estimated_hours']     ?? null,
                'hourly_rate'               => $itemData['hourly_rate']         ?? null,
                'labor_cost'                => $itemData['labor_cost']          ?? null,
                'material_cost'             => $itemData['material_cost']       ?? null,
                'display_order'             => $itemData['display_order']       ?? 0,
                'variant_details'           => $itemData['variant_details']     ?? null,
                'custom_item_details'       => $itemData['custom_item_details'] ?? null,
                'stock_status'              => $isCustom
                                                ? 'in_stock'
                                                : (($itemData['in_stock_quantity'] ?? 0) > 0 ? 'reserved' : 'out_of_stock'),
                'reserved_at'               => $reservedAt,
            ]);

            if (!$isCustom && $product) {
                if (($itemData['in_stock_quantity'] ?? 0) > 0) {
                    $product->decrement('stock_quantity', $itemData['in_stock_quantity']);
                    if ($product->stock_quantity <= 0) $product->update(['in_stock' => false]);
                }
                if ($incrementPurchaseCount) {
                    $product->increment('purchase_count', $itemData['quantity']);
                }
            }
        }
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    private function calculateShippingCost(string $deliveryMethod, float $subtotal): float
    {
        if ($subtotal >= 50000) return 0;

        return match($deliveryMethod) {
            'pickup'            => 0,
            'standard_delivery' => 500,
            'express_delivery'  => 1500,
            'courier'           => 2000,
            default             => 500,
        };
    }
    private function refundOrderStoreCredit(Order $order): void
    {
        $deductionKes = (float) ($order->store_credit_deduction_kes ?? 0);
        if ($deductionKes <= 0) return;
        if (!$order->customer) return;

        try {
            app(\App\Services\LoyaltyService::class)->grantRefundCredit(
                $order->customer, $deductionKes, $order
            );
        } catch (\Exception $e) {
            Log::warning("Store credit refund failed for order {$order->id}: " . $e->getMessage());
        }
    }

    private function rechargeOrderStoreCredit(Order $order): void
    {
        $deductionKes      = (float) ($order->store_credit_deduction_kes ?? 0);
        $deductionCurrency = (float) ($order->store_credit_deduction     ?? 0);
        if ($deductionKes <= 0) return;

        $customer = $order->customer;
        if (!$customer) return;

        if ((float) $customer->store_credit < $deductionKes) {
            // Customer spent the refunded credit elsewhere — zero out deduction,
            // add it back to the order total so it's not discounted for free
            $order->update([
                'store_credit_deduction'     => 0,
                'store_credit_deduction_kes' => 0,
                'total'                      => round((float) $order->total + $deductionCurrency, 2),
            ]);
            $order->applyKesSnapshot();
            Log::info("Order {$order->id} restored without store credit — customer balance insufficient.");
            return;
        }

        try {
            app(\App\Services\LoyaltyService::class)->spendCredit($customer, $deductionKes, $order);
        } catch (\Exception $e) {
            Log::warning("Store credit re-spend failed for order {$order->id}: " . $e->getMessage());
        }
    }
}