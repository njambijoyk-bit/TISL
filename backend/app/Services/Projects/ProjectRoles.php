<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Project roles: what a person may do ON a project (the second of the two questions). They are rows an owner renames, changes and adds to:
 * Lead, Member, Finance, Reviewer, Client and Guest ship; a firm adds Partner, a contractor adds Site agent.
 * The Lead role always keeps opening the project, changing it and managing its people, so a project can never be left unmanageable.
 */
class ProjectRoles
{
    /** ability => what it lets a person do on a project, in words for the configuration page */
    public const ABILITIES = [
        'open' => 'Open it',
        'edit' => 'Change its details, freeze it, make it confidential',
        'stage' => 'Move its stage, hold, close and cancel it',
        'phases' => 'Add and change its phases',
        'members' => 'Invite and remove people',
        'links' => 'Add and remove links',
        'log' => 'Read its activity log',
        'open_shared' => 'See only what is shared with them (for clients and guests)',
    ];

    private const LEAD_KEEPS = ['open', 'edit', 'members'];

    /** @return array<int, array<string, mixed>> */
    public function all(): array
    {
        if (! ProjectsSetup::ready()) {
            return [];
        }
        $abilities = DB::table('project_role_permissions')->get()->groupBy('project_role_id');
        $used = DB::table('project_members')->whereIn('status', ['active', 'invited'])->selectRaw('project_role_id, COUNT(*) AS n')->groupBy('project_role_id')->pluck('n', 'project_role_id');

        return DB::table('project_roles')->orderBy('sort_order')->orderBy('name')->get()
            ->map(fn ($r) => ['id' => (int) $r->id, 'key' => $r->key, 'name' => $r->name, 'description' => $r->description, 'is_system' => (bool) $r->is_system, 'is_active' => (bool) $r->is_active,
                'abilities' => array_values(array_intersect(array_keys(self::ABILITIES), ($abilities[$r->id] ?? collect())->pluck('ability')->all())), 'people' => (int) ($used[$r->id] ?? 0)])->all();
    }

    /** @param array<string, mixed> $d name, description, abilities, is_active */
    public function create(array $d, User $by): int
    {
        $name = $this->name($d['name'] ?? '');
        $key = $this->uniqueKey($name);
        $abilities = $this->abilities($d['abilities'] ?? []);
        $id = DB::transaction(function () use ($name, $key, $d, $abilities) {
            $id = DB::table('project_roles')->insertGetId(['key' => $key, 'name' => $name, 'description' => $this->line((string) ($d['description'] ?? ''), 200) ?: null, 'is_system' => 0, 'is_active' => 1,
                'sort_order' => ((int) DB::table('project_roles')->max('sort_order')) + 10, 'created_at' => now(), 'updated_at' => now()]);
            foreach ($abilities as $a) {
                DB::table('project_role_permissions')->insert(['project_role_id' => $id, 'ability' => $a]);
            }

            return $id;
        });
        ProjectLog::record(null, $by, 'project_role.added', 'project_role', $id, null, ['name' => $name, 'abilities' => $abilities]);

        return $id;
    }

    /** @param array<string, mixed> $d name, description, abilities, is_active */
    public function update(int $id, array $d, User $by): void
    {
        $role = DB::table('project_roles')->where('id', $id)->first();
        if (! $role) {
            throw new ProjectException('Not found.', 404);
        }
        $old = ['name' => $role->name, 'is_active' => (bool) $role->is_active, 'abilities' => DB::table('project_role_permissions')->where('project_role_id', $id)->orderBy('ability')->pluck('ability')->all()];
        $new = $old;
        if (array_key_exists('name', $d)) {
            $new['name'] = $this->name($d['name']);
        }
        if (array_key_exists('abilities', $d)) {
            $new['abilities'] = $this->abilities($d['abilities']);
            sort($new['abilities']);
        }
        if (array_key_exists('is_active', $d)) {
            $new['is_active'] = (bool) $d['is_active'];
        }
        if ($role->key === 'lead') {
            if (! $new['is_active'] || array_diff(self::LEAD_KEEPS, $new['abilities'])) {
                throw new ProjectException('The Lead role must stay on and keep opening the project, changing it and managing its people.');
            }
        }
        if (! $new['is_active'] && $old['is_active'] && DB::table('project_members')->where('project_role_id', $id)->whereIn('status', ['active', 'invited'])->exists()) {
            throw new ProjectException('People hold this role. Give them another role before switching it off.');
        }
        if ($new === $old && ! array_key_exists('description', $d)) {
            return;
        }
        DB::transaction(function () use ($id, $new, $old, $d) {
            DB::table('project_roles')->where('id', $id)->update(['name' => $new['name'], 'is_active' => $new['is_active'] ? 1 : 0, 'updated_at' => now()]
                + (array_key_exists('description', $d) ? ['description' => $this->line((string) $d['description'], 200) ?: null] : []));
            if ($new['abilities'] !== $old['abilities']) {
                DB::table('project_role_permissions')->where('project_role_id', $id)->delete();
                foreach ($new['abilities'] as $a) {
                    DB::table('project_role_permissions')->insert(['project_role_id' => $id, 'ability' => $a]);
                }
            }
        });
        if ($new !== $old) {
            ProjectLog::record(null, $by, 'project_role.changed', 'project_role', $id, array_diff_key($old, array_filter($old, fn ($v, $k) => $new[$k] === $v, ARRAY_FILTER_USE_BOTH)),
                array_diff_key($new, array_filter($new, fn ($v, $k) => $old[$k] === $v, ARRAY_FILTER_USE_BOTH)));
        }
    }

    private function name(mixed $v): string
    {
        $name = $this->line((string) $v, 80);
        if ($name === '') {
            throw new ProjectException('Give the role a name.');
        }

        return $name;
    }

    /** @return string[] */
    private function abilities(mixed $v): array
    {
        $list = array_values(array_unique(array_filter((array) $v, 'is_string')));
        if (array_diff($list, array_keys(self::ABILITIES))) {
            throw new ProjectException('That is not something a project role can allow.');
        }

        return $list;
    }

    private function uniqueKey(string $name): string
    {
        $base = trim((string) preg_replace('/[^a-z0-9]+/', '_', strtolower($name)), '_') ?: 'role';
        $base = substr($base, 0, 34);
        $key = $base;
        for ($i = 2; DB::table('project_roles')->where('key', $key)->exists(); $i++) {
            $key = $base . '_' . $i;
        }

        return $key;
    }

    private function line(string $s, int $max): string
    {
        return mb_substr(trim((string) preg_replace('/\s+/u', ' ', (string) preg_replace('/[\x00-\x1F\x7F<>]/u', ' ', strip_tags($s)))), 0, $max);
    }
}
