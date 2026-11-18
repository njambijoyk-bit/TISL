<?php

namespace App\Services\Projects;

/**
 * What can be attached to a project. Each module says so for itself, in one place, by registering a link type:
 *     $types->register('events.event', [...])
 * and Projects needs no change when a module is added. A link type names the module it belongs to and the permission a person needs to see
 * that module's records: a type whose module is not licensed and switched on, or that the person may not see, is simply not there for them
 * (the links themselves are kept, and come back when the module does).
 *
 * A definition:
 *   module      the module key the licence knows, or null for Core (always on)
 *   label       one of them ("Voucher"), plural ("Vouchers")
 *   permission  what a person must hold to see and pick these records
 *   search      fn (string $q): array<int, array{id: int, title: string, detail: ?string}>     what can be picked
 *   describe    fn (int[] $ids): array<int, array{title: string, detail: ?string, url: ?string, amount?: ?float, currency?: ?string, state?: ?string}>
 *               (an amount is READ from the module that owns it, every time; Projects never keeps one)
 * Optional (stage 7):
 *   states      [state => [label, status]]  how the record's own state reads; status is a named status (info, good, warning, problem), never a colour
 *   value       true when the record can be the agreed value of the work (quotations, sales orders): its amount is added up under "Agreed value"
 *   role        the link role a new link gets unless the person picks another (a key from project_link_roles), or fn (int $id): ?string
 *   create      fn (object $project): ?string   where the module's own form starts a new one for this work (it links it back on save)
 */
class ProjectLinkTypes
{
    /** @var array<string, array<string, mixed>> */
    private array $types = [];

    /** @param array<string, mixed> $definition */
    public function register(string $key, array $definition): void
    {
        foreach (['label', 'plural', 'permission', 'search', 'describe'] as $need) {
            if (! isset($definition[$need])) {
                throw new \InvalidArgumentException("The link type {$key} must say its {$need}.");
            }
        }
        if (! preg_match('/^[a-z_]+\.[a-z_]+$/', $key)) {
            throw new \InvalidArgumentException("A link type is named module.thing; {$key} is not.");
        }
        $this->types[$key] = $definition + ['module' => null];
    }

    /** @return array<string, array<string, mixed>> */
    public function all(): array
    {
        return $this->types;
    }

    /** @return array<string, mixed>|null */
    public function get(string $key): ?array
    {
        return $this->types[$key] ?? null;
    }
}
