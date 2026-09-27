<?php

namespace App\Services\Backup;

use App\Models\Module;
use App\Services\Licensing\LicenseManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Decides what a backup will and won't contain, without exporting anything.
 *
 * Rules:
 *  - Core is always included.
 *  - A paid module's tables are included only when the module is ACTIVE
 *    (licensed AND switched on).
 *  - A disabled module is reported under `skipped` so the UI can warn that its
 *    data won't be backed up — this never blocks the run.
 *  - Live tables that no module claims (and aren't excluded) are reported as
 *    `unassigned` so nothing is silently dropped.
 */
class BackupPlanner
{
    public function __construct(private LicenseManager $manager) {}

    /**
     * @return array{
     *   included: array<int, array{module:string, name:string, tables:array<int,string>}>,
     *   skipped:  array<int, array{module:string, name:string}>,
     *   excluded: array<int,string>,
     *   unassigned: array<int,string>
     * }
     */
    public function plan(): array
    {
        $names = Module::pluck('name', 'module_key')->all();

        $included = [[
            'module' => LicenseManager::CORE,
            'name'   => 'Core',
            'tables' => $this->existing(ModuleTables::for(LicenseManager::CORE)),
        ]];
        $skipped = [];

        foreach (array_keys(ModuleTables::MAP) as $key) {
            if ($key === LicenseManager::CORE) {
                continue;
            }
            $name = $names[$key] ?? ucfirst($key);
            if ($this->manager->isActive($key)) {
                $included[] = ['module' => $key, 'name' => $name, 'tables' => $this->existing(ModuleTables::for($key))];
            } else {
                $skipped[] = ['module' => $key, 'name' => $name];
            }
        }

        return [
            'included'   => $included,
            'skipped'    => $skipped,
            'excluded'   => ModuleTables::EXCLUDE,
            'unassigned' => $this->unassigned(),
        ];
    }

    /** Keep only the tables that actually exist in the live database. */
    private function existing(array $tables): array
    {
        return array_values(array_filter($tables, fn ($t) => Schema::hasTable($t)));
    }

    /** Live tables claimed by no module and not excluded. */
    private function unassigned(): array
    {
        $live = $this->liveTables();
        $known = array_merge(ModuleTables::allClaimed(), ModuleTables::EXCLUDE);

        return array_values(array_diff($live, $known));
    }

    private function liveTables(): array
    {
        $db = DB::getDatabaseName();
        $rows = DB::select(
            'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? AND table_type = "BASE TABLE"',
            [$db]
        );

        return array_map(fn ($r) => $r->name, $rows);
    }
}
