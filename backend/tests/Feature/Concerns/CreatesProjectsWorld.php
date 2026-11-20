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

    /** modules that are not licensed or are switched off, for the tests that need one to be */
    protected array $modulesOff = [];

    protected function createProjectsWorld(): void
    {
        if (! Schema::hasTable('users')) {
            Schema::create('users', function ($t) { $t->id(); $t->string('name'); $t->string('email')->nullable(); $t->string('password')->nullable(); $t->string('role')->nullable(); $t->softDeletes(); $t->timestamps(); });
        }
        $this->mock(LicenseManager::class, fn ($m) => $m->shouldReceive('isActive')->andReturnUsing(fn ($module = null) => $this->projectsLicensed && ! in_array($module, $this->modulesOff, true)));
        // the books' cost centres and branches, and the customers, with the columns Projects reads and writes
        Schema::create('cost_centres', function ($t) { $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->unsignedBigInteger('location_id')->nullable(); $t->string('name'); $t->string('code')->unique();
            $t->string('type')->default('other'); $t->string('purpose')->nullable(); $t->string('description')->nullable(); $t->boolean('is_system')->default(false); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('locations', function ($t) { $t->id(); $t->string('name'); $t->string('code')->nullable(); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('customers', function ($t) { $t->id(); $t->string('customer_number')->nullable(); $t->string('first_name')->nullable(); $t->string('last_name')->nullable(); $t->string('company_name')->nullable(); $t->string('email')->nullable(); $t->softDeletes(); $t->timestamps(); });
        DB::table('cost_centres')->insert(['id' => 1, 'name' => 'Nairobi', 'code' => 'BR-NBO', 'type' => 'branch', 'purpose' => 'branch', 'location_id' => 1, 'is_system' => 1]);
        DB::table('locations')->insert([['id' => 1, 'name' => 'Nairobi', 'code' => 'NBO', 'cost_centre_id' => 1], ['id' => 2, 'name' => 'Mombasa', 'code' => 'MSA', 'cost_centre_id' => null]]);
        DB::table('customers')->insert([['id' => 1, 'customer_number' => 'C-001', 'first_name' => 'Achieng', 'last_name' => 'Otieno', 'company_name' => 'Imara Sacco', 'email' => 'achieng@imara.test'],
            ['id' => 2, 'customer_number' => 'C-002', 'first_name' => 'Brian', 'last_name' => 'Kariuki', 'company_name' => null, 'email' => 'brian@example.test']]);
        // "the staff who hold a permission" is answered from what the test granted
        $test = $this;
        $this->app->instance(\App\Services\Notify\Staff::class, new class($test) extends \App\Services\Notify\Staff {
            public function __construct(private $test) {}

            public function holding(string $permission): \Illuminate\Support\Collection
            {
                return User::all()->filter(fn ($u) => in_array($permission, $this->test->permsOf($u->id), true))->values();
            }
        });
        $this->runSqlScripts('257_projects_foundation.sql', '258_projects_control_room.sql', '259_projects_relationships.sql', '260_projects_money.sql', '261_projects_work.sql', '262_notify_staff_and_replies.sql', '263_projects_messages.sql', '264_projects_links_more.sql', '265_projects_people.sql', '266_projects_documents.sql', '267_projects_site.sql');
        if (! \Illuminate\Support\Facades\Schema::hasColumn('project_links', 'role_key')) {   // script 264 adds it inside a guard procedure, which the runner does not read
            \Illuminate\Support\Facades\Schema::table('project_links', fn ($t) => $t->string('role_key', 30)->nullable());
        }
        $this->runProjectStarterRows('257_projects_foundation.sql');
        $this->runProjectStarterRows('259_projects_relationships.sql');
        $this->runProjectStarterRows('260_projects_money.sql');
        $this->runProjectStarterRows('261_projects_work.sql');
        $this->runProjectStarterRows('263_projects_messages.sql');
        $this->runProjectStarterRows('264_projects_links_more.sql');
        $this->runProjectStarterRows('265_projects_people.sql');
        $this->runProjectStarterRows('266_projects_documents.sql');
        $this->runProjectStarterRows('267_projects_site.sql');
        $this->runProjectStarterRows('258_projects_control_room.sql');
        ProjectsSetup::forget();
        \App\Services\Books\ClientMoneyGuard::forget();
        $this->standInAccess();
    }

    /** The INSERT IGNORE statements of script 257, said the way SQLite says them. */
    private function runProjectStarterRows(string $file): void
    {
        $sql = (string) file_get_contents(base_path('database/sql/' . $file));
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
