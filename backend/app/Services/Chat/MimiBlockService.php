<?php

namespace App\Services\Chat;

use App\Models\MimiBlockedActor;
use App\Models\User;
use Illuminate\Http\Request;

class MimiBlockService
{
    private const GENERIC_BLOCK_MESSAGE =
        'Your access to Mimi has been suspended due to a policy violation. Please contact support.';

    /**
     * Check if the current actor is blocked.
     * Priority: customer block → staff/user block → IP block (guest)
     *
     * Returns the active block record if blocked, null if clear.
     */
    public function checkBlocked(Request $request, ?User $user): ?MimiBlockedActor
    {
        // Authenticated: check by customer_id first, then user_id
        if ($user) {
            // Customer record takes precedence
            $customer = $user->customer;
            if ($customer) {
                $block = MimiBlockedActor::active()
                    ->forCustomer($customer->id)
                    ->first();
                if ($block) return $block;
            }

            // Fall back to user_id (staff or customer without customer record)
            $block = MimiBlockedActor::active()
                ->forUser($user->id)
                ->first();
            if ($block) return $block;
        }

        // Always check IP (catches guests; also secondary check for authed users)
        $block = MimiBlockedActor::active()
            ->forIp($request->ip())
            ->first();

        return $block;
    }

    /**
     * Block an actor.
     *
     * $data keys:
     *   actor_type  — 'customer' | 'staff' | 'guest_ip'
     *   customer_id — required if actor_type = customer
     *   user_id     — required if actor_type = staff
     *   ip_address  — required if actor_type = guest_ip
     *   reason      — shown to user (optional but recommended)
     *   notes       — internal only (optional)
     *   expires_at  — Carbon|string|null (null = permanent)
     */
    public function blockActor(array $data, User $blockedBy): MimiBlockedActor
    {
        // Deactivate any existing block for this actor first (clean slate)
        $this->deactivateExistingBlocks($data);

        return MimiBlockedActor::create([
            'actor_type'  => $data['actor_type'],
            'customer_id' => $data['customer_id'] ?? null,
            'user_id'     => $data['user_id']     ?? null,
            'ip_address'  => $data['ip_address']  ?? null,
            'reason'      => $data['reason']      ?? null,
            'notes'       => $data['notes']       ?? null,
            'expires_at'  => $data['expires_at']  ?? null,
            'blocked_by'  => $blockedBy->id,
            'blocked_at'  => now(),
            'is_active'   => true,
        ]);
    }

    /**
     * Deactivate a block by its ID.
     */
    public function unblock(int $blockId): bool
    {
        $block = MimiBlockedActor::findOrFail($blockId);
        $block->deactivate();
        return true;
    }

    /**
     * Return the message to show the blocked user.
     * Uses the admin's reason if set, generic message otherwise.
     */
    public function getBlockedMessage(?string $reason): string
    {
        return filled($reason) ? $reason : self::GENERIC_BLOCK_MESSAGE;
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private function deactivateExistingBlocks(array $data): void
    {
        $query = MimiBlockedActor::where('is_active', true)
            ->where('actor_type', $data['actor_type']);

        match ($data['actor_type']) {
            'customer' => $query->where('customer_id', $data['customer_id']),
            'staff'    => $query->where('user_id', $data['user_id']),
            'guest_ip' => $query->where('ip_address', $data['ip_address']),
        };

        $query->update(['is_active' => false]);
    }
}
