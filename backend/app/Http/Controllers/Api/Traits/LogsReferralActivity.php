<?php

namespace App\Http\Controllers\Api\Traits;

use App\Models\ReferralCode;
use App\Models\ReferralCodeUsage;
use App\Models\ReferralActivityLog;
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
        return $user->holdsAny($adminRoles) ? 'admin' : 'customer';
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

}