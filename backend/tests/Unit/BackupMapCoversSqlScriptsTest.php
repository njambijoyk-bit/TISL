<?php

namespace Tests\Unit;

use App\Services\Backup\ModuleTables;
use PHPUnit\Framework\TestCase;

/**
 * Every table a database/sql script creates must be claimed by a module in the backup map (or deliberately excluded), so a new feature's data is never
 * silently left out of a backup. Add the table to ModuleTables::MAP when this fails.
 */
class BackupMapCoversSqlScriptsTest extends TestCase
{
    public function test_every_table_created_by_the_sql_scripts_is_in_the_backup_map(): void
    {
        $claimed = array_merge(ModuleTables::allClaimed(), ModuleTables::EXCLUDE);
        $made = [];   // table => the script that created it, minus the tables a later script drops
        $files = glob(__DIR__ . '/../../database/sql/*.sql');
        sort($files);
        foreach ($files as $file) {
            $sql = (string) file_get_contents($file);
            if (preg_match_all('/CREATE TABLE IF NOT EXISTS\s+`?([a-z0-9_]+)`?/i', $sql, $m)) {
                foreach ($m[1] as $table) {
                    $made[$table] = basename($file);
                }
            }
            if (preg_match_all('/^\s*DROP TABLE IF EXISTS\s+`?([a-z0-9_]+)`?/im', $sql, $d)) {
                foreach ($d[1] as $table) {
                    unset($made[$table]);
                }
            }
        }
        $missing = [];
        foreach ($made as $table => $script) {
            if (! in_array($table, $claimed, true)) {
                $missing[] = $script . ': ' . $table;
            }
        }
        $this->assertSame([], $missing, 'Tables missing from the backup map: ' . implode(', ', $missing));
    }

    public function test_a_table_is_claimed_by_one_module_only(): void
    {
        $seen = [];
        $dupes = [];
        foreach (ModuleTables::MAP as $module => $tables) {
            foreach ($tables as $t) {
                if (isset($seen[$t])) {
                    $dupes[] = "{$t} ({$seen[$t]} and {$module})";
                }
                $seen[$t] = $module;
            }
        }
        $this->assertSame([], $dupes, 'Listed under two modules: ' . implode(', ', $dupes));
    }

    public function test_the_budgeting_tables_are_in_the_core_backup_so_a_business_keeps_its_plans(): void
    {
        $budgeting = ['budgets', 'budget_versions', 'budget_approvals', 'budget_rows', 'budget_lines', 'budget_initiatives', 'budget_templates', 'budget_template_lines',
            'budget_control_rules', 'budget_overrides', 'budget_transfers', 'forecast_items'];
        $this->assertSame([], array_values(array_diff($budgeting, ModuleTables::MAP['core'])), 'Core is always backed up, with the books');
    }
}
