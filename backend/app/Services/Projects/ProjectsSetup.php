<?php

namespace App\Services\Projects;

use Illuminate\Support\Facades\Schema;

/**
 * Is the rebuilt Projects module's database in place? The old module's tables were dropped by script 256 and the new ones are made by script 257.
 * Until 257 has run nothing reads or writes the new tables, so the rest of the system keeps working with Projects simply empty.
 * (`project_industries` only exists in the new structure; the old module also had a table called `projects`, so that name proves nothing.)
 */
class ProjectsSetup
{
    private static ?bool $ready = null;

    private static ?bool $controlRoom = null;

    private static ?bool $relationships = null;

    private static ?bool $money = null;

    private static ?bool $work = null;

    public static function ready(): bool
    {
        return self::$ready ??= Schema::hasTable('project_industries') && Schema::hasTable('project_log');
    }

    /** Stage 2 (script 258): hours, locks, approvals and security signals. Until it has run, none of those rules exist and nothing asks for them. */
    public static function controlRoom(): bool
    {
        return self::$controlRoom ??= self::ready() && Schema::hasTable('project_hours') && Schema::hasTable('project_security_events');
    }

    /** Stage 3 (script 259): leads, pipeline, contacts, parties, history, follow-ups, flags and the directory. */
    public static function relationships(): bool
    {
        return self::$relationships ??= self::ready() && Schema::hasTable('project_leads') && Schema::hasTable('project_directory');
    }

    /** Stage 4 (script 260): client money, billing plans, money terms and ledgers made from a project. */
    public static function money(): bool
    {
        return self::$money ??= self::ready() && Schema::hasTable('project_client_accounts') && Schema::hasTable('project_ledgers');
    }

    /** Stage 5 (script 261): tasks, scope lines, key dates, changes, time, rates and disbursements. */
    public static function work(): bool
    {
        return self::$work ??= self::ready() && Schema::hasTable('project_work_tasks') && Schema::hasTable('project_time');
    }

    /** Look again at the next call (a test creates the tables). */
    public static function forget(): void
    {
        self::$ready = null;
        self::$controlRoom = null;
        self::$relationships = null;
        self::$money = null;
        self::$work = null;
    }
}
