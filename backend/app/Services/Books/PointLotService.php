<?php

namespace App\Services\Books;

use App\Models\Customer;
use App\Models\LoyaltyPointTransaction;
use Illuminate\Support\Facades\DB;

/**
 * Loyalty points are a units ledger with lots. Every earn is a lot: points, the value of one point on the
 * day it was earned (`unit_value`, base currency) and how many are still unspent (`remaining`).
 * Spending, deducting, reversing and expiring consume lots — the one being reversed first, then those
 * expiring soonest, then the oldest — and release exactly the value those lots carry. The Loyalty Points
 * Liability therefore always equals the sum of the lots, whatever the point value does later.
 */
class PointLotService
{
    /** Value of one point in base currency today. */
    public function unitValue(): float
    {
        return app(RewardService::class)->pointValue();
    }

    /**
     * Give lots to a customer's older points (recorded before lots existed). Idempotent; call it before
     * any new movement. Existing balances are replayed: what was spent came out of the soonest-expiring
     * (then oldest) points first, the rest are still held — valued at today's point value.
     */
    public function ensureLots(Customer $customer): void
    {
        $unlotted = LoyaltyPointTransaction::where('customer_id', $customer->id)->where('points', '>', 0)->whereNull('unit_value')->exists();
        if (! $unlotted) {
            return;
        }
        DB::transaction(function () use ($customer) {
            $consumed = -(int) LoyaltyPointTransaction::where('customer_id', $customer->id)->where('points', '<', 0)->where('type', '!=', 'expiry')->sum('points');
            $rows = LoyaltyPointTransaction::where('customer_id', $customer->id)->where('points', '>', 0)->whereNull('unit_value')
                ->orderByRaw('expires_at IS NULL')->orderBy('expires_at')->orderBy('id')->lockForUpdate()->get();
            $value = $this->unitValue();
            $cum = 0;
            foreach ($rows as $lot) {
                $cum += (int) $lot->points;
                $remaining = $lot->expired_at ? 0 : max(0, min((int) $lot->points, $cum - $consumed));
                $lot->update(['unit_value' => $value, 'remaining' => $remaining]);
            }
        });
    }

    /**
     * Apply a freshly written movement to the lots and return its value in base currency.
     *   earn (points > 0)  → the transaction becomes a lot at today's point value
     *   spend (points < 0) → lots are consumed; $onlyLotId limits it to one lot (that lot expiring)
     * The breakdown is kept on the transaction so every release can be traced.
     */
    public function apply(Customer $customer, LoyaltyPointTransaction $tx, ?int $onlyLotId = null, ?int $preferReferenceId = null): float
    {
        if ($tx->points > 0) {
            $unit = $this->unitValue();
            $value = round($tx->points * $unit, 2);
            $tx->update(['unit_value' => $unit, 'remaining' => $tx->points, 'metadata' => array_merge($tx->metadata ?? [], ['value' => $value])]);

            return $value;
        }
        $need = abs((int) $tx->points);
        $q = LoyaltyPointTransaction::where('customer_id', $customer->id)->where('points', '>', 0)->whereNotNull('unit_value')
            ->where('remaining', '>', 0)->where('id', '!=', $tx->id);
        if ($onlyLotId) {
            $q->where('id', $onlyLotId);   // the lot that is lapsing (already stamped expired)
        } else {
            $q->whereNull('expired_at');
            if ($preferReferenceId) {
                $q->orderByRaw('CASE WHEN reference_id = ? THEN 0 ELSE 1 END', [$preferReferenceId]);
            }
            $q->orderByRaw('expires_at IS NULL')->orderBy('expires_at')->orderBy('id');
        }
        $value = 0.0;
        $breakdown = [];
        foreach ($q->lockForUpdate()->get() as $lot) {
            if ($need <= 0) {
                break;
            }
            $take = min($need, (int) $lot->remaining);
            $value += $take * (float) $lot->unit_value;
            $breakdown[] = ['lot' => $lot->id, 'points' => $take, 'unit_value' => (float) $lot->unit_value];
            $lot->update(['remaining' => (int) $lot->remaining - $take]);
            $need -= $take;
        }
        if ($need > 0 && ! $onlyLotId) {
            // points with no lot behind them (old data that could not be replayed) go at today's value
            $value += $need * $this->unitValue();
            $breakdown[] = ['lot' => null, 'points' => $need, 'unit_value' => $this->unitValue()];
        }
        $value = round($value, 2);
        $tx->update(['metadata' => array_merge($tx->metadata ?? [], ['value' => $value, 'lots' => $breakdown])]);

        return $value;
    }

    /**
     * What the Loyalty Points Liability should be: the value of every lot still held. Customers whose
     * older points have not been given lots yet are counted at today's point value.
     *
     * @return array{value: float, points: int}
     */
    public function liability(): array
    {
        $unlotted = LoyaltyPointTransaction::where('points', '>', 0)->whereNull('unit_value')->distinct()->pluck('customer_id')->all();
        $lotted = LoyaltyPointTransaction::where('points', '>', 0)->whereNotNull('unit_value')->where('remaining', '>', 0)
            ->when($unlotted, fn ($q) => $q->whereNotIn('customer_id', $unlotted))
            ->sum(DB::raw('remaining * unit_value'));
        $old = $unlotted ? (int) Customer::whereIn('id', $unlotted)->sum('loyalty_points') : 0;
        // points a customer holds with no transaction behind them at all (data entered by hand) are valued too
        $orphan = (int) Customer::where('loyalty_points', '>', 0)
            ->whereNotIn('id', LoyaltyPointTransaction::where('points', '>', 0)->distinct()->pluck('customer_id'))->sum('loyalty_points');

        return [
            'value'  => round((float) $lotted + ($old + $orphan) * $this->unitValue(), 2),
            'points' => (int) Customer::sum('loyalty_points'),
        ];
    }
}
