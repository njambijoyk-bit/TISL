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
use App\Http\Controllers\Api\Traits\LogsPolicyAcceptances;

use App\Http\Controllers\Api\Traits\LogsHamperActivities;

class HamperCheckoutController extends Controller
{
    use LogsHamperActivities;
    use LogsPolicyAcceptances;
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
            ? (float) ($customer->store_credit ?? 0)
            : 0;

        return response()->json([
            'hamper'           => $hamper->load('items'),
            'shipping_options' => $shippingOptions,
            'store_credit'     => [
                'allowed'   => $hamper->allow_store_credit,
                'balance'   => $creditBalance,
                'max_apply' => 500,
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
            'policy_acceptances'            => 'nullable|array',
            'policy_acceptances.*.key'      => 'required_with:policy_acceptances|string',
            'policy_acceptances.*.response' => 'required_with:policy_acceptances|in:accepted,disagreed',
        ]);

        // re-check purchase limit
        $purchaseCount = $hamper->purchaseCountForCustomer($customer->id);
        if ($hamper->max_purchases_per_customer !== null && $purchaseCount >= $hamper->max_purchases_per_customer) {
            return response()->json(['message' => 'You have reached the purchase limit for this hamper'], 422);
        }

        // re-check stock — no backorders allowed
        if ($hamper->is_sold_out) {
            return response()->json(['message' => 'This hamper is sold out'], 422);
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
                $referralCode->recordAttempt();
                $discount       = $referralCode->calculateDiscount((float) $hamper->price);
                $referralCodeId = $referralCode->id;
                $promoCodeStr   = $referralCode->code;
            }
        }

        // totals
        $subtotal           = (float) $hamper->price;
        $taxableAmount      = max(0, $subtotal - $discount);
        $vatAmount          = $hamper->apply_vat ? round($taxableAmount * 0.16, 2) : 0;
        $preTotalBeforeCredit = round($subtotal - $discount + $vatAmount + $shippingCost, 2);

        $shippingSnapshot = [
            'id'           => $shippingOption->id,
            'name'         => $shippingOption->name,
            'slug'         => $shippingOption->slug,
            'cost'         => $shippingOption->cost,
            'free_above'   => $shippingOption->free_above,
            'applied_cost' => $shippingCost
        ];

        // store credit
        $creditUsed = 0;
        if ($request->filled('store_credit_amount') && $hamper->allow_store_credit) {
            $available  = (float) ($customer->store_credit ?? 0);
            $requested  = (float) $request->store_credit_amount;
            $maxCredit  = 500;
            $creditUsed = max(0, round(min($requested, $available, $preTotalBeforeCredit, $maxCredit), 2));
        }

        $total = max(0, round($preTotalBeforeCredit - $creditUsed, 2));

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
                'shipping_option_id'    => $shippingOption->id,
                'shipping_method_name'  => $shippingOption->name,
                'shipping_snapshot'     => $shippingSnapshot,
                'total'                 => $total,
                'promo_code'            => $promoCodeStr,
                'referral_code_id'      => $referralCodeId,
                'loyalty_points_earned' => $loyaltyPoints,
                'shipping_address'      => $request->shipping_address,
                'notes'                 => $request->notes,
            ]);

            foreach ($request->input('policy_acceptances', []) as $pa) {
                $this->logPolicyAcceptance(
                    policyKey:     $pa['key'],
                    actionContext: 'hamper_checkout',
                    response:      $pa['response'],
                    customer:      $customer,
                    user:          auth()->user(),
                    wasSuccessful: true,
                    referenceType: 'hamper_order',
                    referenceId:   $order->id,
                    request:       $request,
                );
            }


            // decrement hamper stock
            $hamper->decrementStock();

            // deduct store credit
            if ($creditUsed > 0) {
                $newCreditBalance = max(0, round((float) $customer->store_credit - $creditUsed, 2));

                StoreCreditTransaction::create([
                    'customer_id'    => $customer->id,
                    'amount'         => -$creditUsed,
                    'balance_after'  => $newCreditBalance,
                    'type'           => 'order_spend',
                    'reference_type' => HamperOrder::class,
                    'reference_id'   => $order->id,
                    'note'           => "Used on hamper order {$order->order_number}",
                ]);

                $customer->update(['store_credit' => $newCreditBalance]);
            }

            // record referral code success + log usage row
            if ($referralCode) {
                $referralCode->recordSuccess($discount, $subtotal);

                ReferralCodeUsage::createForHamperOrder(
                    $referralCode,
                    $customer,
                    $order,
                    $discount,
                    $subtotal,
                    $total
                );
            }

            // award loyalty points
            if ($loyaltyPoints > 0) {
                $newPointBalance = (int) $customer->loyalty_points + $loyaltyPoints;

                LoyaltyPointTransaction::create([
                    'customer_id'    => $customer->id,
                    'points'         => $loyaltyPoints,
                    'balance_after'  => $newPointBalance,
                    'type'           => 'order_earn',
                    'point_type'     => 'permanent',
                    'reference_type' => HamperOrder::class,
                    'reference_id'   => $order->id,
                    'note'           => "Earned on hamper order {$order->order_number}",
                ]);

                $customer->update(['loyalty_points' => $newPointBalance]);
            }

            DB::commit();

            $this->logHamperActivity(
                $hamper->id,
                'hamper_order_placed',
                "Customer placed hamper order #{$order->order_number} for '{$hamper->name}'.",
                'info',
                [
                    'hamper_order_id'    => $order->id,
                    'subtotal'           => $subtotal,
                    'discount'           => $discount,
                    'vat_amount'         => $vatAmount,
                    'shipping_cost'      => $shippingCost,
                    'store_credit_used'  => $creditUsed,
                    'total'              => $total,
                    'loyalty_points'     => $loyaltyPoints,
                    'promo_code'         => $promoCodeStr,
                    'shipping_method'    => $shippingOption->name,
                ],
                $order->id
            );

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
            'items'        => $hamper->items->map(fn($i) => array_merge($i->snapshot, [
                'quantity' => $i->quantity,
            ]))->toArray(),
        ];
    }
}
