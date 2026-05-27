<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Traits\LogsReferralActivity;
use App\Models\ReferralCode;
use App\Models\ReferralCodeUsage;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ReferralController extends Controller
{
    use LogsReferralActivity; 
    // ═══════════════════════════════════════════════════
    // ADMIN — LIST & STATISTICS
    // ═══════════════════════════════════════════════════

    public function index(Request $request)
    {
        $query = ReferralCode::with(['customer.user', 'createdBy'])
            ->withCount('usages');

        // Search
        if ($request->filled('search')) {
            $query->search($request->search);
        }

        // Filters
        if ($request->filled('type'))        $query->where('type', $request->type);
        if ($request->filled('status'))      $query->where('status', $request->status);
        if ($request->filled('reward_type')) $query->where('reward_type', $request->reward_type);
        if ($request->boolean('public'))     $query->where('is_public', true);
        if ($request->boolean('expiring'))   $query->expiringSoon(7);

        // Sort
        $sortBy    = $request->input('sort_by', 'created_at');
        $sortOrder = $request->input('sort_order', 'desc');
        $allowed   = ['name', 'code', 'type', 'status', 'times_used', 'total_revenue', 'created_at', 'valid_until'];
        if (in_array($sortBy, $allowed)) {
            $query->orderBy($sortBy, $sortOrder);
        }

        $perPage = (int) $request->input('per_page', 20);
        return response()->json($query->paginate($perPage));
    }

    public function statistics(Request $request)
    {
        $base = ReferralCode::query();

        // Overall counts
        $total         = (clone $base)->count();
        $active        = (clone $base)->where('status', 'active')->count();
        $paused        = (clone $base)->where('status', 'paused')->count();
        $depleted      = (clone $base)->where('status', 'depleted')->count();
        $expired       = (clone $base)->where('status', 'expired')->count();
        $customerCodes = (clone $base)->where('type', 'customer_referral')->count();
        $promoCodes    = (clone $base)->where('type', '!=', 'customer_referral')->count();
        $expiringSoon  = (clone $base)->expiringSoon(7)->count();

        // Revenue & usage totals
        $totalRevenue       = (clone $base)->sum('total_revenue');
        $totalDiscount      = (clone $base)->sum('total_discount_given');
        $totalReferrerPaid  = (clone $base)->sum('total_referrer_rewards');
        $totalUses          = (clone $base)->sum('times_used');

        // Top performing
        $topByRevenue  = (clone $base)->orderBy('total_revenue', 'desc')->limit(5)->get(['id', 'name', 'code', 'type', 'total_revenue', 'times_used']);
        $topByUses     = (clone $base)->orderBy('times_used', 'desc')->limit(5)->get(['id', 'name', 'code', 'type', 'times_used', 'total_revenue']);

        // Recent usage activity (last 30 days)
        $recentUsage = ReferralCodeUsage::where('created_at', '>=', now()->subDays(30))
            ->selectRaw('DATE(created_at) as date, COUNT(*) as count, SUM(order_value) as revenue')
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        // By type breakdown
        $byType = (clone $base)
            ->selectRaw('type, COUNT(*) as count, SUM(total_revenue) as revenue, SUM(times_used) as uses')
            ->groupBy('type')
            ->get();

        return response()->json([
            'counts' => [
                'total'          => $total,
                'active'         => $active,
                'paused'         => $paused,
                'depleted'       => $depleted,
                'expired'        => $expired,
                'customer_codes' => $customerCodes,
                'promo_codes'    => $promoCodes,
                'expiring_soon'  => $expiringSoon,
            ],
            'totals' => [
                'revenue'          => $totalRevenue,
                'discount_given'   => $totalDiscount,
                'referrer_rewards' => $totalReferrerPaid,
                'total_uses'       => $totalUses,
            ],
            'top_by_revenue'   => $topByRevenue,
            'top_by_uses'      => $topByUses,
            'recent_activity'  => $recentUsage,
            'by_type'          => $byType,
        ]);
    }

    // ═══════════════════════════════════════════════════
    // ADMIN — SINGLE CODE
    // ═══════════════════════════════════════════════════

    public function show(Request $request, $id)
    {
        $code = ReferralCode::with([
            'customer.user',
            'createdBy',
            'updatedBy',
        ])->findOrFail($id);

        // Usage breakdown
        $usages = ReferralCodeUsage::with(['customer.user', 'referrer.user', 'order', 'hamperOrder'])
            ->where('referral_code_id', $id)
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        $metrics = $code->getPerformanceMetrics();

        // Usage by status
        $usageByStatus = ReferralCodeUsage::where('referral_code_id', $id)
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        // Monthly usage trend
        $monthlyTrend = ReferralCodeUsage::where('referral_code_id', $id)
            ->where('created_at', '>=', now()->subMonths(6))
            ->selectRaw('DATE_FORMAT(created_at, "%Y-%m") as month, COUNT(*) as count, SUM(order_value) as revenue')
            ->groupBy('month')
            ->orderBy('month')
            ->get();

        return response()->json([
            'code'          => $code,
            'usages'        => $usages,
            'metrics'       => $metrics,
            'usage_by_status' => $usageByStatus,
            'monthly_trend' => $monthlyTrend,
        ]);
    }

    // ═══════════════════════════════════════════════════
    // ADMIN — CREATE
    // ═══════════════════════════════════════════════════

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name'                     => 'required|string|max:255',
            'code'                     => 'nullable|string|max:50|unique:referral_codes,code',
            'description'              => 'nullable|string',
            'type'                     => 'required|in:general,customer_referral,first_time,bulk_order,vip,birthday,event',
            'customer_id'              => 'nullable|exists:customers,id',
            'max_uses'                 => 'nullable|integer|min:1',
            'max_uses_per_customer'    => 'nullable|integer|min:1',
            'valid_from'               => 'nullable|date',
            'valid_until'              => 'nullable|date|after:valid_from',
            'min_order_value'          => 'nullable|numeric|min:0',
            'min_items'                => 'nullable|integer|min:1',
            'reward_type'              => 'required|in:percentage,fixed_amount,free_shipping,store_credit',
            'reward_value'             => 'required|numeric|min:0',
            'referrer_reward_type'     => 'nullable|in:none,percentage,fixed_amount,store_credit,points',
            'referrer_reward_value'    => 'nullable|numeric|min:0',
            'applicable_categories'    => 'nullable|array',
            'applicable_products'      => 'nullable|array',
            'excluded_products'        => 'nullable|array',
            'applicable_customer_types'=> 'nullable|array',
            'applicable_tiers'         => 'nullable|array',
            'stackable'                => 'boolean',
            'status'                   => 'nullable|in:draft,active,paused',
            'is_public'                => 'boolean',
            'auto_apply'               => 'boolean',
            'promo_color'              => 'nullable|string|max:20',
            'display_tags'             => 'nullable|array',
            'notify_on_use'            => 'boolean',
            'notify_on_expiry'         => 'boolean',
            'admin_notes'              => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            $code = ReferralCode::create([
                ...$request->only([
                    'name', 'description', 'type', 'customer_id',
                    'max_uses', 'max_uses_per_customer',
                    'valid_from', 'valid_until',
                    'min_order_value', 'min_items',
                    'reward_type', 'reward_value',
                    'referrer_reward_type', 'referrer_reward_value',
                    'applicable_categories', 'applicable_products',
                    'excluded_products', 'applicable_customer_types',
                    'applicable_tiers', 'stackable',
                    'is_public', 'auto_apply',
                    'promo_color', 'display_tags',
                    'notify_on_use', 'notify_on_expiry',
                    'admin_notes',
                ]),
                'code'       => $request->code ?? ReferralCode::generateUniqueCode(),
                'status'     => $request->input('status', 'draft'),
                'created_by' => $request->user()->id,
                'updated_by' => $request->user()->id,
            ]);

            DB::commit();
            $this->logReferralCodeCreated($code);
            return response()->json([
                'message' => 'Referral code created successfully.',
                'data'    => $code->load(['customer.user', 'createdBy']),
            ], 201);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Referral code creation failed', ['error' => $e->getMessage()]);
            return response()->json(['message' => 'Failed to create referral code.'], 500);
        }
    }

    // ═══════════════════════════════════════════════════
    // ADMIN — UPDATE
    // ═══════════════════════════════════════════════════

    public function update(Request $request, $id)
    {
        $code = ReferralCode::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'name'                     => 'sometimes|string|max:255',
            'code'                     => 'sometimes|string|max:50|unique:referral_codes,code,' . $id,
            'description'              => 'nullable|string',
            'max_uses'                 => 'nullable|integer|min:1',
            'max_uses_per_customer'    => 'nullable|integer|min:1',
            'valid_from'               => 'nullable|date',
            'valid_until'              => 'nullable|date',
            'min_order_value'          => 'nullable|numeric|min:0',
            'min_items'                => 'nullable|integer|min:1',
            'reward_type'              => 'sometimes|in:percentage,fixed_amount,free_shipping,store_credit',
            'reward_value'             => 'sometimes|numeric|min:0',
            'referrer_reward_type'     => 'nullable|in:none,percentage,fixed_amount,store_credit,points',
            'referrer_reward_value'    => 'nullable|numeric|min:0',
            'applicable_categories'    => 'nullable|array',
            'applicable_products'      => 'nullable|array',
            'excluded_products'        => 'nullable|array',
            'applicable_customer_types'=> 'nullable|array',
            'applicable_tiers'         => 'nullable|array',
            'stackable'                => 'boolean',
            'is_public'                => 'boolean',
            'auto_apply'               => 'boolean',
            'promo_color'              => 'nullable|string|max:20',
            'display_tags'             => 'nullable|array',
            'notify_on_use'            => 'boolean',
            'notify_on_expiry'         => 'boolean',
            'admin_notes'              => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $changes = [];

        $code->update([
            ...$request->only([
                'name', 'code', 'description',
                'max_uses', 'max_uses_per_customer',
                'valid_from', 'valid_until',
                'min_order_value', 'min_items',
                'reward_type', 'reward_value',
                'referrer_reward_type', 'referrer_reward_value',
                'applicable_categories', 'applicable_products',
                'excluded_products', 'applicable_customer_types',
                'applicable_tiers', 'stackable',
                'is_public', 'auto_apply',
                'promo_color', 'display_tags',
                'notify_on_use', 'notify_on_expiry',
                'admin_notes',
            ]),
            'updated_by' => $request->user()->id,
        ]);

        if (!empty($changes)) {
            $this->logReferralCodeUpdated($code, $changes); 
        }

        return response()->json([
            'message' => 'Referral code updated.',
            'data'    => $code->fresh(['customer.user', 'createdBy']),
        ]);
    }

    // ═══════════════════════════════════════════════════
    // ADMIN — STATUS MANAGEMENT
    // ═══════════════════════════════════════════════════

    public function activate(Request $request, $id)
    {
        $code = ReferralCode::findOrFail($id);
        $code->activate();
        $code->update(['updated_by' => $request->user()->id]);
        $this->logReferralCodeStatusChanged($code, 'ACTIVATED');
        return response()->json(['message' => 'Code activated.', 'data' => $code]);
    }

    public function pause(Request $request, $id)
    {
        $code = ReferralCode::findOrFail($id);
        $code->pause();
        $code->update(['updated_by' => $request->user()->id]);
        $this->logReferralCodeStatusChanged($code, 'PAUSED');
        return response()->json(['message' => 'Code paused.', 'data' => $code]);
    }

    public function archive(Request $request, $id)
    {
        $code = ReferralCode::findOrFail($id);
        $code->archive();
        $code->update(['updated_by' => $request->user()->id]);
        $this->logReferralCodeStatusChanged($code, 'ARCHIVED');
        return response()->json(['message' => 'Code archived.', 'data' => $code]);
    }

    public function destroy(Request $request, $id)
    {
        $code = ReferralCode::findOrFail($id);

        // Don't hard-delete codes that have been used
        if ($code->times_used > 0) {
            $code->archive();
            $this->logReferralCodeStatusChanged($code, 'ARCHIVED');
            return response()->json(['message' => 'Code has usage history — archived instead of deleted.', 'data' => $code]);
        }

        
        $this->logReferralCodeStatusChanged($code, 'DELETED');
        $code->delete();
        return response()->json(['message' => 'Code deleted.']);
    }

    // ═══════════════════════════════════════════════════
    // ADMIN — TOP PERFORMERS
    // ═══════════════════════════════════════════════════

    public function topPerformers(Request $request)
    {
        $limit  = $request->input('limit', 10);
        $sortBy = $request->input('sort_by', 'total_revenue');
        $allowed = ['total_revenue', 'times_used', 'conversion_rate', 'successful_uses'];

        $codes = ReferralCode::with(['customer.user'])
            ->where('status', 'active')
            ->orderBy(in_array($sortBy, $allowed) ? $sortBy : 'total_revenue', 'desc')
            ->limit($limit)
            ->get();

        return response()->json(['data' => $codes]);
    }

    // ═══════════════════════════════════════════════════
    // ADMIN — USAGE LIST
    // ═══════════════════════════════════════════════════

    public function usage(Request $request, $id)
    {
        $code = ReferralCode::findOrFail($id);

        $query = ReferralCodeUsage::with([
            'customer.user',
            'referrer.user',
            'order' => fn($q) => $q->withTrashed(),
            'hamperOrder',
        ])
        ->where('referral_code_id', $id);

        if ($request->filled('status')) $query->where('status', $request->status);

        $query->orderBy('created_at', 'desc');

        return response()->json($query->paginate($request->input('per_page', 20)));
    }

    // ═══════════════════════════════════════════════════
    // CUSTOMER — VALIDATE CODE
    // ═══════════════════════════════════════════════════

    public function validateCode(Request $request)
    {
        $request->validate([
            'code'        => 'required|string',
            'order_value' => 'nullable|numeric|min:0',
            'item_count'  => 'nullable|integer|min:0',
        ]);

        $code = ReferralCode::where('code', strtoupper($request->code))->first();

        if (!$code) {
            return response()->json(['valid' => false, 'message' => 'Invalid referral code.'], 422);
        }

        $code->recordView();

        if (!$code->is_valid) {
            $reason = $code->is_expired ? 'expired' : ($code->is_depleted ? 'depleted' : 'inactive');
            return response()->json(['valid' => false, 'message' => "This code is {$reason}."], 422);
        }

        // Check customer eligibility if authenticated
        $customer = $request->user()?->customer;
        if ($customer && !$code->canBeUsedBy($customer, $request->order_value ?? 0, $request->item_count ?? 0)) {
            return response()->json(['valid' => false, 'message' => 'You are not eligible to use this code.'], 422);
        }

        // Calculate discount preview
        $discount = $code->calculateDiscount($request->order_value ?? 0);

        return response()->json([
            'valid'        => true,
            'code'         => $code->code,
            'name'         => $code->name,
            'description'  => $code->description,
            'reward_type'  => $code->reward_type,
            'reward_value' => $code->reward_value,
            'discount'     => $discount,
            'message'      => "Code applied! You save " . ($code->reward_type === 'percentage' ? "{$code->reward_value}%" : "KES " . number_format($discount, 2)),
        ]);
    }

    // ═══════════════════════════════════════════════════
    // CUSTOMER — MY REFERRAL CODE
    // ═══════════════════════════════════════════════════

    public function myCode(Request $request)
    {
        $customer = $request->user()->customer;
        if (!$customer) {
            return response()->json(['message' => 'Customer profile not found.'], 404);
        }

        $code = ReferralCode::where('customer_id', $customer->id)
            ->where('type', 'customer_referral')
            ->first();

        if (!$code) {
            $code = ReferralCode::createForCustomer($customer);
        }

        $stats = ReferralCodeUsage::getStatsFor($customer);

        return response()->json([
            'code'       => $code,
            'share_url'  => $code->share_url,
            'stats'      => $stats,
        ]);
    }

    // ═══════════════════════════════════════════════════
    // CUSTOMER — MY REFERRALS
    // ═══════════════════════════════════════════════════

    public function myReferrals(Request $request)
    {
        $customer = $request->user()->customer;
        if (!$customer) {
            return response()->json(['message' => 'Customer profile not found.'], 404);
        }

        $referrals = ReferralCodeUsage::with(['customer.user', 'order', 'hamperOrder'])
            ->where('referrer_id', $customer->id)
            ->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 10));

        $stats = ReferralCodeUsage::getStatsFor($customer);

        return response()->json([
            'referrals' => $referrals,
            'stats'     => $stats,
        ]);
    }

    // ═══════════════════════════════════════════════════
    // CUSTOMER — EARNINGS
    // ═══════════════════════════════════════════════════

    public function earnings(Request $request)
    {
        $customer = $request->user()->customer;
        if (!$customer) {
            return response()->json(['message' => 'Customer profile not found.'], 404);
        }

        $paid = ReferralCodeUsage::forReferrer($customer->id)
            ->completed()
            ->where('referrer_reward_paid', true)
            ->get(['referrer_reward_amount', 'referrer_reward_type', 'completed_at', 'order_value']);

        $pending = ReferralCodeUsage::forReferrer($customer->id)
            ->pending()
            ->get(['referrer_reward_amount', 'referrer_reward_type', 'registered_at']);

        return response()->json([
            'total_earned'   => $paid->sum('referrer_reward_amount'),
            'pending_amount' => $pending->sum('referrer_reward_amount'),
            'paid_history'   => $paid,
            'pending_list'   => $pending,
        ]);
    }

    // ═══════════════════════════════════════════════════
    // ANALYTICS — GLOBAL
    // ═══════════════════════════════════════════════════

    public function analytics(Request $request)
    {
        $days  = $request->input('days', 30);
        $since = now()->subDays($days);

        // Daily usage over period
        $daily = ReferralCodeUsage::where('created_at', '>=', $since)
            ->selectRaw('DATE(created_at) as date, COUNT(*) as uses, SUM(order_value) as revenue, SUM(discount_amount) as discounts')
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        // By reward type
        $byRewardType = ReferralCode::where('status', 'active')
            ->selectRaw('reward_type, COUNT(*) as code_count, SUM(times_used) as total_uses, SUM(total_revenue) as revenue')
            ->groupBy('reward_type')
            ->get();

        // Unpaid referrer rewards
        $unpaidRewards = ReferralCodeUsage::unpaidRewards()->sum('referrer_reward_amount');

        // Conversion funnel
        $funnel = [
            'views'    => ReferralCode::sum('views'),
            'attempts' => ReferralCode::sum('attempts'),
            'uses'     => ReferralCode::sum('times_used'),
        ];

        return response()->json([
            'daily'          => $daily,
            'by_reward_type' => $byRewardType,
            'unpaid_rewards' => $unpaidRewards,
            'funnel'         => $funnel,
            'period_days'    => $days,
        ]);
    }
    // ═══════════════════════════════════════════════════
    // ADMIN — ACTIVITY LOG
    // ═══════════════════════════════════════════════════

    public function activityLog(Request $request)
    {
        $query = \App\Models\ReferralActivityLog::with(['actor:id,name,email', 'order:id,order_number'])
            ->orderBy('created_at', 'desc');

        // Optional filters
        if ($request->filled('entity_type')) {
            $query->where('entity_type', $request->entity_type);
        }
        if ($request->filled('action')) {
            $query->where('action', $request->action);
        }
        if ($request->filled('actor_type')) {
            $query->where('actor_type', $request->actor_type);
        }

        $perPage = (int) $request->input('per_page', 20);

        return response()->json($query->paginate($perPage));
    }
}