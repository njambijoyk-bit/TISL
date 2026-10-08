<?php

namespace App\Services\Access;

/** The answer to "may this person do this here, now?": allowed or not, and why. */
final class Decision
{
    private function __construct(public readonly bool $allowed, public readonly string $reason, public readonly ?string $role = null) {}

    public static function allow(?string $role = null): self
    {
        return new self(true, 'ok', $role);
    }

    public static function deny(string $reason): self
    {
        return new self(false, $reason);
    }

    public const MESSAGES = [
        'no_permission'     => 'You do not have permission to do that.',
        'module_off'        => 'That part of the system is not switched on.',
        'no_module_access'  => 'Your role does not include that part of the system.',
        'read_only'         => 'Your access is read-only.',
        'outside_hours'     => 'Your access is not available at this time.',
        'ip_blocked'        => 'Your access is not available from this place.',
        'outside_scope'     => 'You do not have access to that branch.',
        'inactive'          => 'Your account is not active.',
        'unknown_permission' => 'That permission does not exist.',
    ];

    public function message(): string
    {
        return self::MESSAGES[$this->reason] ?? 'Forbidden. You do not have permission to access this resource.';
    }
}
