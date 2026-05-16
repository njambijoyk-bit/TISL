<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Hamper;
use App\Models\HamperOrder;
use App\Models\ReferralCode;
use App\Models\ReferralCodeUsage;
use App\Models\ShippingOption;
use App\Models\StoreCreditTransaction;
use App\Models\LoyaltyPointTransaction;
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

        $shippingOptions = ShippingOption::active()->get(['id', 'name', 'description', 'cost', 'free_above', 'icon']);

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
     * Validate a promo/referral code against this hamper.
     */
    public function validatePromo(Request $request, $slug): JsonResponse
    {
        [$customer, $hamper, $error] = $this->resolveAndGate($slug);
        if ($error) return $error;

        if (!$hamper->allow_promo_codes) {
            return response()->json(['message' => 'Promo codes are not allowed on this hamper'], 422);
        }

        $request->validate(['code' => 'required|string']);

        $code = ReferralCode::where('code', strtoupper($request->code))->first();

        if (!$code || !$code->is_valid) {
            $code?->recordAttempt();
            return response()->json(['message' => 'Invalid or expired promo code'], 422);
        }

        $code->recordAttempt();

        // use the model's built-in canBeUsedBy check
        if (!$code->canBeUsedBy($customer, (float) $hamper->price)) {
            return response()->json(['message' => 'This code cannot be applied to your order'], 422);
        }

        // per-customer usage check against hamper_orders
        if ($code->max_uses_per_customer) {
            $usedOnHampers = HamperOrder::where('customer_id', $customer->id)
                ->where('referral_code_id', $code->id)
                ->whereNotIn('status', ['cancelled', 'refunded'])
                ->count();

            if ($usedOnHampers >= $code->max_uses_per_customer) {
                return response()->json(['message' => 'You have already used this code the maximum number of times'], 422);
            }
        }

        $discount = $code->calculateDiscount((float) $hamper->price);

        return response()->json([
            'valid'            => true,
            'referral_code_id' => $code->id,
            'code'             => $code->code,
            'reward_type'      => $code->reward_type,
            'discount'         => $discount,
            'description'      => $code->description,
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
            'shipping_option_id'       => 'required|exists:shipping_options,id',
            'shipping_address'         => 'required|array',
            'shipping_address.line1'   => 'required|string',
            'shipping_address.city'    => 'required|string',
            'shipping_address.country' => 'required|string',
            'promo_code'               => 'nullable|string',
            'store_credit_amount'      => 'nullable|numeric|min:0',
            'notes'                    => 'nullable|string',
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

        // shipping
        $shippingOption = ShippingOption::findOrFail($request->shipping_option_id);
        $shippingCost   = $shippingOption->costForSubtotal((float) $hamper->price);

        // promo / referral code
        $discount        = 0;
        $referralCodeId  = null;
        $promoCodeStr    = null;
        $referralCode    = null;

        if ($request->filled('promo_code') && $hamper->allow_promo_codes) {
            $referralCode = ReferralCode::where('code', strtoupper($request->promo_code))->first();

            if ($referralCode && $referralCode->is_valid && $referralCode->canBeUsedBy($customer, (float) $hamper->price)) {
                $discount       = $referralCode->calculateDiscount((float) $hamper->price);
                $referralCodeId = $referralCode->id;
                $promoCodeStr   = $referralCode->code;
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

        // loyalty points: 1 point per 100 KES
        $loyaltyPoints = $hamper->earn_loyalty_points ? (int) floor($total / 100) : 0;

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
                'referral_code_id'      => $referralCodeId,
                'loyalty_points_earned' => $loyaltyPoints,
                'shipping_address'      => $request->shipping_address,
                'notes'                 => $request->notes,
            ]);

            // decrement hamper stock
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
                    'created_by'     => auth()->id(),
                ]);
                $customer->decrement('store_credit_balance', $creditUsed);
            }

            // record referral code success
            if ($referralCode) {
                $referralCode->recordSuccess($discount, $subtotal);

                ReferralCodeUsage::create([
                    'referral_code_id' => $referralCode->id,
                    'customer_id'      => $customer->id,
                    'order_id'         => $order->id,
                    'discount_amount'  => $discount,
                    'status'           => 'completed',
                ]);
            }

            // award loyalty points
            if ($loyaltyPoints > 0) {
                LoyaltyPointTransaction::create([
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