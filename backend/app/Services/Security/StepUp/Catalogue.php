<?php

namespace App\Services\Security\StepUp;

/**
 * The sensitive actions, in one list, the way the permission catalogue is one list. Each says how serious it is and what it asks of the person:
 *
 *  class      critical (can move money or change who may do what) or elevated
 *  strength   2 = a passkey checked with fingerprint, face or PIN; 1 = the password again will do
 *  fresh      minutes an approval may cover related actions, for rules that allow a run (`window`)
 *  reason     the person must say why, in a few words (it is written in the log)
 *  window     one approval covers a short run of the same kind of action; otherwise each action needs its own
 *  two        a second person must also approve (recorded now, enforced with the Council of Two)
 *
 * Whether a rule is asked at all is the owner's setting (off / test / on, see StepUp::mode), and starts off. Authorization always comes first: the route's own permission check runs before any question,
 * so nobody is ever asked to prove who they are for something they may not do.
 */
final class Catalogue
{
    /** @var array<string, array{label: string, class: string, strength: int, fresh: int, reason: bool, window: bool, two: bool, ignore: string[]}> */
    public const RULES = [
        'payment_keys' => ['label' => 'Change the payment keys', 'class' => 'critical', 'strength' => 2, 'fresh' => 5, 'reason' => true, 'window' => false, 'two' => false, 'ignore' => ['current_password']],
        'access_change' => ['label' => 'Change who may do what (roles, permissions, clearance, branch access)', 'class' => 'critical', 'strength' => 2, 'fresh' => 5, 'reason' => true, 'window' => false, 'two' => true, 'ignore' => []],
        'signin_reset' => ['label' => 'Reset someone\'s sign-in methods, or lower an account\'s strength', 'class' => 'critical', 'strength' => 2, 'fresh' => 5, 'reason' => true, 'window' => false, 'two' => true, 'ignore' => []],
        'security_settings' => ['label' => 'Change the security rules', 'class' => 'critical', 'strength' => 2, 'fresh' => 5, 'reason' => true, 'window' => false, 'two' => true, 'ignore' => ['confirm']],
        'payroll_run' => ['label' => 'Run or pay payroll', 'class' => 'critical', 'strength' => 2, 'fresh' => 5, 'reason' => true, 'window' => false, 'two' => true, 'ignore' => []],
        'backup_restore' => ['label' => 'Restore the database from a backup', 'class' => 'critical', 'strength' => 2, 'fresh' => 5, 'reason' => true, 'window' => false, 'two' => false, 'ignore' => []],
        'staff_account' => ['label' => 'Create, switch off or change the role of a staff account', 'class' => 'elevated', 'strength' => 2, 'fresh' => 10, 'reason' => false, 'window' => true, 'two' => false, 'ignore' => []],
        'export_bulk' => ['label' => 'Export a large list (customers, payroll, ledgers)', 'class' => 'elevated', 'strength' => 1, 'fresh' => 15, 'reason' => false, 'window' => true, 'two' => false, 'ignore' => []],
        'voucher_cancel' => ['label' => 'Cancel a posted voucher, or refund above the limit', 'class' => 'elevated', 'strength' => 1, 'fresh' => 10, 'reason' => false, 'window' => true, 'two' => false, 'ignore' => []],
        'bank_details' => ['label' => 'Change bank or payee details', 'class' => 'elevated', 'strength' => 1, 'fresh' => 10, 'reason' => false, 'window' => true, 'two' => false, 'ignore' => []],
    ];

    /** @return string[] */
    public static function keys(): array
    {
        return array_keys(self::RULES);
    }

    public static function has(string $key): bool
    {
        return isset(self::RULES[$key]);
    }

    /** @return array{label: string, class: string, strength: int, fresh: int, reason: bool, window: bool, two: bool, ignore: string[]} */
    public static function rule(string $key): array
    {
        return self::RULES[$key] ?? throw new \InvalidArgumentException("No step-up rule called {$key}.");
    }
}
