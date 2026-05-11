<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\LoyaltyPointTransaction;
use App\Models\StoreCreditTransaction;
use App\Services\LoyaltyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LoyaltyController extends Controller
{
    public function __construct(private LoyaltyService $loyalty) {}

    // =========================================================================
    // ADMIN — CUSTOMER LIST
    // =========================================================================

    /**
     * GET /admin/loyalty
     * Paginated customer list with loyalty balances.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Customer::class);

        $query = Customer::query()
            ->select([
                'id', 'customer_number', 'first_name', 'last_name',
                'email', 'profile_image', 'tier', 'status',
                'loyalty_points', 'store_credit',
                'total_orders', 'last_order_date',
            ])
            ->withCount([
                'loyaltyPointTransactions as point_tx_count',
                'storeCreditTransactions as credit_tx_count',
            ]);

        // Filters
        if ($search = $request->input('search')) {
            $query->search($search);
        }
        if ($tier = $request->input('tier')) {
            $query->byTier($tier);
        }
        if ($request->boolean('has_points')) {
            $query->where('loyalty_points', '>', 0);
        }
        if ($request->boolean('has_credit')) {
            $query->where('store_credit', '>', 0);
        }

        $sort = $request->input('sort', 'loyalty_points');
        $dir  = $request->input('dir', 'desc');
        $allowedSorts = ['loyalty_points', 'store_credit', 'total_orders', 'last_order_date', 'created_at'];
        if (in_array($sort, $allowedSorts)) {
            $query->orderBy($sort, $dir === 'asc' ? 'asc' : 'desc');
        }

        $customers = $query->paginate($request->input('per_page', 20));

        return response()->json($customers);
    }

    // =========================================================================
    // ADMIN — CUSTOMER DETAIL
    // =========================================================================

    /**
     * GET /admin/loyalty/{customerId}
     * Summary card for a specific customer.
     */
    public function show(int $customerId): JsonResponse
    {
        $customer = Customer::findOrFail($customerId);
        $this->authorize('view', $customer);

        return response()->json([
            'customer' => [
                'id'              => $customer->id,
                'customer_number' => $customer->customer_number,
                'full_name'       => $customer->full_name,
                'email'           => $customer->email,
                'tier'            => $customer->tier,
                'tier_benefits'   => $customer->tier_benefits,
                'status'          => $customer->status,
                'profile_image_url' => $customer->profile_image_url,
                'loyalty_points'  => $customer->loyalty_points,
                'store_credit'    => $customer->store_credit,
                'total_orders'    => $customer->total_orders,
                'total_spent'     => $customer->total_spent,
                'last_order_date' => $customer->last_order_date,
            ],
        ]);
    }

    /**
     * GET /admin/loyalty/{customerId}/transactions?ledger=points|credit
     * Paginated transaction history for one customer.
     */
    public function transactions(Request $request, int $customerId): JsonResponse
    {
        $customer = Customer::findOrFail($customerId);
        $this->authorize('view', $customer);

        $ledger  = $request->input('ledger', 'points'); // 'points' | 'credit'
        $perPage = $request->input('per_page', 25);

        if ($ledger === 'credit') {
            $query = StoreCreditTransaction::forCustomer($customerId)
                ->with('createdBy:id,name,role')
                ->latest();

            if ($type = $request->input('type')) {
                $query->byType($type);
            }

            return response()->json($query->paginate($perPage));
        }

        // default: points
        $query = LoyaltyPointTransaction::forCustomer($customerId)
            ->with('createdBy:id,name,role')
            ->latest();

        if ($type = $request->input('type')) {
            $query->byType($type);
        }
        if ($request->input('point_type')) {
            $query->where('point_type', $request->input('point_type'));
        }

        return response()->json($query->paginate($perPage));
    }

    // =========================================================================
    // ADMIN — GRANT / DEDUCT
    // =========================================================================

    /**
     * POST /admin/loyalty/{customerId}/grant-points
     */
    public function grantPoints(Request $request, int $customerId): JsonResponse
    {
        $this->authorize('grantPoints', Customer::class);

        $data = $request->validate([
            'points'     => 'required|integer|min:1',
            'note'       => 'nullable|string|max:500',
            'point_type' => 'nullable|in:permanent,expiring',
            'expires_at' => 'nullable|date|after:today',
        ]);

        $customer = Customer::findOrFail($customerId);
        $tx = $this->loyalty->grantPoints(
            customer:  $customer,
            points:    $data['points'],
            note:      $data['note'] ?? '',
            admin:     $request->user(),
            pointType: $data['point_type'] ?? 'permanent',
            expiresAt: $data['expires_at'] ?? null,
        );

        return response()->json(['transaction' => $tx, 'new_balance' => $tx->balance_after]);
    }

    /**
     * POST /admin/loyalty/{customerId}/deduct-points
     */
    public function deductPoints(Request $request, int $customerId): JsonResponse
    {
        $this->authorize('deductPoints', Customer::class);

        $data = $request->validate([
            'points' => 'required|integer|min:1',
            'note'   => 'nullable|string|max:500',
        ]);

        $customer = Customer::findOrFail($customerId);
        $tx = $this->loyalty->deductPoints(
            customer: $customer,
            points:   $data['points'],
            note:     $data['note'] ?? '',
            admin:    $request->user(),
        );

        return response()->json(['transaction' => $tx, 'new_balance' => $tx->balance_after]);
    }

    /**
     * POST /admin/loyalty/{customerId}/grant-credit
     */
    public function grantCredit(Request $request, int $customerId): JsonResponse
    {
        $this->authorize('grantCredit', Customer::class);

        $data = $request->validate([
            'amount'     => 'required|numeric|min:1',
            'note'       => 'nullable|string|max:500',
            'expires_at' => 'nullable|date|after:today',
        ]);

        $customer = Customer::findOrFail($customerId);
        $tx = $this->loyalty->grantCredit(
            customer:  $customer,
            amount:    $data['amount'],
            note:      $data['note'] ?? '',
            admin:     $request->user(),
            expiresAt: $data['expires_at'] ?? null,
        );

        return response()->json(['transaction' => $tx, 'new_balance' => $tx->balance_after]);
    }

    /**
     * POST /admin/loyalty/{customerId}/deduct-credit
     */
    public function deductCredit(Request $request, int $customerId): JsonResponse
    {
        $this->authorize('deductCredit', Customer::class);

        $data = $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'note'   => 'nullable|string|max:500',
        ]);

        $customer = Customer::findOrFail($customerId);
        $tx = $this->loyalty->deductCredit(
            customer: $customer,
            amount:   $data['amount'],
            note:     $data['note'] ?? '',
            admin:    $request->user(),
        );

        return response()->json(['transaction' => $tx, 'new_balance' => $tx->balance_after]);
    }

    /**
     * POST /admin/loyalty/{customerId}/redeem
     * Admin-initiated redemption on behalf of a customer.
     */
    public function redeem(Request $request, int $customerId): JsonResponse
    {
        $customer = Customer::findOrFail($customerId);
        $this->authorize('redeem', $customer);

        $data = $request->validate([
            'rule_id' => 'required|string',
        ]);

        $result = $this->loyalty->redeem(
            customer:    $customer,
            ruleId:      $data['rule_id'],
            initiatedBy: $request->user(),
        );

        return response()->json($result);
    }

    // =========================================================================
    // ADMIN — SETTINGS & REDEMPTION RULES
    // =========================================================================

    /**
     * GET /admin/loyalty/settings
     */
    public function getSettings(): JsonResponse
    {
        $this->authorize('viewAny', Customer::class);

        return response()->json([
            'settings'         => $this->loyalty->getAllSettings(),
            'redemption_rules' => $this->loyalty->getRedemptionRules(),
        ]);
    }

    /**
     * PUT /admin/loyalty/settings
     */
    public function updateSettings(Request $request): JsonResponse
    {
        $this->authorize('configureSettings', Customer::class);

        $data = $request->validate([
            'points_per_100_kes'     => 'sometimes|integer|min:1',
            'referral_credit_amount' => 'sometimes|numeric|min:0',
            'min_redemption_points'  => 'sometimes|integer|min:1',
            'points_expiry_months'   => 'sometimes|nullable|integer|min:1',
        ]);

        foreach ($data as $key => $value) {
            $this->loyalty->updateSetting($key, $value, $request->user());
        }

        return response()->json(['settings' => $this->loyalty->getAllSettings()]);
    }

    /**
     * POST /admin/loyalty/settings/rules
     * Create or update a redemption rule.
     */
    public function upsertRule(Request $request): JsonResponse
    {
        $this->authorize('configureSettings', Customer::class);

        $data = $request->validate([
            'id'              => 'nullable|string',
            'name'            => 'required|string|max:100',
            'type'            => 'required|in:cashback,gift,voucher',
            'points_required' => 'required|integer|min:1',
            'value_kes'       => 'required|numeric|min:0',
            'active'          => 'boolean',
            'valid_from'      => 'nullable|date',
            'valid_until'     => 'nullable|date|after:valid_from',
        ]);

        $rule = $this->loyalty->upsertRedemptionRule($data, $request->user());
        return response()->json(['rule' => $rule]);
    }

    /**
     * DELETE /admin/loyalty/settings/rules/{ruleId}
     */
    public function deleteRule(Request $request, string $ruleId): JsonResponse
    {
        $this->authorize('configureSettings', Customer::class);

        $this->loyalty->deleteRedemptionRule($ruleId, $request->user());
        return response()->json(['message' => 'Rule deleted.']);
    }

    // =========================================================================
    // CUSTOMER — SELF-SERVE
    // =========================================================================

    /**
     * GET /customer/loyalty
     * Customer's own balance + active redemption rules.
     */
    public function myBalance(Request $request): JsonResponse
    {
        $customer = $request->user()->customer;
        abort_unless($customer, 404);

        return response()->json([
            'loyalty_points'     => $customer->loyalty_points,
            'store_credit'       => $customer->store_credit,
            'tier'               => $customer->tier,
            'tier_benefits'      => $customer->tier_benefits,
            'redemption_rules'   => $this->loyalty->getRedemptionRules(activeOnly: true),
            'min_redemption_points' => $this->loyalty->getSetting('min_redemption_points', 500),
        ]);
    }

    /**
     * GET /customer/loyalty/transactions?ledger=points|credit
     */
    public function myTransactions(Request $request): JsonResponse
    {
        $customer = $request->user()->customer;
        abort_unless($customer, 404);

        $ledger  = $request->input('ledger', 'points');
        $perPage = $request->input('per_page', 20);

        if ($ledger === 'credit') {
            $txs = StoreCreditTransaction::forCustomer($customer->id)->latest()->paginate($perPage);
        } else {
            $txs = LoyaltyPointTransaction::forCustomer($customer->id)->latest()->paginate($perPage);
        }

        return response()->json($txs);
    }

    /**
     * POST /customer/loyalty/redeem
     * Customer self-serve redemption.
     */
    public function selfRedeem(Request $request): JsonResponse
    {
        $customer = $request->user()->customer;
        abort_unless($customer, 404);

        $this->authorize('redeem', $customer);

        $data = $request->validate([
            'rule_id' => 'required|string',
        ]);

        $result = $this->loyalty->redeem(
            customer:    $customer,
            ruleId:      $data['rule_id'],
            initiatedBy: null,
        );

        return response()->json($result);
    }
}