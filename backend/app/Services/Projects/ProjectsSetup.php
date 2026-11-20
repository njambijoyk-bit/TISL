<?php

namespace App\Services\Projects;

use Illuminate\Support\Facades\Schema;

/**
 * Is the rebuilt Projects module's database in place? The old module's tables were dropped by script 256 and the new ones are made by script 257.
 * Until 257 has run nothing reads or writes the new tables, so the rest of the system keeps working with Projects simply empty.
 * (`project_industries` only exists in the new structure; the old module also had a table called `projects`, so that name proves nothing.)
 *
 * Each answer is looked up once per request and kept in the container, so it never outlives the app it was asked in (a long-running worker sees
 * a script once it is run; one test never sees another's tables).
 */
class ProjectsSetup
{
    private const KEY = 'projects.setup.';

    public static function ready(): bool
    {
        return self::once('ready', fn () => Schema::hasTable('project_industries') && Schema::hasTable('project_log'));
    }

    /** Stage 2 (script 258): hours, locks, approvals and security signals. Until it has run, none of those rules exist and nothing asks for them. */
    public static function controlRoom(): bool
    {
        return self::once('control_room', fn () => self::ready() && Schema::hasTable('project_hours') && Schema::hasTable('project_security_events'));
    }

    /** Stage 3 (script 259): leads, pipeline, contacts, parties, history, follow-ups, flags and the directory. */
    public static function relationships(): bool
    {
        return self::once('relationships', fn () => self::ready() && Schema::hasTable('project_leads') && Schema::hasTable('project_directory'));
    }

    /** Stage 4 (script 260): client money, billing plans, money terms and ledgers made from a project. */
    public static function money(): bool
    {
        return self::once('money', fn () => self::ready() && Schema::hasTable('project_client_accounts') && Schema::hasTable('project_ledgers'));
    }

    /** Stage 5 (script 261): tasks, scope lines, key dates, changes, time, rates and disbursements. */
    public static function work(): bool
    {
        return self::once('work', fn () => self::ready() && Schema::hasTable('project_work_tasks') && Schema::hasTable('project_time'));
    }

    /** Stage 6 (script 263): conversations, tags, following and meetings. */
    public static function messages(): bool
    {
        return self::once('messages', fn () => self::ready() && Schema::hasTable('project_threads') && Schema::hasTable('project_meetings'));
    }

    /** Look again at the next call (a test or a script creates the tables). */
    /** Script 264: link roles (stage 7). */
    public static function links(): bool
    {
        return self::once('links', fn () => self::ready() && Schema::hasTable('project_link_roles') && Schema::hasColumn('project_links', 'role_key'));
    }

    /** Script 265: people (stage 8). */
    public static function people(): bool
    {
        return self::once('people', fn () => self::ready() && Schema::hasTable('project_goals') && Schema::hasTable('project_cases'));
    }

    /** Script 266 and the vault: documents and portals (stage 9). */
    public static function documents(): bool
    {
        return self::once('documents', fn () => self::ready() && Schema::hasTable('project_files') && Schema::hasTable('vault_documents'));
    }

    /** Stage 10: resources and site (script 267). */
    public static function site(): bool
    {
        return self::once('site', fn () => self::ready() && Schema::hasTable('project_material_requests') && Schema::hasTable('project_snags'));
    }

    public static function forget(): void
    {
        foreach (['ready', 'control_room', 'relationships', 'money', 'work', 'messages', 'links', 'people', 'documents', 'site'] as $k) {
            app()->offsetUnset(self::KEY . $k);
        }
    }

    private static function once(string $k, callable $look): bool
    {
        if (! app()->bound(self::KEY . $k)) {
            app()->instance(self::KEY . $k, (bool) $look());
        }

        return (bool) app(self::KEY . $k);
    }
}
