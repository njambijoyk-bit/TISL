<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Hamper;
use App\Services\HamperEligibilityService;
use Illuminate\Http\JsonResponse;

class PublicHamperController extends Controller
{
    public function __construct(private HamperEligibilityService $eligibility) {}

    /**
     * GET /hampers
     * Returns only hampers this customer is eligible for.
     * Sold out hampers are included but flagged.
     */
    public function index(): JsonResponse
    {
        $customer = auth()->user()->customer;

        if (!$customer) {
            return response()->json(['message' => 'Customer profile not found'], 404);
        }

        $hampers = Hamper::available()->with('items')->get();

        $eligible = $this->eligibility->getEligibleHampers($customer, $hampers);

        $result = $eligible->map(function ($hamper) use ($customer) {
            $purchaseCount = $hamper->purchaseCountForCustomer($customer->id);
            $atLimit       = $hamper->max_purchases_per_customer !== null
                && $purchaseCount >= $hamper->max_purchases_per_customer;

            return array_merge($hamper->toArray(), [
                'is_sold_out'       => $hamper->is_sold_out,
                'at_purchase_limit' => $atLimit,
                'can_purchase'      => !$atLimit && !$hamper->is_sold_out,
            ]);
        });

        return response()->json($result);
    }

    /**
     * GET /hampers/{slug}
     * Returns hamper detail — 403 if customer is not eligible.
     */
    public function show($slug): JsonResponse
    {
        $customer = auth()->user()->customer;

        if (!$customer) {
            return response()->json(['message' => 'Customer profile not found'], 404);
        }

        $hamper = Hamper::available()->where('slug', $slug)->with('items')->firstOrFail();

        $status = $this->eligibility->getStatus($customer, $hamper);

        if ($status !== 'eligible') {
            return response()->json([
                'message' => 'This offer is not available to you.',
                'status'  => $status,
            ], 403);
        }

        $purchaseCount = $hamper->purchaseCountForCustomer($customer->id);
        $atLimit       = $hamper->max_purchases_per_customer !== null
            && $purchaseCount >= $hamper->max_purchases_per_customer;

        return response()->json(array_merge($hamper->toArray(), [
            'is_sold_out'       => $hamper->is_sold_out,
            'at_purchase_limit' => $atLimit,
            'can_purchase'      => !$atLimit && !$hamper->is_sold_out,
        ]));
    }
}