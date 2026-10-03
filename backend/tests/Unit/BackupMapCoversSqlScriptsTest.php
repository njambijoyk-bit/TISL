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
        $missing = [];
        foreach (glob(__DIR__ . '/../../database/sql/*.sql') as $file) {
            if (preg_match_all('/CREATE TABLE IF NOT EXISTS\s+`?([a-z0-9_]+)`?/i', (string) file_get_contents($file), $m)) {
                foreach ($m[1] as $table) {
                    if (! in_array($table, $claimed, true)) {
                        $missing[] = basename($file) . ': ' . $table;
                    }
                }
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
}
