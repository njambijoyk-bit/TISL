<?php

namespace Tests\Feature\Concerns;

use Illuminate\Support\Facades\DB;

/**
 * Builds tables from the repo's own numbered SQL scripts (database/sql), so a test runs against exactly the columns the owner creates. The MySQL is turned into SQLite on the way: every
 * CREATE TABLE and every ALTER TABLE ... ADD COLUMN in the script, in the order they appear; keys become nothing (or UNIQUE), engine and charset go, UNSIGNED goes, the id column counts up.
 */
trait RunsSqlScripts
{
    protected function runSqlScripts(string ...$files): void
    {
        foreach ($files as $file) {
            $sql = file_get_contents(base_path('database/sql/'.$file));
            $sql = preg_replace('/--[^\n]*/', '', $sql);
            preg_match_all('/(CREATE TABLE IF NOT EXISTS\s+\w+\s*\((?:.|\n)*?\)\s*ENGINE=[^;]*;)|(ALTER TABLE\s+\w+\s+ADD COLUMN[^;]*;)/i', $sql, $m, PREG_SET_ORDER);
            foreach ($m as $hit) {
                if ($hit[1] === '' && preg_match('/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/i', $hit[2], $c) && \Illuminate\Support\Facades\Schema::hasColumn($c[1], $c[2])) {
                    continue;   // a script that creates a table and then adds a column it already has (the owner's MySQL checks first)
                }
                DB::statement($hit[1] !== '' ? $this->sqliteTable($hit[1]) : $this->sqliteColumn($hit[2]));
            }
        }
    }

    private function sqliteTable(string $s): string
    {
        $s = preg_replace('/\)\s*ENGINE=[^;]*;/i', ')', $s);
        $lines = [];
        foreach (preg_split('/\n/', $s) as $l) {
            $t = trim($l);
            if ($t === '' || preg_match('/^(KEY|INDEX|FULLTEXT)\s/i', $t)) {
                continue;
            }
            $t = preg_replace('/^UNIQUE KEY\s+\w+\s*/i', 'UNIQUE ', $t);
            $t = preg_replace('/BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY/i', 'INTEGER PRIMARY KEY AUTOINCREMENT', $t);
            $t = preg_replace('/\s+UNSIGNED/i', '', $t);
            $t = preg_replace('/\s+ON UPDATE CURRENT_TIMESTAMP/i', '', $t);
            $t = preg_replace("/\s+COMMENT\s+'[^']*'/i", '', $t);
            $lines[] = $t;
        }
        $s = implode("\n", $lines);

        return preg_replace('/,\s*\)$/', "\n)", rtrim($s));
    }

    private function sqliteColumn(string $s): string
    {
        $s = preg_replace('/\s+UNSIGNED/i', '', rtrim(trim($s), ';'));

        return preg_replace('/\s+(AFTER|FIRST)\s+\w*$/i', '', $s);
    }
}
