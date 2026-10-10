<?php

namespace App\Services\Security;

/** What each line of the security log means, in plain words (the admin page shows these, never the raw names). */
final class SecurityEvents
{
    /** event => [what it says, the kind of line it usually is] */
    public const CATALOG = [
        'sign_in' => ['Signed in', SecurityLog::INFO],
        'sign_out' => ['Signed out', SecurityLog::INFO],
        'sign_in_failed' => ['Wrong password', SecurityLog::NOTICE],
        'sign_in_blocked' => ['Made to wait after wrong passwords', SecurityLog::WARNING],
        'sign_in_refused' => ['Right password, but the account may not sign in', SecurityLog::WARNING],
        'sign_in_under_attack' => ['Many wrong passwords for one email, from anywhere', SecurityLog::ALERT],
        'rate_limited' => ['Too many requests, turned away', SecurityLog::WARNING],
        'password_changed' => ['Password changed', SecurityLog::NOTICE],
        'password_reset' => ['Password reset by email', SecurityLog::WARNING],
        'password_reset_forced' => ['Password reset required by an administrator', SecurityLog::WARNING],
        'password_reset_by_admin' => ['Password set by an administrator', SecurityLog::WARNING],
        'passkey_added' => ['A passkey was added', SecurityLog::NOTICE],
        'passkey_removed' => ['A passkey was removed', SecurityLog::WARNING],
        'passkey_renamed' => ['A passkey was renamed', SecurityLog::INFO],
        'passkey_proved' => ['A passkey was used to confirm it is really them', SecurityLog::INFO],
        'passkey_rejected' => ['A passkey was turned away', SecurityLog::NOTICE],
        'passkey_clone_suspected' => ['A passkey looked copied and was switched off', SecurityLog::ALERT],
        'passkey_policy_would_restrict' => ['Would have been held to the passkey rule (test mode, nobody was stopped)', SecurityLog::INFO],
        'passkey_policy_restricted' => ['Held to the passkey rule: could only add or use a passkey', SecurityLog::NOTICE],
        'passkey_policy_changed' => ['The passkey rule was changed', SecurityLog::WARNING],
        'secure_account' => ['"This was not me" used: everyone signed out', SecurityLog::ALERT],
        'session_ended' => ['A signed-in device was ended', SecurityLog::NOTICE],
        'sessions_ended' => ['Signed-in devices were ended', SecurityLog::NOTICE],
    ];

    public static function label(string $event): string
    {
        return self::CATALOG[$event][0] ?? ucfirst(str_replace('_', ' ', $event));
    }

    /** @return array<int, array{event: string, label: string}> */
    public static function all(): array
    {
        $out = [];
        foreach (self::CATALOG as $event => [$label]) {
            $out[] = ['event' => $event, 'label' => $label];
        }

        return $out;
    }
}
