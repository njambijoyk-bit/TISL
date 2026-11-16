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

    public static function ready(): bool
    {
        return self::$ready ??= Schema::hasTable('project_industries') && Schema::hasTable('project_log');
    }

    /** Stage 2 (script 258): hours, locks, approvals and security signals. Until it has run, none of those rules exist and nothing asks for them. */
    public static function controlRoom(): bool
    {
        return self::$controlRoom ??= self::ready() && Schema::hasTable('project_hours') && Schema::hasTable('project_security_events');
    }

    /** Look again at the next call (a test creates the tables). */
    public static function forget(): void
    {
        self::$ready = null;
        self::$controlRoom = null;
    }
}
