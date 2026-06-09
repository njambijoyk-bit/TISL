<?php

namespace App\Services\Chat;

use App\Models\Customer;
use App\Models\MimiSession;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class MimiSessionService
{
    // A session is considered stale after this many minutes of inactivity
    private const SESSION_TTL_MINUTES = 60;

    /**
     * Resolve an existing active session or create a new one.
     *
     * Reads X-Mimi-Session header from the request.
     * The resolved/created session token is stored back on the request
     * as $request->attributes->set('mimi_session_token', ...) so the
     * controller can return it in the response header.
     */
    public function resolveOrCreate(Request $request, ?User $user): MimiSession
    {
        $token = $request->header('X-Mimi-Session');

        // Try to find an existing active, non-expired session
        if ($token) {
            $session = MimiSession::where('session_token', $token)
                ->where('status', 'active')
                ->where('last_active_at', '>=', now()->subMinutes(self::SESSION_TTL_MINUTES))
                ->first();

            if ($session) {
                // Re-validate actor hasn't changed (token reuse across accounts)
                if ($this->actorMatches($session, $user, $request->ip())) {
                    $request->attributes->set('mimi_session_token', $session->session_token);
                    return $session;
                }
                // Actor mismatch — close old session and start fresh
                $this->closeSession($session, 'ended');
            }
        }

        // Create a new session
        $session = $this->createSession($request, $user);
        $request->attributes->set('mimi_session_token', $session->session_token);
        return $session;
    }

    /**
     * Bump last_active_at and increment message_count.
     */
    public function touchActive(MimiSession $session): void
    {
        $session->increment('message_count');
        $session->update(['last_active_at' => now()]);
    }

    /**
     * Increment failed_count (used when Gemini fails or query is blocked/harmful).
     */
    public function touchFailed(MimiSession $session): void
    {
        $session->increment('failed_count');
        $session->update(['last_active_at' => now()]);
    }

    /**
     * Close a session with the given status.
     */
    public function closeSession(MimiSession $session, string $status = 'ended'): void
    {
        $session->update([
            'status'   => $status,
            'ended_at' => now(),
        ]);
    }

    /**
     * Mark a session as blocked (called after a block is confirmed).
     */
    public function markBlocked(MimiSession $session, string $reason): void
    {
        $session->update([
            'status'      => 'blocked',
            'is_blocked'  => true,
            'block_reason'=> $reason,
            'blocked_at'  => now(),
            'ended_at'    => now(),
        ]);
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private function createSession(Request $request, ?User $user): MimiSession
    {
        [$actorType, $customerId, $userId, $displayName, $customerNumber, $age, $tier, $type]
            = $this->resolveActorData($user);

        return MimiSession::create([
            'session_token'      => Str::random(64),
            'actor_type'         => $actorType,
            'customer_id'        => $customerId,
            'user_id'            => $userId,
            'actor_display_name' => $displayName,
            'customer_number'    => $customerNumber,
            'customer_age'       => $age,
            'customer_tier'      => $tier,
            'customer_type'      => $type,
            'ip_address'         => $request->ip(),
            'user_agent'         => substr($request->userAgent() ?? '', 0, 300),
            'started_at'         => now(),
            'last_active_at'     => now(),
            'status'             => 'active',
            'message_count'      => 0,
            'failed_count'       => 0,
        ]);
    }

    /**
     * Resolve actor identity and snapshot their data at session start.
     *
     * Priority:
     *   1. Authenticated + has Customer record  → actor_type = 'customer'
     *   2. Authenticated + no Customer record   → actor_type = 'staff'
     *   3. Not authenticated                    → actor_type = 'guest'
     *
     * Age is calculated from Customer.birthday and frozen at session start.
     * Staff never get age logged.
     */
    private function resolveActorData(?User $user): array
    {
        if (!$user) {
            // Guest
            return ['guest', null, null, null, null, null, null, null];
        }

        // Try customer record
        $customer = Customer::where('user_id', $user->id)->first();

        if ($customer) {
            $displayName = trim("{$customer->first_name} {$customer->last_name}");
            $age = $customer->birthday
                ? Carbon::parse($customer->birthday)->age
                : null;

            return [
                'customer',
                $customer->id,
                $user->id,
                $displayName,
                $customer->customer_number,
                $age,
                $customer->tier        ?? null,
                $customer->customer_type ?? null,
            ];
        }

        // Staff/admin — use User.name, no age
        return [
            'staff',
            null,
            $user->id,
            $user->name,
            null,   // no customer_number
            null,   // no age for staff
            null,
            null,
        ];
    }

    /**
     * Ensure the session still belongs to the same actor.
     * Prevents a logged-out guest from reusing a customer's session token.
     */
    private function actorMatches(MimiSession $session, ?User $user, string $ip): bool
    {
        if (!$user) {
            // Guest: session must be a guest session and same IP
            return $session->isGuest() && $session->ip_address === $ip;
        }

        $customer = Customer::where('user_id', $user->id)->first();

        if ($customer) {
            return $session->isCustomer() && $session->customer_id === $customer->id;
        }

        return $session->isStaff() && $session->user_id === $user->id;
    }
}
