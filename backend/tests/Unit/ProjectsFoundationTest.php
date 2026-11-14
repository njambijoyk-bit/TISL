<?php

namespace Tests\Unit;

use App\Services\Access\Catalog;
use App\Services\Backup\ModuleTables;
use PHPUnit\Framework\TestCase;

/**
 * The foundation of the rebuilt Projects module (docs/PROJECTS_STAGE1_SPEC.md): its permissions, and the two database scripts an owner runs.
 * Nothing here needs a database: the scripts are read as text, so a slip in them is caught before anyone runs them.
 */
class ProjectsFoundationTest extends TestCase
{
    private const TABLES = ['project_industries', 'project_terms', 'project_term_names', 'project_term_overrides', 'project_types', 'project_stages', 'project_fields', 'project_field_values',
        'project_series', 'projects', 'project_phases', 'project_links', 'project_roles', 'project_role_permissions', 'project_members', 'project_log',
        'project_settings', 'project_setting_versions', 'project_setting_logs', 'project_user_prefs'];

    private const OLD_TABLES = ['projects', 'project_participants', 'project_links', 'project_items', 'project_tasks', 'project_milestones', 'project_messages', 'project_activities'];

    private static function script(string $name): string
    {
        return (string) file_get_contents(__DIR__ . '/../../database/sql/' . $name);
    }

    public function test_the_catalogue_holds_the_ninety_eight_project_permissions_and_not_the_two_retired_ones(): void
    {
        $projects = array_filter(array_keys(Catalog::PERMISSIONS), fn (string $k) => str_starts_with($k, 'projects.'));
        $this->assertCount(98, $projects);
        $this->assertArrayNotHasKey('projects.manage', Catalog::PERMISSIONS);
        $this->assertArrayNotHasKey('projects.moderate', Catalog::PERMISSIONS);
        foreach ($projects as $key) {
            [$module, $group, $label] = Catalog::PERMISSIONS[$key];
            $this->assertSame('projects', $module, "{$key} must belong to the Projects module so it disappears when the module is off");
            $this->assertStringStartsWith('Projects', $group);
            $this->assertLessThanOrEqual(150, strlen($label), "{$key}: the label is longer than the column");
            $this->assertLessThanOrEqual(80, strlen($key));
        }
        $this->assertCount(95, Catalog::ADDED[26]);
    }

    public function test_only_the_owner_holds_the_three_owner_only_project_permissions_by_default(): void
    {
        $roles = Catalog::roles();
        foreach (['projects.purge', 'projects.ledgers.bank', 'projects.casebook.identity'] as $key) {
            $this->assertContains($key, Catalog::OWNER_ONLY);
            foreach ($roles as $name => $role) {
                if ($role['permissions'] !== '*') {
                    $this->assertNotContains($key, $role['permissions'], "{$name} must not hold {$key} by default");
                }
            }
        }
    }

    public function test_a_built_in_role_only_gets_project_permissions_if_it_opens_projects(): void
    {
        foreach (Catalog::roles() as $name => $role) {
            if ($role['permissions'] === '*') {
                continue;
            }
            $held = array_filter($role['permissions'], fn (string $k) => str_starts_with($k, 'projects.'));
            if ($held) {
                $this->assertContains('projects.use', $role['permissions'], "{$name} holds project permissions but cannot open Projects");
            }
        }
        $this->assertNotContains('projects.money.bill', Catalog::roles()['manager']['permissions'], 'raising bills is finance work by default');
        $this->assertContains('projects.money.bill', Catalog::roles()['finance']['permissions']);
    }

    public function test_the_drop_script_removes_every_old_table_and_refuses_to_run_over_the_new_structure(): void
    {
        $sql = self::script('256_projects_drop_old.sql');
        foreach (self::OLD_TABLES as $t) {
            $this->assertMatchesRegularExpression('/^\s*DROP TABLE IF EXISTS ' . $t . ';/m', $sql);
        }
        // the guard comes before the first drop
        $guard = strpos($sql, "table_name = 'project_industries') THEN");
        $this->assertNotFalse($guard);
        $this->assertLessThan(strpos($sql, 'DROP TABLE IF EXISTS'), $guard);
        $this->assertStringContainsString('SIGNAL SQLSTATE', $sql);
        $this->assertStringContainsString("'projects.manage', 'projects.moderate'", $sql);
    }

    public function test_the_foundation_script_creates_the_twenty_tables_and_the_backup_map_claims_them(): void
    {
        $sql = self::script('257_projects_foundation.sql');
        preg_match_all('/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/', $sql, $m);
        $this->assertSame(self::TABLES, $m[1]);
        $this->assertSame(count(self::TABLES), substr_count($sql, 'COLLATE utf8mb4_unicode_ci;'), 'every table names the collation the rest of the system uses');
        $this->assertSame([], array_values(array_diff(self::TABLES, ModuleTables::MAP['projects'])));
        foreach (array_diff(self::OLD_TABLES, self::TABLES) as $gone) {
            $this->assertNotContains($gone, ModuleTables::MAP['projects']);
        }
    }

    public function test_no_table_of_the_foundation_holds_an_amount_of_money(): void
    {
        $sql = self::script('257_projects_foundation.sql');
        $this->assertDoesNotMatchRegularExpression('/\bDECIMAL\b/i', $sql, 'money lives in the books; a project only points at it');
        $this->assertDoesNotMatchRegularExpression('/^\s*(amount|price|total|value_kes|budget|rate|cost(?!_centre_id))\w*\s+(INT|BIGINT|FLOAT|DOUBLE)/mi', $sql);
    }

    public function test_every_industry_names_every_term_once(): void
    {
        $sql = self::script('257_projects_foundation.sql');
        $rows = fn (string $table) => preg_match('/INSERT IGNORE INTO ' . $table . ' \([^)]*\) VALUES\n(.*?);\n/s', $sql, $m) ? $m[1] : '';
        preg_match_all("/^\s*\('([a-z_]+)', '[^']+', '(common|niche|basic)'/m", $rows('project_industries'), $ind);
        preg_match_all("/^\s*\('([a-z_]+)', '/m", $rows('project_terms'), $terms);
        $this->assertCount(15, $ind[1]);
        $this->assertSame(['common' => 5, 'niche' => 8, 'basic' => 2], array_count_values($ind[2]));
        $this->assertCount(30, $terms[1]);

        preg_match_all("/^\s*\('([a-z_]+)', '([a-z_]+)', '((?:[^']|'')+)', '((?:[^']|'')+)'\)[,;]$/m", $sql, $names, PREG_SET_ORDER);
        $seen = [];
        foreach ($names as [, $industry, $term, $name, $plural]) {
            $this->assertContains($industry, $ind[1]);
            $this->assertContains($term, $terms[1]);
            $this->assertArrayNotHasKey("{$industry}.{$term}", $seen, 'named twice');
            $this->assertLessThanOrEqual(80, strlen($name));
            $this->assertLessThanOrEqual(80, strlen($plural));
            $seen["{$industry}.{$term}"] = true;
        }
        $this->assertCount(15 * 30, $seen);
    }

    public function test_every_kind_of_work_has_its_own_prefix_and_ends_on_a_closed_stage(): void
    {
        $sql = self::script('257_projects_foundation.sql');
        preg_match_all("/^\s*\('([a-z_]+)', '([^']+)', '([A-Z]{1,8})', 1, \d+, NOW\(\), NOW\(\)\)[,;]$/m", $sql, $types, PREG_SET_ORDER);
        $this->assertCount(40, $types);
        $prefixes = array_column($types, 3);
        $this->assertSame(count($prefixes), count(array_unique($prefixes)), 'two kinds of work share a number prefix');

        // each stage statement: name, order, state, the industry and the kinds of work it is given to
        preg_match_all("/SELECT id, '([^']+)', (\d+), '(open|closed)', '(info|good|warning|problem)', NOW\(\), NOW\(\) FROM project_types WHERE industry_key = '([a-z_]+)' AND name IN \(([^)]*)\);/", $sql, $stages, PREG_SET_ORDER);
        $last = [];
        foreach ($stages as [, $stage, $order, $state, , $industry, $list]) {
            preg_match_all("/'([^']+)'/", $list, $names);
            foreach ($names[1] as $type) {
                if (! isset($last["{$industry}.{$type}"]) || (int) $order > $last["{$industry}.{$type}"][0]) {
                    $last["{$industry}.{$type}"] = [(int) $order, $state, $stage];
                }
            }
        }
        foreach ($types as [, $industry, $type]) {
            $this->assertArrayHasKey("{$industry}.{$type}", $last, "{$type} has no stages");
            $this->assertSame('closed', $last["{$industry}.{$type}"][1], "{$type} must end on a closed stage");
        }
    }
}
