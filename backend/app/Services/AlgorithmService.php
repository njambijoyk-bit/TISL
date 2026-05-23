<?php

namespace App\Services;

use App\Models\Customer;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class AlgorithmService
{
    protected array $weights;
    protected array $toggles;
    protected array $segmentRules;

    public function __construct()
    {
        $this->loadConfig();
    }

    // =========================================================
    // PUBLIC API
    // =========================================================

    /**
     * Score a single customer.
     * Returns raw signals, weighted contributions, and final total.
     */
    public function scoreCustomer(Customer $customer): array
    {
        $raw      = $this->computeRawSignals($customer);
        $weighted = $this->applyWeights($raw);
        $boosted  = $this->applySegmentRules($customer, $weighted);

        return [
            'customer_id' => $customer->id,
            'raw'         => $raw,
            'weighted'    => $boosted,
            'total_score' => round(array_sum($boosted), 2),
        ];
    }

    /**
     * Call this from the admin panel after saving weights/rules
     * so the next request picks up fresh config.
     */
    public function flushConfigCache(): void
    {
        Cache::forget('algorithm_config');
        Cache::forget('algorithm_segment_rules');
    }

    // =========================================================
    // CONFIG LOADING
    // =========================================================

    protected function loadConfig(): void
    {
        $config = Cache::remember('algorithm_config', 300, function () {
            return DB::table('algorithm_config')
                ->whereIn('key', ['weights', 'signal_toggles'])
                ->pluck('value', 'key')
                ->map(fn($v) => json_decode($v, true))
                ->toArray();
        });

        $this->weights  = $config['weights']        ?? $this->defaultWeights();
        $this->toggles  = $config['signal_toggles'] ?? $this->defaultToggles();

        $this->segmentRules = Cache::remember('algorithm_segment_rules', 300, function () {
            return DB::table('algorithm_segment_rules')
                ->where('is_active', 1)
                ->get()
                ->map(fn($r) => [
                    'condition'    => json_decode($r->condition_json, true),
                    'boost_signal' => $r->boost_signal,
                    'boost_percent'=> (float) $r->boost_percent,
                ])
                ->toArray();
        });
    }

    // =========================================================
    // SIGNAL COMPUTATION
    // =========================================================

    protected function computeRawSignals(Customer $customer): array
    {
        $signals = [];

        // Recency: days since last order, normalised to 0-100
        if ($this->toggles['recency'] ?? true) {
            $days = $customer->last_order_date
                ? now()->diffInDays($customer->last_order_date)
                : 365;
            $signals['recency'] = max(0, round(100 - ($days / 3.65)));
        }

        // Frequency: log scale, capped at 100
        if ($this->toggles['frequency'] ?? true) {
            $orders = (int) $customer->total_orders;
            $signals['frequency'] = $orders > 0
                ? min(100, round(log($orders + 1) / log(50) * 100))
                : 0;
        }

        // Monetary: percent rank against active customers
        if ($this->toggles['monetary'] ?? true) {
            $signals['monetary'] = $this->monetaryPercentRank($customer);
        }

        // Loyalty: points / 100, capped
        if ($this->toggles['loyalty'] ?? true) {
            $signals['loyalty'] = min(100, round((int) $customer->loyalty_points / 100));
        }

        // Engagement: reviews + bids + quote requests
        if ($this->toggles['engagement'] ?? true) {
            $signals['engagement'] = $this->engagementScore($customer);
        }

        // Service affinity: bookings + service order items
        if ($this->toggles['service'] ?? true) {
            $signals['service'] = $this->serviceScore($customer);
        }

        // Referral: completed referrals * 20
        if ($this->toggles['referral'] ?? true) {
            $signals['referral'] = $this->referralScore($customer);
        }

        return $signals;
    }

    protected function monetaryPercentRank(Customer $customer): int
    {
        $total = DB::table('customers')->whereNull('deleted_at')->count();
        if ($total <= 1) return 100;

        $below = DB::table('customers')
            ->whereNull('deleted_at')
            ->where('total_spent', '<', $customer->total_spent)
            ->count();

        return (int) round(($below / ($total - 1)) * 100);
    }

    protected function engagementScore(Customer $customer): int
    {
        // product_reviews joins on user_id; auction_bids on bidder_id (= user_id)
        $reviews = DB::table('product_reviews')
            ->where('user_id', $customer->user_id)
            ->count();

        $bids = DB::table('auction_bids')
            ->where('bidder_id', $customer->user_id)
            ->count();

        $quotes = DB::table('quote_requests')
            ->where('customer_id', $customer->id)
            ->count();

        return min(100, ($reviews * 20) + ($bids * 10) + ($quotes * 15));
    }

    protected function serviceScore(Customer $customer): int
    {
        $bookings = DB::table('bookings')
            ->where('customer_id', $customer->id)
            ->where('status', '!=', 'cancelled')
            ->count();

        $serviceItems = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.customer_id', $customer->id)
            ->whereIn('order_items.item_type', ['service', 'custom_service'])
            ->count();

        return min(100, ($bookings * 25) + ($serviceItems * 15));
    }

    protected function referralScore(Customer $customer): int
    {
        $referrals = DB::table('referral_code_usage')
            ->where('referrer_id', $customer->user_id)
            ->where('status', 'completed')
            ->count();

        return min(100, $referrals * 20);
    }

    // =========================================================
    // WEIGHTING
    // =========================================================

    protected function applyWeights(array $raw): array
    {
        $totalWeight = array_sum($this->weights) ?: 100;
        $weighted    = [];

        foreach ($raw as $signal => $score) {
            $weight             = ($this->weights[$signal] ?? 0) / $totalWeight;
            $weighted[$signal]  = round($score * $weight, 4);
        }

        return $weighted;
    }

    // =========================================================
    // SEGMENT RULES
    // =========================================================

    protected function applySegmentRules(Customer $customer, array $weighted): array
    {
        foreach ($this->segmentRules as $rule) {
            if (!$this->matchesCondition($customer, $rule['condition'])) {
                continue;
            }

            $signal = $rule['boost_signal'];
            if (isset($weighted[$signal])) {
                $boost            = $weighted[$signal] * ($rule['boost_percent'] / 100);
                $weighted[$signal] = round($weighted[$signal] + $boost, 4);
            }
        }

        return $weighted;
    }

    protected function matchesCondition(Customer $customer, array $condition): bool
    {
        $field    = $condition['field']    ?? null;
        $operator = $condition['operator'] ?? '=';
        $value    = $condition['value']    ?? null;

        if (!$field) return false;

        $actual = $customer->$field ?? null;

        return match ($operator) {
            '='    => $actual == $value,
            '!='   => $actual != $value,
            '>'    => $actual >  $value,
            '>='   => $actual >= $value,
            '<'    => $actual <  $value,
            '<='   => $actual <= $value,
            default => false,
        };
    }

    // =========================================================
    // DEFAULTS (fallback if DB has no config yet)
    // =========================================================

    protected function defaultWeights(): array
    {
        return [
            'recency'    => 25,
            'frequency'  => 20,
            'monetary'   => 20,
            'loyalty'    => 15,
            'engagement' => 10,
            'service'    =>  5,
            'referral'   =>  5,
        ];
    }

    protected function defaultToggles(): array
    {
        return array_fill_keys(
            ['recency', 'frequency', 'monetary', 'loyalty', 'engagement', 'service', 'referral'],
            true
        );
    }
}