<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Hamper;
use App\Models\HamperOrder;
use App\Models\ShippingOption;
use App\Models\StoreCreditTransaction;
use App\Models\PromoCode;
use App\Services\HamperEligibilityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class HamperCheckoutController extends Controller
{
    public function __construct(private HamperEligibilityService $eligibility) {}

    /**
     * GET /hampers/{slug}/checkout
     * Load checkout data for this customer + hamper.
     */
    public function load($slug): JsonResponse
    {
        [$customer, $hamper, $error] = $this->resolveAndGate($slug);
        if ($error) return $error;

        // shipping options from shipping_options table
        $shippingOptions = ShippingOption::active()->get(['id', 'name', 'description', 'cost', 'free_above', 'icon']);

        // store credit balance
        $creditBalance = $hamper->allow_store_credit
            ? (float) ($customer->store_credit_balance ?? 0)
            : 0;

        return response()->json([
            'hamper'           => $hamper->load('items'),
            'shipping_options' => $shippingOptions,
            'store_credit'     => [
                'allowed' => $hamper->allow_store_credit,
                'balance' => $creditBalance,
            ],
            'promo_allowed'    => $hamper->allow_promo_codes,
            'apply_vat'        => $hamper->apply_vat,
            'accent_color'     => $hamper->accent_color,
            'customer'         => [
                'name'      => $customer->name,
                'email'     => $customer->email,
                'addresses' => $customer->addresses ?? [],
            ],
        ]);
    }

    /**
     * POST /hampers/{slug}/checkout/validate-promo
     * Validate a promo code against this hamper.
     */
    public function validatePromo(Request $request, $slug): JsonResponse
    {
        [$customer, $hamper, $error] = $this->resolveAndGate($slug);
        if ($error) return $error;

        if (!$hamper->allow_promo_codes) {
            return response()->json(['message' => 'Promo codes are not allowed on this hamper'], 422);
        }

        $request->validate(['code' => 'required|string']);

        $promo = PromoCode::where('code', strtoupper($request->code))
            ->where('is_active', true)
            ->first();

        if (!$promo) {
            return response()->json(['message' => 'Invalid or expired promo code'], 422);
        }

        // check promo validity dates
        if ($promo->starts_at && now()->lt($promo->starts_at)) {
            return response()->json(['message' => 'This promo code is not yet active'], 422);
        }
        if ($promo->expires_at && now()->gt($promo->expires_at)) {
            return response()->json(['message' => 'This promo code has expired'], 422);
        }

        // check usage limit
        if ($promo->max_uses && $promo->used_count >= $promo->max_uses) {
            return response()->json(['message' => 'This promo code has reached its usage limit'], 422);
        }

        // check per-customer usage on hamper_orders
        if ($promo->max_uses_per_customer) {
            $customerUses = HamperOrder::where('customer_id', $customer->id)
                ->where('promo_code_id', $promo->id)
                ->whereNotIn('status', ['cancelled', 'refunded'])
                ->count();

            if ($customerUses >= $promo->max_uses_per_customer) {
                return response()->json(['message' => 'You have already used this promo code the maximum number of times'], 422);
            }
        }

        $discount = $this->calculatePromoDiscount($promo, (float) $hamper->price);

        return response()->json([
            'valid'         => true,
            'promo_code_id' => $promo->id,
            'code'          => $promo->code,
            'type'          => $promo->type,
            'discount'      => $discount,
            'description'   => $promo->description,
        ]);
    }

    /**
     * POST /hampers/{slug}/checkout/place-order
     */
    public function placeOrder(Request $request, $slug): JsonResponse
    {
        [$customer, $hamper, $error] = $this->resolveAndGate($slug);
        if ($error) return $error;

        $request->validate([
            'shipping_option_id' => 'required|exists:shipping_options,id',
            'shipping_address'   => 'required|array',
            'shipping_address.line1'   => 'required|string',
            'shipping_address.city'    => 'required|string',
            'shipping_address.country' => 'required|string',
            'promo_code'         => 'nullable|string',
            'store_credit_amount'=> 'nullable|numeric|min:0',
            'notes'              => 'nullable|string',
        ]);

        // re-check purchase limit
        $purchaseCount = $hamper->purchaseCountForCustomer($customer->id);
        if ($hamper->max_purchases_per_customer !== null && $purchaseCount >= $hamper->max_purchases_per_customer) {
            return response()->json(['message' => 'You have reached the purchase limit for this hamper'], 422);
        }

        // re-check stock (allow backorder up to 100 units over)
        if ($hamper->total_stock !== null) {
            $totalOrders = $hamper->orders()->whereNotIn('status', ['cancelled', 'refunded'])->count();
            if ($totalOrders >= ($hamper->total_stock + 100)) {
                return response()->json(['message' => 'This hamper is no longer available'], 422);
            }
        }

        // shipping cost
        $shippingOption = ShippingOption::findOrFail($request->shipping_option_id);
        $shippingCost   = $shippingOption->costForSubtotal((float) $hamper->price);

        // promo discount
        $discount      = 0;
        $promoCodeId   = null;
        $promoCodeStr  = null;
        $promoModel    = null;

        if ($request->filled('promo_code') && $hamper->allow_promo_codes) {
            $promoModel = PromoCode::where('code', strtoupper($request->promo_code))
                ->where('is_active', true)
                ->first();

            if ($promoModel) {
                $discount     = $this->calculatePromoDiscount($promoModel, (float) $hamper->price);
                $promoCodeId  = $promoModel->id;
                $promoCodeStr = $promoModel->code;
            }
        }

        // store credit
        $creditUsed = 0;
        if ($request->filled('store_credit_amount') && $hamper->allow_store_credit) {
            $available  = (float) ($customer->store_credit_balance ?? 0);
            $requested  = (float) $request->store_credit_amount;
            $creditUsed = min($requested, $available);
        }

        // totals
        $subtotal  = (float) $hamper->price;
        $vatAmount = $hamper->apply_vat ? round($subtotal * 0.16, 2) : 0;
        $total     = max(0, $subtotal + $vatAmount + $shippingCost - $discount - $creditUsed);

        // loyalty points
        $loyaltyPoints = 0;
        if ($hamper->earn_loyalty_points) {
            // simple rule: 1 point per 100 KES spent
            $loyaltyPoints = (int) floor($total / 100);
        }

        DB::beginTransaction();
        try {
            $order = HamperOrder::create([
                'order_number'          => HamperOrder::generateOrderNumber(),
                'customer_id'           => $customer->id,
                'hamper_id'             => $hamper->id,
                'hamper_snapshot'       => $this->buildHamperSnapshot($hamper),
                'status'                => 'pending',
                'subtotal'              => $subtotal,
                'vat_amount'            => $vatAmount,
                'discount_amount'       => $discount,
                'store_credit_used'     => $creditUsed,
                'shipping_cost'         => $shippingCost,
                'total'                 => $total,
                'promo_code'            => $promoCodeStr,
                'promo_code_id'         => $promoCodeId,
                'loyalty_points_earned' => $loyaltyPoints,
                'shipping_address'      => $request->shipping_address,
                'notes'                 => $request->notes,
            ]);

            // decrement stock
            $hamper->decrementStock();

            // deduct store credit
            if ($creditUsed > 0) {
                StoreCreditTransaction::create([
                    'customer_id'    => $customer->id,
                    'amount'         => -$creditUsed,
                    'balance_after'  => max(0, (float) $customer->store_credit_balance - $creditUsed),
                    'type'           => 'order_spend',
                    'reference_type' => HamperOrder::class,
                    'reference_id'   => $order->id,
                    'note'           => "Used on hamper order {$order->order_number}",
                    'created_by'     => $customer->user_id ?? null,
                ]);

                $customer->decrement('store_credit_balance', $creditUsed);
            }

            // increment promo usage
            if ($promoModel) {
                $promoModel->increment('used_count');
            }

            // award loyalty points
            if ($loyaltyPoints > 0) {
                // assumes LoyaltyService or direct insert — adjust to match your existing pattern
                \App\Models\LoyaltyPointTransaction::create([
                    'customer_id'    => $customer->id,
                    'points'         => $loyaltyPoints,
                    'type'           => 'earn',
                    'reference_type' => HamperOrder::class,
                    'reference_id'   => $order->id,
                    'note'           => "Earned on hamper order {$order->order_number}",
                ]);
            }

            DB::commit();

            return response()->json([
                'message'      => 'Order placed successfully',
                'order_number' => $order->order_number,
                'order'        => $order,
            ], 201);

        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to place order', 'error' => $e->getMessage()], 500);
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Resolve customer + hamper, run eligibility gate.
     * Returns [$customer, $hamper, $errorResponse|null]
     */
    private function resolveAndGate($slug): array
    {
        $customer = auth()->user()->customer;

        if (!$customer) {
            return [null, null, response()->json(['message' => 'Customer profile not found'], 404)];
        }

        $hamper = Hamper::available()->where('slug', $slug)->firstOrFail();

        $status = $this->eligibility->getStatus($customer, $hamper);

        if ($status !== 'eligible') {
            return [null, null, response()->json([
                'message' => 'This offer is not available to you.',
                'status'  => $status,
            ], 403)];
        }

        return [$customer, $hamper, null];
    }

    private function calculatePromoDiscount(PromoCode $promo, float $subtotal): float
    {
        if ($promo->type === 'percentage') {
            return round($subtotal * ($promo->value / 100), 2);
        }

        return min((float) $promo->value, $subtotal);
    }

    private function buildHamperSnapshot(Hamper $hamper): array
    {
        return [
            'id'           => $hamper->id,
            'name'         => $hamper->name,
            'price'        => $hamper->price,
            'accent_color' => $hamper->accent_color,
            'cover_image'  => $hamper->cover_image,
            'items'        => $hamper->items->map(fn($i) => $i->snapshot)->toArray(),
        ];
    }
}