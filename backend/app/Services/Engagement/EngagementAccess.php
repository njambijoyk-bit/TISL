<?php

namespace App\Services\Engagement;

use App\Models\User;

/**
 * Can this person do this action on this kind of thing right now? Reads the rule (EngagementRules), the engine's master switch, the module that owns
 * the thing, and, when the rule says so, proof of purchase. Limits and holds are applied when something is actually posted.
 */
class EngagementAccess
{
    public function __construct(private EngagementRules $rules, private PurchaseProof $proof) {}

    public function enabled(): bool
    {
        return $this->rules->settings()->enabled;
    }

    private function isStaff(?User $u): bool
    {
        return $u && ($u->isStaff() || $u->canDrive());
    }

    /** Does the "who" setting let this visitor in (before any purchase check)? */
    public function whoAllows(?User $u, string $who): bool
    {
        return match ($who) {
            'everyone' => true,
            'signed_in' => (bool) $u,
            'customers' => $u && ! $this->isStaff($u),
            'staff' => $this->isStaff($u),
            default => false,
        };
    }

    /**
     * @return array{allowed:bool, reason:?string, rule:array, verified:bool, voucher_id:?int, guest:bool}
     */
    public function decide(?User $u, string $type, string $action, ?int $targetId = null): array
    {
        $rule = $this->rules->rule($type, $action);
        $out = fn (bool $ok, ?string $why = null, bool $verified = false, ?int $voucher = null) => ['allowed' => $ok, 'reason' => $why, 'rule' => $rule, 'verified' => $verified, 'voucher_id' => $voucher, 'guest' => ! $u];

        if (! $this->enabled() || ! EngagementTargets::has($type, $action) || ! EngagementTargets::available($type)) {
            return $out(false, 'This is not available.');
        }
        if (! $rule['enabled']) {
            return $out(false, 'This is switched off.');
        }
        if (! $this->whoAllows($u, $rule['who'])) {
            return $out(false, match ($rule['who']) { 'staff' => 'Only our team can do this.', 'customers' => $u ? 'Only customers can do this.' : 'Sign in to do this.', default => 'Sign in to do this.' });
        }
        if ($rule['must_have_bought'] && EngagementTargets::find($type)['commerce']) {
            if ($targetId === null) {
                return $out(true);   // asked only whether the control should show; the purchase is checked when they post
            }
            $p = $this->proof->check($u, $type, $targetId);

            return $p['ok'] ? $out(true, null, true, $p['voucher_id']) : $out(false, $p['reason']);
        }

        return $out(true, null, $targetId !== null && $u && EngagementTargets::find($type)['commerce'] ? $this->proof->check($u, $type, $targetId)['ok'] : false);
    }
}
