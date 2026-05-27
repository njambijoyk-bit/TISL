<?php

namespace App\Http\Controllers\Api\Traits;

use App\Models\ReferralCode;
use App\Models\ReferralCodeUsage;
use App\Models\ReferralActivityLog;
use App\Models\Order;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

trait LogsReferralActivity
{
    // ─────────────────────────────────────────────────────────────────────────
    //  CORE LOGGER
    // ─────────────────────────────────────────────────────────────────────────

    protected function logReferralActivity(
        string $entityType,
        int    $entityId,
        string $action,
        array  $metadata = [],
        ?int   $orderId  = null,
        ?float $amount   = null,
    ): void {
        try {
            $user = Auth::user();

            ReferralActivityLog::create([
                'entity_type'   => $entityType,
                'entity_id'     => $entityId,
                'action'        => $action,
                'actor_user_id' => $user?->id,
                'actor_type'    => $this->resolveActorType($user),
                'order_id'      => $orderId,
                'amount'        => $amount,
                'metadata'      => $metadata,
                'created_at'    => now(),
            ]);
        } catch (\Exception $e) {
            Log::warning("LogsReferralActivity: failed to log {$action} on {$entityType}#{$entityId}: " . $e->getMessage());
        }
    }

    private function resolveActorType($user): string
    {
        if (!$user) return 'system';
        $adminRoles = ['super_admin', 'admin', 'finance', 'logistics', 'driver'];
        return in_array($user->role, $adminRoles) ? 'admin' : 'customer';
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  PROMO CODE — LIFECYCLE
    // ─────────────────────────────────────────────────────────────────────────

    protected function logPromoCreated(ReferralCode $code): void
    {
        $this->logReferralActivity('promo_code', $code->id, 'CREATED', [
            'code'                  => $code->code,
            'name'                  => $code->name,
            'type'                  => $code->type,
            'reward_type'           => $code->reward_type,
            'reward_value'          => $code->reward_value,
            'max_uses'              => $code->max_uses,
            'max_uses_per_customer' => $code->max_uses_per_customer,
            'valid_from'            => $code->valid_from,
            'valid_until'           => $code->valid_until,
            'target_customer_id'    => $code->target_customer_id,
            'is_public'             => $code->is_public,
            'status'                => $code->status,
        ]);
    }

    protected function logPromoUpdated(ReferralCode $code, array $changes): void
    {
        $this->logReferralActivity('promo_code', $code->id, 'UPDATED', [
            'code'    => $code->code,
            'changes' => $changes,
        ]);
    }

    protected function logPromoStatusChanged(ReferralCode $code, string $action): void
    {
        // $action: ACTIVATED | PAUSED | ARCHIVED | DELETED
        $this->logReferralActivity('promo_code', $code->id, $action, [
            'code'        => $code->code,
            'name'        => $code->name,
            'times_used'  => $code->times_used,
            'status_was'  => $code->getOriginal('status') ?? $code->status,
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  PROMO CODE — USAGE & REVERSAL
    // ─────────────────────────────────────────────────────────────────────────

    protected function logPromoUsed(ReferralCode $code, Order $order, float $discountApplied): void
    {
        $this->logReferralActivity('promo_code', $code->id, 'USED', [
            'code'             => $code->code,
            'order_number'     => $order->order_number,
            'customer_id'      => $order->customer_id,
            'order_currency'   => $order->currency,
            'discount_applied' => $discountApplied,
            'discount_kes'     => round($discountApplied * ((float) ($order->exchange_rate_to_kes ?? 1)), 2),
            'order_subtotal'   => $order->subtotal,
            'times_used_after' => $code->fresh()->times_used,
        ], $order->id, $discountApplied);
    }

    /**
     * Reverse a promo code's counters when the linked order is cancelled.
     *
     * - Decrements times_used (floor 0)
     * - Subtracts from total_revenue and total_discount_given (floor 0)
     * - Re-activates the code if it was depleted due to this usage
     * - Logs the full reversal with before/after values and who triggered it
     *
     * Replaces any direct markAsCancelled call for promo codes in cancel methods.
     */
    protected function reversePromoCodeUsage(Order $order): void
    {
        if (!$order->promo_code_id) return;

        $code = ReferralCode::find($order->promo_code_id);
        if (!$code) return;

        $discountKes = round(
            (float) $order->promo_discount * ((float) ($order->exchange_rate_to_kes ?? 1)),
            2
        );
        $revenueKes = (float) ($order->subtotal_kes ?? round($order->subtotal * ($order->exchange_rate_to_kes ?? 1), 2));

        // Capture before-state for audit log
        $timesUsedBefore     = (int) $code->times_used;
        $revenueBefore       = (float) $code->total_revenue;
        $discountGivenBefore = (float) $code->total_discount_given;
        $statusBefore        = $code->status;

        $newTimesUsed       = max(0, $timesUsedBefore - 1);
        $newRevenue         = max(0.0, $revenueBefore - $revenueKes);
        $newDiscountGiven   = max(0.0, $discountGivenBefore - $discountKes);

        $code->update([
            'times_used'           => $newTimesUsed,
            'total_revenue'        => $newRevenue,
            'total_discount_given' => $newDiscountGiven,
        ]);

        // Re-activate if depleted solely because of this order's usage
        if ($statusBefore === 'depleted' && $code->max_uses && $newTimesUsed < $code->max_uses) {
            $code->update(['status' => 'active']);
        }

        $this->logReferralActivity('promo_code', $code->id, 'REVERSED', [
            'code'                   => $code->code,
            'order_number'           => $order->order_number,
            'customer_id'            => $order->customer_id,
            'discount_reversed_kes'  => $discountKes,
            'revenue_reversed_kes'   => $revenueKes,
            'times_used_before'      => $timesUsedBefore,
            'times_used_after'       => $newTimesUsed,
            'revenue_before'         => $revenueBefore,
            'revenue_after'          => $newRevenue,
            'discount_given_before'  => $discountGivenBefore,
            'discount_given_after'   => $newDiscountGiven,
            'status_before'          => $statusBefore,
            'status_after'           => $code->fresh()->status,
            'cancelled_by'           => $this->resolveActorType(Auth::user()),
        ], $order->id, $discountKes);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  REFERRAL CODE — LIFECYCLE
    // ─────────────────────────────────────────────────────────────────────────

    protected function logReferralCodeCreated(ReferralCode $code): void
    {
        $this->logReferralActivity('referral_code', $code->id, 'CREATED', [
            'code'                  => $code->code,
            'name'                  => $code->name,
            'type'                  => $code->type,
            'customer_id'           => $code->customer_id,
            'reward_type'           => $code->reward_type,
            'reward_value'          => $code->reward_value,
            'referrer_reward_type'  => $code->referrer_reward_type,
            'referrer_reward_value' => $code->referrer_reward_value,
            'auto_generated'        => (bool) ($code->auto_generated ?? false),
            'valid_until'           => $code->valid_until,
        ]);
    }

    protected function logReferralCodeUpdated(ReferralCode $code, array $changes): void
    {
        $this->logReferralActivity('referral_code', $code->id, 'UPDATED', [
            'code'    => $code->code,
            'changes' => $changes,
        ]);
    }

    protected function logReferralCodeStatusChanged(ReferralCode $code, string $action): void
    {
        $this->logReferralActivity('referral_code', $code->id, $action, [
            'code'       => $code->code,
            'times_used' => $code->times_used,
            'status_was' => $code->getOriginal('status') ?? $code->status,
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  REFERRAL CODE — USAGE & REVERSAL
    // ─────────────────────────────────────────────────────────────────────────

    protected function logReferralUsed(ReferralCode $code, Order $order, float $discountApplied): void
    {
        $this->logReferralActivity('referral_code', $code->id, 'USED', [
            'code'             => $code->code,
            'order_number'     => $order->order_number,
            'customer_id'      => $order->customer_id,
            'referrer_id'      => $code->customer_id,
            'discount_applied' => $discountApplied,
            'discount_kes'     => round($discountApplied * ((float) ($order->exchange_rate_to_kes ?? 1)), 2),
            'order_subtotal'   => $order->subtotal,
        ], $order->id, $discountApplied);
    }

    /**
     * Cancel referral code usage when the linked order is cancelled.
     *
     * Calls ReferralCodeUsage::markAsCancelled() which internally handles
     * reward reversal if the referrer was already paid. Also logs the full
     * event with reward state for accountability.
     *
     * Replaces the direct markAsCancelled() calls in cancel methods.
     */
    protected function reverseReferralCodeUsage(Order $order): void
    {
        if (!$order->referral_code_id) return;

        $usage = ReferralCodeUsage::where('order_id', $order->id)
            ->where('referral_code_id', $order->referral_code_id)
            ->first();

        if (!$usage) return;

        // Capture before-state for audit log
        $rewardWasPaid  = (bool) $usage->referrer_reward_paid;
        $rewardAmount   = (float) $usage->referrer_reward_amount;
        $rewardType     = $usage->referrer_reward_type;
        $statusBefore   = $usage->status;

        // Handles reward reversal internally if referrer was already paid
        $usage->markAsCancelled();

        $this->logReferralActivity('referral_code', $order->referral_code_id, 'CANCELLED', [
            'order_number'          => $order->order_number,
            'customer_id'           => $order->customer_id,
            'referrer_id'           => $usage->referrer_id,
            'discount_amount'       => $order->referral_discount,
            'discount_kes'          => round(
                (float) $order->referral_discount * ((float) ($order->exchange_rate_to_kes ?? 1)),
                2
            ),
            'usage_status_before'   => $statusBefore,
            'reward_was_paid'       => $rewardWasPaid,
            'reward_reversed'       => $rewardWasPaid, // only reversed if it was already paid
            'reward_amount'         => $rewardAmount,
            'reward_type'           => $rewardType,
            'cancelled_by'          => $this->resolveActorType(Auth::user()),
        ], $order->id, (float) $order->referral_discount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  REFERRAL REWARDS — called from ReferralCodeUsage if needed externally
    // ─────────────────────────────────────────────────────────────────────────

    protected function logReferralRewardPaid(ReferralCodeUsage $usage): void
    {
        $this->logReferralActivity('referral_code', $usage->referral_code_id, 'REWARD_PAID', [
            'referrer_id'   => $usage->referrer_id,
            'customer_id'   => $usage->customer_id,
            'reward_type'   => $usage->referrer_reward_type,
            'reward_amount' => $usage->referrer_reward_amount,
            'order_id'      => $usage->order_id,
        ], $usage->order_id, (float) $usage->referrer_reward_amount);
    }

    protected function logReferralRewardReversed(ReferralCodeUsage $usage): void
    {
        $this->logReferralActivity('referral_code', $usage->referral_code_id, 'REWARD_REVERSED', [
            'referrer_id'   => $usage->referrer_id,
            'customer_id'   => $usage->customer_id,
            'reward_type'   => $usage->referrer_reward_type,
            'reward_amount' => $usage->referrer_reward_amount,
            'order_id'      => $usage->order_id,
        ], $usage->order_id, (float) $usage->referrer_reward_amount);
    }

    /**
     * Re-apply promo code stats when a cancelled order is restored.
     * Mirror image of reversePromoCodeUsage().
     */
    protected function restorePromoCodeUsage(Order $order): void
    {
        if (!$order->promo_code_id) return;

        $code = ReferralCode::find($order->promo_code_id);
        if (!$code) return;

        $discountKes = round(
            (float) $order->promo_discount * ((float) ($order->exchange_rate_to_kes ?? 1)),
            2
        );
        $revenueKes = (float) ($order->subtotal_kes ?? round($order->subtotal * ($order->exchange_rate_to_kes ?? 1), 2));

        $timesUsedBefore     = (int)   $code->times_used;
        $revenueBefore       = (float) $code->total_revenue;
        $discountGivenBefore = (float) $code->total_discount_given;
        $statusBefore        = $code->status;

        $newTimesUsed     = $timesUsedBefore + 1;
        $newRevenue       = $revenueBefore + $revenueKes;
        $newDiscountGiven = $discountGivenBefore + $discountKes;

        $code->update([
            'times_used'           => $newTimesUsed,
            'total_revenue'        => $newRevenue,
            'total_discount_given' => $newDiscountGiven,
        ]);

        // Re-deplete if max_uses is hit again
        if ($code->status === 'active' && $code->max_uses && $newTimesUsed >= $code->max_uses) {
            $code->update(['status' => 'depleted']);
        }

        $this->logReferralActivity('promo_code', $code->id, 'RESTORED', [
            'code'                  => $code->code,
            'order_number'          => $order->order_number,
            'customer_id'           => $order->customer_id,
            'discount_restored_kes' => $discountKes,
            'revenue_restored_kes'  => $revenueKes,
            'times_used_before'     => $timesUsedBefore,
            'times_used_after'      => $newTimesUsed,
            'status_before'         => $statusBefore,
            'status_after'          => $code->fresh()->status,
            'restored_by'           => $this->resolveActorType(Auth::user()),
        ], $order->id, $discountKes);
    }

    /**
     * Re-mark referral usage as completed when a cancelled order is restored.
     * Mirror image of reverseReferralCodeUsage().
     */
    protected function restoreReferralCodeUsage(Order $order): void
    {
        if (!$order->referral_code_id) return;

        $usage = ReferralCodeUsage::where('order_id', $order->id)
            ->where('referral_code_id', $order->referral_code_id)
            ->where('status', 'cancelled')
            ->first();

        if (!$usage) return;

        $rewardWasReversed = $usage->referrer_id
            && $usage->referrer_reward_amount > 0
            && !$usage->referrer_reward_paid;

        // Re-mark as completed
        $usage->update([
            'status'       => 'completed',
            'completed_at' => $usage->completed_at ?? now(),
        ]);

        // Re-process the referrer reward only if it was reversed during cancellation
        if ($rewardWasReversed) {
            $usage->restoreFromCancellation();
        }

        $this->logReferralActivity('referral_code', $order->referral_code_id, 'RESTORED', [
            'order_number'        => $order->order_number,
            'customer_id'         => $order->customer_id,
            'referrer_id'         => $usage->referrer_id,
            'discount_amount'     => $order->referral_discount,
            'reward_re_processed' => $rewardWasReversed,
            'reward_amount'       => (float) $usage->referrer_reward_amount,
            'reward_type'         => $usage->referrer_reward_type,
            'restored_by'         => $this->resolveActorType(Auth::user()),
        ], $order->id, (float) $order->referral_discount);
    }
}