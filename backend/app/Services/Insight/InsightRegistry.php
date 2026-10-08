<?php

namespace App\Services\Insight;

use App\Models\User;
use App\Services\Licensing\LicenseManager;

/**
 * The insight packs of Core and of every module. A module adds its own with register(); the registry only offers a pack
 * when its module is on and the user's role may use it.
 */
class InsightRegistry
{
    /** @var InsightPack[] */
    private array $packs = [];

    public function __construct(private LicenseManager $modules) {}

    public function register(InsightPack $pack): void
    {
        $this->packs[$pack->key()] = $pack;
    }

    public function find(string $key): ?InsightPack
    {
        return $this->packs[$key] ?? null;
    }

    public function allowed(InsightPack $p, ?User $u): bool
    {
        if (! $u || ! $u->holdsAny($p->roles())) {
            return false;
        }

        return $p->module() === null || $this->modules->isActive($p->module());
    }

    /** The packs that can say something about this context, for this user. */
    public function forContext(array $context, ?User $u): array
    {
        $type = $context['type'] ?? '';

        return array_values(array_filter($this->packs, fn (InsightPack $p) => in_array($type, $p->contexts(), true) && $this->allowed($p, $u) && $p->applies($context)));
    }
}
