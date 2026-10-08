<?php

namespace App\Policies;

use App\Models\Payment;
use App\Models\User;

class PaymentPolicy
{
    private function isSuperAdmin(User $user): bool
    {
        return $user->holdsAny(['super_admin']);
    }

    private function isFinanceOrSuper(User $user): bool
    {
        return $user->holdsAny(['finance', 'super_admin']);
    }

    // ─── Who can see the payments list ───────────────────────────────────────
    public function viewAny(User $user): bool
    {
        return $user->holdsAny([
            'super_admin', 'admin', 'manager', 'finance', 'sales_rep', 'logistics', 'driver'
        ]);
    }

    // ─── Who can see a single payment record ─────────────────────────────────
    public function view(User $user, Payment $payment): bool
    {
        if ($user->holdsAny(['finance', 'admin', 'super_admin'])) {
            // Super admin sees all, admin sees all, finance sees only their own
            return $this->isSuperAdmin($user) 
                || $user->holdsAny(['admin']) 
                || $payment->initiated_by === $user->id;
        }
        return $user->holdsAny(['manager']);
    }

    // ─── Who can initiate an STK push ────────────────────────────────────────
    public function create(User $user): bool
    {
        return $user->holdsAny(['finance', 'admin', 'super_admin']);
    }

    // ─── Who can update pending/failed payments ───────────────────────────────
    public function update(User $user, Payment $payment): bool
    {
        if (in_array($payment->status, ['confirmed', 'refunded'])) {
            return false; // Immutable — nobody touches these
        }

        if ($this->isFinanceOrSuper($user)) {
            // Super admin can update any payment in editable state
            if ($this->isSuperAdmin($user)) {
                return in_array($payment->status, ['pending', 'failed', 'cancelled']);
            }
            // Finance can only update their own
            return $payment->initiated_by === $user->id
                && in_array($payment->status, ['pending', 'failed', 'cancelled']);
        }

        return $user->holdsAny(['admin']);
    }

    // ─── Who can cancel a pending push ───────────────────────────────────────
    public function cancel(User $user, Payment $payment): bool
    {
        if ($payment->status !== 'pending') return false;
        
        if ($user->holdsAny(['finance', 'admin', 'super_admin'])) {
            return $this->isSuperAdmin($user) 
                || $user->holdsAny(['admin']) 
                || $payment->initiated_by === $user->id;
        }
        return false;
    }

    // ─── Who can retry a failed/cancelled push ────────────────────────────────
    public function retry(User $user, Payment $payment): bool
    {
        if (!in_array($payment->status, ['failed', 'cancelled'])) return false;
        return $user->holdsAny(['finance', 'admin', 'super_admin']);
    }

    // ─── Who can raise a dispute ──────────────────────────────────────────────
    public function raiseDispute(User $user, Payment $payment): bool
    {
        if ($payment->status !== 'confirmed') {
            return false;
        }

        if ($payment->dispute_status !== 'none') {
            return false;
        }

        return $user->holdsAny(['finance', 'super_admin', 'admin']);
    }

    // ─── Who can resolve/reject a dispute ─────────────────────────────────────
    public function resolveDispute(User $user, Payment $payment): bool
    {
        if (!in_array($payment->dispute_status, ['raised', 'investigating'])) {
            return false;
        }

        // Finance cannot resolve their own disputes — conflict of interest
        // Super admin is exempt from this restriction
        if ($user->holdsAny(['finance'])) {
            return false;
        }

        return $user->holdsAny(['super_admin', 'admin']);
    }

    // ─── Who can append admin_notes ───────────────────────────────────────────
    public function addAdminNotes(User $user, Payment $payment): bool
    {
        return $user->holdsAny(['super_admin', 'admin', 'manager']);
    }

    // ─── Nobody deletes payment records. Ever. ────────────────────────────────
    public function delete(User $user, Payment $payment): bool
    {
        return false;
    }
}