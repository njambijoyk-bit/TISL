<?php

namespace App\Services\Chat\Local;

use App\Models\User;

/**
 * Who is asking, as the access engine sees them: the kind of account, what they may do, and how far their data reaches.
 * Built on the server from the signed-in user, never from anything the browser sends. No role names anywhere.
 */
final class CallerContext
{
    /** @param  \Closure(string):bool  $can  does this person hold the permission? */
    public function __construct(
        public readonly string $kind,
        private readonly \Closure $can,
        public readonly string $dataScope = 'own',
        public readonly ?array $locationIds = null,
        public readonly ?User $user = null,
    ) {}

    public static function guest(): self
    {
        return new self('guest', fn () => false);
    }

    public static function forUser(?User $u): self
    {
        if (! $u) {
            return self::guest();
        }
        $kind = match (true) {
            $u->isCustomer() => 'customer',
            $u->isVendor() => 'vendor',
            $u->isApplicant() => 'applicant',
            $u->isStaff() => 'staff',
            $u->isDriver() => 'driver',
            default => 'guest',
        };

        return new self($kind, fn (string $p) => $u->hasPermission($p), $u->dataScope(), app(\App\Services\Access\Authorizer::class)->locationIds($u), $u);
    }

    /** For tests: a caller with a fixed set of permissions ('*' means all). */
    public static function fake(string $kind, array $permissions = [], string $dataScope = 'own', ?User $user = null, ?array $locationIds = null): self
    {
        return new self($kind, fn (string $p) => in_array('*', $permissions, true) || in_array($p, $permissions, true), $dataScope, $locationIds, $user);
    }

    public function can(string $permission): bool
    {
        return ($this->can)($permission);
    }

    public function canAll(array $permissions): bool
    {
        foreach ($permissions as $p) {
            if (! $this->can($p)) {
                return false;
            }
        }

        return true;
    }

    public function sees(Entry $e): bool
    {
        return $e->forKind($this->kind) && $this->canAll($e->requires);
    }

    /** Could this kind of account reach the topic, if it only held the permission (or signed in)? Only such topics may be named in a refusal. */
    public function reaches(Entry $e): bool
    {
        return $e->forKind($this->kind) || ($this->kind === 'guest' && $e->reachableByGuestSigningIn());
    }
}
