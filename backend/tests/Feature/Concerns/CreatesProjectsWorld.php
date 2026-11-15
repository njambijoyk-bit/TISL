<?php

namespace Tests\Feature\Concerns;

use App\Models\User;
use App\Services\Licensing\LicenseManager;
use App\Services\Projects\ProjectsSetup;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The Projects tests' world: the twenty tables exactly as script 257 makes them, WITH its starter rows (the fifteen industries, every name, the
 * starter kinds of work, stages and project roles), a users table, and the module licensed and switched on. Who may do what is decided by the
 * test (StandsInForAccess): `$this->staff('Amina', ['projects.use', ...])`.
 */
trait CreatesProjectsWorld
{
    use RunsSqlScripts;
    use StandsInForAccess;

    protected bool $projectsLicensed = true;

    protected function createProjectsWorld(): void
    {
        if (! Schema::hasTable('users')) {
            Schema::create('users', function ($t) { $t->id(); $t->string('name'); $t->string('email')->nullable(); $t->string('password')->nullable(); $t->string('role')->nullable(); $t->softDeletes(); $t->timestamps(); });
        }
        $this->mock(LicenseManager::class, fn ($m) => $m->shouldReceive('isActive')->andReturnUsing(fn () => $this->projectsLicensed));
        $this->runSqlScripts('257_projects_foundation.sql');
        $this->runProjectStarterRows();
        ProjectsSetup::forget();
        $this->standInAccess();
    }

    /** The INSERT IGNORE statements of script 257, said the way SQLite says them. */
    private function runProjectStarterRows(): void
    {
        $sql = (string) file_get_contents(base_path('database/sql/257_projects_foundation.sql'));
        $sql = (string) preg_replace('/--[^\n]*/', '', $sql);
        preg_match_all('/INSERT IGNORE INTO\s[^;]*;/s', $sql, $m);
        foreach ($m[0] as $statement) {
            DB::unprepared(str_replace(['INSERT IGNORE INTO', 'NOW()'], ['INSERT OR IGNORE INTO', 'CURRENT_TIMESTAMP'], $statement));
        }
    }

    protected function staff(string $name, array $permissions = ['projects.use']): User
    {
        $u = User::forceCreate(['name' => $name, 'email' => strtolower($name) . '@example.test']);
        $this->grant($u, array_values(array_unique(array_merge(['admin.access'], $permissions))));   // every staff route also asks for the admin area

        return $u;
    }
}
