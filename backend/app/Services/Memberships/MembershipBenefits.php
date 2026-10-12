<?php

namespace App\Services\Memberships;

use App\Services\Books\BooksException;
use App\Services\Licensing\LicenseManager;

/**
 * What a membership plan can give. Memberships does not know how to run a course or a meal plan: each module registers its benefit type once and says how to check its settings and how to
 * describe them in words. (Handing the benefit to a member and taking it back are registered the same way, in the step that joins the module to memberships.) A type whose module is switched
 * off or not licensed is not offered and is left out of what a plan shows.
 */
final class MembershipBenefits
{
    /** @var array<string, array{label: string, module: string, validate: callable, describe: callable, grant: ?callable, revoke: ?callable}> */
    private array $defs = [];

    /**
     * @param  callable  $validate  fn (array $config): array  the cleaned settings, or throws BooksException with a message for the person
     * @param  callable  $describe  fn (array $config): string  one line for the plan page
     * @param  ?callable  $grant  fn (Membership $m, array $config): void  the member now holds the plan in good standing
     * @param  ?callable  $revoke  fn (Membership $m, array $config): void  the member no longer does
     */
    public function register(string $type, string $label, string $module, callable $validate, callable $describe, ?callable $grant = null, ?callable $revoke = null): void
    {
        $this->defs[$type] = ['label' => $label, 'module' => $module, 'validate' => $validate, 'describe' => $describe, 'grant' => $grant, 'revoke' => $revoke];
    }

    private function active(string $module): bool
    {
        try {
            return app(LicenseManager::class)->isActive($module);
        } catch (\Throwable) {
            return false;
        }
    }

    public function has(string $type): bool
    {
        return isset($this->defs[$type]) && $this->active($this->defs[$type]['module']);
    }

    /** @return array<string, string> type => label, for the modules that are on */
    public function types(): array
    {
        $out = [];
        foreach ($this->defs as $type => $d) {
            if ($this->active($d['module'])) {
                $out[$type] = $d['label'];
            }
        }

        return $out;
    }

    /** @param array<string, mixed> $config @return array<string, mixed> */
    public function validate(string $type, array $config): array
    {
        if (! $this->has($type)) {
            throw new BooksException("That benefit is not available: its module is not switched on ({$type}).");
        }

        return ($this->defs[$type]['validate'])($config);
    }

    /** @param array<string, mixed> $config */
    public function describe(string $type, array $config): string
    {
        return isset($this->defs[$type]) ? (string) ($this->defs[$type]['describe'])($config) : $type;
    }

    public function label(string $type): string
    {
        return $this->defs[$type]['label'] ?? $type;
    }

    /** The handler that hands a benefit over, if its module has registered one. */
    public function granter(string $type): ?callable
    {
        return $this->has($type) ? $this->defs[$type]['grant'] : null;
    }

    public function revoker(string $type): ?callable
    {
        return $this->has($type) ? $this->defs[$type]['revoke'] : null;
    }
}
