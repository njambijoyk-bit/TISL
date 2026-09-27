<?php

namespace App\Services\Backup;

use App\Models\Module;
use App\Models\ModuleTableMap;
use App\Services\Licensing\LicenseManager;
use Illuminate\Support\Facades\DB;

/**
 * Decides what a backup will and won't contain, without exporting anything.
 *
 * Table → module comes from two layers: the built-in ModuleTables::MAP as
 * defaults, and the admin's own assignments in `module_table_map`, which win.
 * That lets any table (including ones added later via SQL) be placed from the
 * UI with no code change.
 *
 * Rules:
 *  - Core is always included.
 *  - A paid module's tables are included only when the module is ACTIVE
 *    (licensed AND switched on).
 *  - Licensed-but-switched-off → `disabled` (the UI warns). Not owned →
 *    `unlicensed` (quiet). Neither blocks a run.
 *  - Live tables mapped nowhere and not excluded → `unassigned`.
 */
class BackupPlanner
{
    public function __construct(private LicenseManager $manager) {}

    /**
     * @return array{
     *   included:   array<int, array{module:string, name:string, tables:array<int,string>}>,
     *   disabled:   array<int, array{module:string, name:string}>,
     *   unlicensed: array<int, array{module:string, name:string}>,
     *   excluded:   array<int,string>,
     *   unassigned: array<int,string>
     * }
     */
    public function plan(): array
    {
        $live = $this->liveTables();
        [$tableToModule, $excluded] = $this->resolveMap($live);

        // Group live, non-excluded tables by their resolved module.
        $byModule = [];
        foreach ($live as $t) {
            if (in_array($t, $excluded, true)) {
                continue;
            }
            $m = $tableToModule[$t] ?? null;
            if ($m !== null) {
                $byModule[$m][] = $t;
            }
        }

        $rows = Module::get(['module_key', 'name', 'enabled'])->keyBy('module_key');

        $included = [[
            'module' => LicenseManager::CORE,
            'name'   => 'Core',
            'tables' => array_values($byModule[LicenseManager::CORE] ?? []),
        ]];
        $disabled = [];
        $unlicensed = [];

        foreach (array_values(\App\Services\Licensing\LicenseFormat::MODULES) as $key) {
            $row = $rows->get($key);
            $name = $row->name ?? ucfirst($key);

            if (!$this->manager->isLicensed($key)) {
                $unlicensed[] = ['module' => $key, 'name' => $name];
            } elseif (!($row && $row->enabled)) {
                $disabled[] = ['module' => $key, 'name' => $name];
            } else {
                $included[] = ['module' => $key, 'name' => $name, 'tables' => array_values($byModule[$key] ?? [])];
            }
        }

        $unassigned = array_values(array_filter(
            $live,
            fn ($t) => !in_array($t, $excluded, true) && !isset($tableToModule[$t])
        ));

        return [
            'included'   => $included,
            'disabled'   => $disabled,
            'unlicensed' => $unlicensed,
            'excluded'   => array_values(array_intersect($live, $excluded)),
            'unassigned' => $unassigned,
        ];
    }

    /**
     * Merge built-in defaults with the admin's DB assignments.
     *
     * @return array{0: array<string,string>, 1: array<int,string>}  [tableToModule, excludedTables]
     */
    public function resolveMap(?array $live = null): array
    {
        // Base: built-in module → tables, flattened to table → module.
        $tableToModule = [];
        foreach (ModuleTables::MAP as $module => $tables) {
            foreach ($tables as $t) {
                $tableToModule[$t] = $module;
            }
        }
        $excluded = ModuleTables::EXCLUDE;

        // Overrides: admin assignments win.
        foreach (ModuleTableMap::all() as $row) {
            if ($row->is_excluded) {
                $excluded[] = $row->table_name;
                unset($tableToModule[$row->table_name]);
            } elseif ($row->module_key) {
                $tableToModule[$row->table_name] = $row->module_key;
                $excluded = array_values(array_diff($excluded, [$row->table_name]));
            }
        }

        return [$tableToModule, array_values(array_unique($excluded))];
    }

    /** All base tables in the live database. */
    public function liveTables(): array
    {
        $db = DB::getDatabaseName();
        $rows = DB::select(
            'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? AND table_type = "BASE TABLE"',
            [$db]
        );

        return array_map(fn ($r) => $r->name, $rows);
    }
}
