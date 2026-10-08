<?php

namespace Tests\Unit;

use App\Services\Access\Catalog;
use PHPUnit\Framework\TestCase;

/**
 * The permission catalogue is the one list the routes, the roles and the role builder agree on. These checks catch a typo that would lock a role out
 * (a route naming a permission that does not exist) and a built-in role that holds something that does not exist.
 */
class AccessCatalogTest extends TestCase
{
    public function test_every_permission_a_route_names_exists(): void
    {
        $src = (string) file_get_contents(__DIR__ . '/../../routes/api.php');
        preg_match_all("/permission:([a-z_.,]+)/", $src, $m);
        $missing = [];
        foreach (array_unique($m[1]) as $list) {
            foreach (explode(',', $list) as $key) {
                if (! isset(Catalog::PERMISSIONS[$key])) {
                    $missing[] = $key;
                }
            }
        }
        $this->assertSame([], $missing, 'Routes name permissions the catalogue does not have: ' . implode(', ', $missing));
    }

    public function test_built_in_roles_only_hold_permissions_that_exist(): void
    {
        foreach (Catalog::roles() as $key => $role) {
            $bad = $role['permissions'] === '*' ? [] : array_diff($role['permissions'], array_keys(Catalog::PERMISSIONS));
            $this->assertSame([], array_values($bad), "Role {$key} holds unknown permissions");
            $this->assertContains($role['kind'], ['staff', 'portal']);
            $this->assertGreaterThanOrEqual(0, $role['min_clearance']);
            $this->assertLessThanOrEqual(6, $role['min_clearance']);
        }
    }

    public function test_the_version_history_lists_real_permissions_and_owner_only_ones_stay_with_the_owner(): void
    {
        foreach (Catalog::ADDED as $version => $keys) {
            $this->assertLessThanOrEqual(Catalog::VERSION, $version);
            foreach ($keys as $k) {
                $this->assertArrayHasKey($k, Catalog::PERMISSIONS, "{$k} is listed as added in version {$version} but does not exist");
            }
        }
        $roles = Catalog::roles();
        foreach (Catalog::OWNER_ONLY as $k) {
            $this->assertArrayHasKey($k, Catalog::PERMISSIONS);
            $this->assertNotContains($k, $roles['admin']['permissions'], "{$k} must not be in admin by default");
        }
        $this->assertSame('*', $roles['super_admin']['permissions']);
    }

    public function test_grants_to_existing_permissions_name_real_roles_and_permissions(): void
    {
        $roles = Catalog::roles();
        foreach (Catalog::GRANTED as $version => $byRole) {
            $this->assertLessThanOrEqual(Catalog::VERSION, $version);
            foreach ($byRole as $role => $keys) {
                $this->assertArrayHasKey($role, $roles);
                foreach ($keys as $k) {
                    $this->assertArrayHasKey($k, Catalog::PERMISSIONS);
                    $this->assertContains($k, $roles[$role]['permissions'], "{$role} should hold {$k} by default, since version {$version} grants it");
                }
            }
        }
    }

    public function test_a_permission_added_in_a_version_is_reported_as_since_that_version(): void
    {
        foreach (Catalog::ADDED as $version => $keys) {
            foreach ($keys as $k) {
                $this->assertSame($version, Catalog::since($k), "{$k}");
            }
        }
        $this->assertSame(1, Catalog::since('books.view'));
    }
}
