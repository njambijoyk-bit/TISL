<?php

namespace App\Services\BulkImport;

use App\Services\Licensing\LicenseManager;

/**
 * The things that can be imported, and which of them this installation may import right now.
 *
 * The engine itself belongs to Extras: with Extras unlicensed or switched off nothing is offered. Each thing then needs its own module
 * (Menus for ingredients and recipes, E-commerce for products, services and hampers) to be licensed AND switched on.
 */
class ImportRegistry
{
    /** The module the engine itself needs. */
    public const ENGINE_MODULE = 'extras';

    /** @var class-string<ImportEntity>[] */
    public const ENTITIES = [
        Entities\IngredientsEntity::class,
        Entities\RecipesEntity::class,
        Entities\CategoriesEntity::class,
        Entities\ProductsEntity::class,
        Entities\ServicesEntity::class,
        Entities\HampersEntity::class,
    ];

    private const MODULE_NAMES = ['ecommerce' => 'E-commerce', 'menus' => 'Menus', 'extras' => 'Extras', 'core' => 'Core'];

    private ?array $instances = null;

    public function __construct(private LicenseManager $licenses)
    {
    }

    /** @return array<string, ImportEntity> key => entity */
    public function all(): array
    {
        if ($this->instances === null) {
            $this->instances = [];
            foreach (self::ENTITIES as $class) {
                $e = new $class();
                $this->instances[$e->key()] = $e;
            }
        }

        return $this->instances;
    }

    public function find(string $key): ?ImportEntity
    {
        return $this->all()[$key] ?? null;
    }

    /** The permission a role needs to import this thing: one per module, so a role may import E-commerce data but not Memberships. */
    public function permission(ImportEntity $e): string
    {
        return 'bulkimport.'.$e->module();
    }

    /** Why this thing can not be imported now, or null when it can. Returns [code, message]. */
    public function gate(ImportEntity $e): ?array
    {
        foreach ([self::ENGINE_MODULE, $e->module()] as $module) {
            if ($this->licenses->isActive($module)) {
                continue;
            }
            $name = self::MODULE_NAMES[$module] ?? ucfirst($module);

            return $this->licenses->isLicensed($module)
                ? ['module_off', "The {$name} module is switched off, so {$e->label()} can not be imported. Switch it on in the Module Center first."]
                : ['module_not_licensed', "The {$name} module is not licensed on this installation, so {$e->label()} can not be imported."];
        }

        return null;
    }

    /** Which required things are not in the system yet: a list of labels with the thing to import first. */
    public function missing(ImportEntity $e): array
    {
        $out = [];
        foreach ($e->requires() as $need) {
            if (! ($need['present'])()) {
                $out[] = ['label' => $need['label'], 'entity' => $need['entity'] ?? null];
            }
        }

        return $out;
    }

    /** What the screen lists: every thing, whether it is open now, why not, and what it is waiting for. */
    public function catalogue(?callable $can = null): array
    {
        $out = [];
        foreach ($this->all() as $e) {
            if ($can && ! $can($this->permission($e))) {
                continue;   // a role without the module's import permission does not see its things at all
            }
            $gate = $this->gate($e);
            $missing = $gate ? [] : $this->missing($e);
            $out[] = [
                'key' => $e->key(), 'module' => $e->module(), 'module_name' => self::MODULE_NAMES[$e->module()] ?? ucfirst($e->module()),
                'permission' => $this->permission($e), 'label' => $e->label(), 'description' => $e->description(),
                'available' => $gate === null, 'unavailable_code' => $gate[0] ?? null, 'unavailable_reason' => $gate[1] ?? null,
                'missing' => $missing, 'ready' => $gate === null && ! $missing,
                'grouped_by' => $e->groupBy(),
                'columns' => array_map(fn (Column $c) => $c->toArray(), $e->columns()),
            ];
        }

        return $out;
    }
}
