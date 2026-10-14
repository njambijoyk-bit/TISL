<?php

namespace Tests\Feature\Concerns;

use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Access\Decision;

/** Who may do what, decided by the test: grant(user, [permissions]) and, for branch clearance, branches(user, [ids]). Everyone else may do nothing. */
trait StandsInForAccess
{
    protected array $perms = [];
    protected array $branchesOf = [];

    protected function grant(User $u, array $permissions): void
    {
        $this->perms[$u->id] = $permissions;
        $this->standInAccess();
    }

    protected function branches(User $u, array $ids): void
    {
        $this->branchesOf[$u->id] = $ids;
        $this->standInAccess();
    }

    private function standInAccess(): void
    {
        $test = $this;
        $this->app->instance(Authorizer::class, new class($test) extends Authorizer {
            public function __construct(private $test)
            {
            }

            public function allows(User $u, string $permission, array $ctx = []): bool
            {
                return in_array($permission, $this->test->permsOf($u->id), true);
            }

            public function can(User $u, string $permission, array $ctx = []): Decision
            {
                return $this->allows($u, $permission, $ctx) ? Decision::allow() : Decision::deny('no_permission');
            }

            public function isStaff(User $u): bool
            {
                return $this->test->permsOf($u->id) !== [];
            }

            public function locationIds(User $u): ?array
            {
                return $this->test->branchesFor($u->id);
            }
        });
    }

    public function permsOf(int $id): array
    {
        return $this->perms[$id] ?? [];
    }

    public function branchesFor(int $id): ?array
    {
        return $this->branchesOf[$id] ?? null;
    }
}
