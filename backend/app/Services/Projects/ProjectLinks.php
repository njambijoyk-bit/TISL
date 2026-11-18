<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Licensing\LicenseManager;
use Illuminate\Support\Facades\DB;

/**
 * Records from other modules attached to a project. What a person sees is decided three times over: the module must be licensed and switched
 * on, the person must hold that module's own permission to see the record, and they must be able to open the project. A link whose module is
 * off is kept and not shown; it is back when the module is.
 */
class ProjectLinks
{
    public function __construct(private ProjectLinkTypes $types, private ProjectAccess $access, private LicenseManager $licence) {}

    /** The link types this person can use right now. @return array<string, array<string, mixed>> */
    public function usableTypes(User $user): array
    {
        return array_filter($this->types->all(), fn ($t) => $this->moduleOn($t) && $user->hasPermission($t['permission']));
    }

    /**
     * What is attached to a project, grouped by type, for this person.
     *
     * @return array{groups: array<int, array<string, mixed>>, hidden: int, off: string[]}
     */
    public function forProject(object $project, User $user): array
    {
        $rows = DB::table('project_links as l')->leftJoin('users as u', 'u.id', '=', 'l.added_by')->where('l.project_id', $project->id)->whereNull('l.deleted_at')
            ->orderBy('l.id')->get(['l.*', 'u.name as added_by_name'])->groupBy(fn ($r) => $r->module . '.' . $r->link_type);
        $usable = $this->usableTypes($user);
        $roles = $this->roleMap();
        $groups = [];
        $hidden = 0;
        foreach ($usable as $key => $type) {
            $mine = $rows[$key] ?? collect();
            $about = $mine->isEmpty() ? [] : ($type['describe'])($mine->pluck('linked_id')->map(fn ($i) => (int) $i)->all());
            $groups[] = ['type' => $key, 'label' => $type['label'], 'plural' => $type['plural'], 'module' => $type['module'], 'value' => ! empty($type['value']),
                'new' => isset($type['create']) && $this->access->decide($user, 'links', $project)['allowed'] && ! $project->frozen_at ? array_values(($type['create'])($project)) : [],
                'items' => $mine->map(function ($r) use ($about, $type, $roles) {
                    $d = $about[(int) $r->linked_id] ?? null;
                    $state = $d['state'] ?? null;
                    $role = $r->role_key ?? null;

                    return ['id' => (int) $r->id, 'linked_id' => (int) $r->linked_id, 'title' => $d['title'] ?? 'No longer there', 'detail' => $d['detail'] ?? null, 'url' => $d['url'] ?? null,
                        'amount' => $d['amount'] ?? null, 'currency' => $d['currency'] ?? null, 'gone' => $d === null, 'note' => $r->note, 'added_by' => $r->added_by_name, 'added_at' => $r->created_at,
                        'state' => $state !== null ? ['key' => $state, 'label' => $type['states'][$state][0] ?? ucfirst(str_replace('_', ' ', (string) $state)), 'status' => $type['states'][$state][1] ?? null] : null,
                        'role' => $role && isset($roles[$role]) ? $roles[$role] : null];
                })->values()->all()];
        }
        $agreed = [];
        foreach ($groups as $g) {
            foreach ($g['items'] as $i) {
                if (($i['role']['key'] ?? null) === 'agreed_value' && $i['amount'] !== null && ! $i['gone']) {
                    $agreed[$i['currency'] ?? ''] = ($agreed[$i['currency'] ?? ''] ?? 0) + $i['amount'];
                }
            }
        }
        foreach ($rows as $key => $mine) {
            if (! isset($usable[$key])) {
                $hidden += $mine->count();
            }
        }
        // the modules that could hold links but are not on: said by name, so an owner knows what switching one on would bring
        $off = array_values(array_unique(array_map(fn ($t) => $t['plural'], array_filter($this->types->all(), fn ($t) => ! $this->moduleOn($t)))));

        $removed = ProjectsSetup::links() ? DB::table('project_links as l')->leftJoin('users as u', 'u.id', '=', 'l.deleted_by')->where('l.project_id', $project->id)->whereNotNull('l.deleted_at')
            ->orderByDesc('l.deleted_at')->limit(50)->get(['l.*', 'u.name as removed_by'])
            ->filter(fn ($r) => isset($usable[$r->module . '.' . $r->link_type]))
            ->map(function ($r) use ($usable) {
                $type = $usable[$r->module . '.' . $r->link_type];
                $d = ($type['describe'])([(int) $r->linked_id])[(int) $r->linked_id] ?? null;

                return ['id' => (int) $r->id, 'what' => $type['label'], 'title' => $d['title'] ?? 'No longer there', 'removed_by' => $r->removed_by, 'removed_at' => $r->deleted_at, 'gone' => $d === null];
            })->values()->all() : [];

        return ['groups' => $groups, 'hidden' => $hidden, 'off' => $off, 'roles' => array_values($roles), 'removed' => $removed,
            'agreed' => array_map(fn ($c, $a) => ['currency' => $c ?: null, 'amount' => round($a, 2)], array_keys($agreed), array_values($agreed)),
            'count' => array_sum(array_map(fn ($g) => count($g['items']), $groups))];
    }

    /** What the record is to the work, and a note. A role of null takes it off. */
    public function change(object $project, int $linkId, array $d, User $by): void
    {
        $this->access->authorize($by, 'links', $project);
        $link = $this->mine($project, $linkId, $by);
        $row = ['updated_at' => now()];
        if (array_key_exists('role', $d)) {
            $row['role_key'] = $this->checkRole($d['role']);
        }
        if (array_key_exists('note', $d)) {
            $row['note'] = $this->cleanNote($d['note']);
        }
        DB::table('project_links')->where('id', $link->id)->update($row);
        $new = array_intersect_key(['role' => $row['role_key'] ?? null, 'note' => $row['note'] ?? null], array_intersect_key(['role' => 1, 'note' => 1], $d));
        ProjectLog::record((int) $project->id, $by, 'link.changed', 'link', (int) $link->id, array_intersect_key(['role' => $link->role_key ?? null, 'note' => $link->note], $new), $new);
    }

    /** Put a link that was taken off back (owner's choice 4). */
    public function restore(object $project, int $linkId, User $by): void
    {
        $this->access->authorize($by, 'links', $project);
        $link = DB::table('project_links')->where('id', $linkId)->where('project_id', $project->id)->whereNotNull('deleted_at')->first() ?? throw new ProjectException('Not found.', 404);
        $this->usable($by, $link->module . '.' . $link->link_type);
        DB::table('project_links')->where('id', $link->id)->update(['deleted_at' => null, 'deleted_by' => null, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'link.restored', 'link', (int) $link->id, null, ['what' => $link->module . '.' . $link->link_type, 'linked_id' => (int) $link->linked_id]);
    }

    /** @return array<int, array<string, mixed>> */
    public function roles(bool $all = false): array
    {
        if (! ProjectsSetup::links()) {
            return [];
        }

        return DB::table('project_link_roles')->when(! $all, fn ($q) => $q->where('is_active', 1))->orderBy('sort_order')->orderBy('name')->get()
            ->map(fn ($r) => ['id' => (int) $r->id, 'key' => $r->key, 'name' => $r->name, 'status' => $r->status_token, 'is_active' => (bool) $r->is_active])->all();
    }

    public function saveRole(?int $id, array $d, User $by): void
    {
        if (! ProjectsSetup::links()) {
            throw new ProjectException('Link roles need database script 264.', 409);
        }
        $name = trim(preg_replace('/\s+/', ' ', (string) ($d['name'] ?? '')));
        if ($name === '') {
            throw new ProjectException('Give the role a name.');
        }
        $status = in_array($d['status'] ?? null, ['info', 'good', 'warning', 'problem'], true) ? $d['status'] : null;
        $row = ['name' => mb_substr($name, 0, 60), 'status_token' => $status, 'is_active' => array_key_exists('is_active', $d) ? (int) (bool) $d['is_active'] : 1];
        if ($id) {
            DB::table('project_link_roles')->where('id', $id)->update($row) || DB::table('project_link_roles')->where('id', $id)->exists() || throw new ProjectException('Not found.', 404);
        } else {
            $key = trim(preg_replace('/[^a-z0-9]+/', '_', mb_strtolower((string) ($d['key'] ?? '') ?: $name)), '_');
            if (DB::table('project_link_roles')->where('key', $key)->exists()) {
                throw new ProjectException('There is already a role like that.');
            }
            DB::table('project_link_roles')->insert($row + ['key' => mb_substr($key, 0, 30), 'sort_order' => (int) DB::table('project_link_roles')->max('sort_order') + 1, 'created_by' => $by->id, 'created_at' => now()]);
        }
        ProjectLog::record(null, $by, 'link_role.saved', 'link_role', $id, null, ['name' => $name]);
    }

    /** @return array<int, array{id: int, title: string, detail: ?string}> */
    public function search(User $user, string $typeKey, string $q): array
    {
        return ($this->usable($user, $typeKey)['search'])($q);
    }

    public function add(object $project, string $typeKey, int $linkedId, ?string $note, User $by, ?string $role = null): int
    {
        $this->access->authorize($by, 'links', $project);
        $type = $this->usable($by, $typeKey);
        $about = ($type['describe'])([$linkedId]);
        if (! isset($about[$linkedId])) {
            throw new ProjectException('That record does not exist.');
        }
        [$module, $linkType] = explode('.', $typeKey, 2);
        $where = ['project_id' => $project->id, 'module' => $module, 'link_type' => $linkType, 'linked_id' => $linkedId];
        $existing = DB::table('project_links')->where($where)->first();
        if ($existing && $existing->deleted_at === null) {
            throw new ProjectException('It is already linked.');
        }
        $note = $this->cleanNote($note);
        $default = isset($type['role']) ? (is_callable($type['role']) ? ($type['role'])($linkedId) : $type['role']) : null;
        $extra = ProjectsSetup::links() ? ['role_key' => $this->checkRole($role ?? $default)] : [];
        if ($existing) {
            DB::table('project_links')->where('id', $existing->id)->update(['deleted_at' => null, 'deleted_by' => null, 'note' => $note, 'added_by' => $by->id, 'updated_at' => now()] + $extra);
            $id = (int) $existing->id;
        } else {
            $id = DB::table('project_links')->insertGetId($where + ['note' => $note, 'added_by' => $by->id, 'created_at' => now(), 'updated_at' => now()] + $extra);
        }
        ProjectLog::record((int) $project->id, $by, 'link.added', 'link', $id, null, ['what' => $type['label'], 'title' => $about[$linkedId]['title']]);

        return $id;
    }

    public function remove(object $project, int $linkId, User $by): void
    {
        $this->access->authorize($by, 'links', $project);
        $link = DB::table('project_links')->where('id', $linkId)->where('project_id', $project->id)->whereNull('deleted_at')->first();
        if (! $link) {
            throw new ProjectException('Not found.', 404);
        }
        $this->usable($by, $link->module . '.' . $link->link_type);   // a link they cannot see is not theirs to remove
        DB::table('project_links')->where('id', $link->id)->update(['deleted_at' => now(), 'deleted_by' => $by->id]);
        ProjectLog::record((int) $project->id, $by, 'link.removed', 'link', (int) $link->id, ['what' => $link->module . '.' . $link->link_type, 'linked_id' => (int) $link->linked_id], null);
    }

    /**
     * The other way round, for a module's own page ("part of project M-0413"): the projects a record is attached to that this person may open.
     *
     * @return array<int, array{id: int, number: string, title: string}>
     */
    public function projectsOf(User $user, string $typeKey, int $linkedId): array
    {
        if (! ProjectsSetup::ready() || ! $user->hasPermission('projects.use') || ! $this->licence->isActive('projects') || ! str_contains($typeKey, '.')) {
            return [];
        }
        [$module, $linkType] = explode('.', $typeKey, 2);
        $q = DB::table('projects as p')->join('project_links as l', 'l.project_id', '=', 'p.id')->where('l.module', $module)->where('l.link_type', $linkType)->where('l.linked_id', $linkedId)->whereNull('l.deleted_at');

        return $this->access->visible($q, $user)->orderBy('p.number')->get(['p.id', 'p.number', 'p.title'])->map(fn ($p) => ['id' => (int) $p->id, 'number' => $p->number, 'title' => $p->title])->all();
    }

    /** From a module's own page (build 7.4): may this person add this record to a piece of work at all? */
    public function mayAddFrom(User $user, string $typeKey): bool
    {
        $type = $this->types->get($typeKey);

        return $type && ProjectsSetup::ready() && $this->licence->isActive('projects') && $this->moduleOn($type) && $user->hasPermission('projects.links') && $user->hasPermission($type['permission']);
    }

    /** The pieces of work this person may add the record to: ones they can see and link on, not closed, not already holding it. @return array<int, array{id: int, number: string, title: string}> */
    public function targets(User $user, string $typeKey, int $linkedId, string $q = ''): array
    {
        if (! $this->mayAddFrom($user, $typeKey)) {
            return [];
        }
        [$module, $linkType] = explode('.', $typeKey, 2);
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], trim($q)) . '%';
        $query = DB::table('projects as p')->whereNotIn('p.state', ['closed', 'cancelled'])->whereNull('p.frozen_at')
            ->whereNotExists(fn ($l) => $l->from('project_links as l')->whereColumn('l.project_id', 'p.id')->where('l.module', $module)->where('l.link_type', $linkType)->where('l.linked_id', $linkedId)->whereNull('l.deleted_at'))
            ->when(trim($q) !== '', fn ($w) => $w->where(fn ($x) => $x->where('p.number', 'like', $like)->orWhere('p.title', 'like', $like)));
        $rows = $this->access->visible($query, $user)->orderByDesc('p.updated_at')->limit(60)->get(['p.*']);

        return $rows->filter(fn ($p) => $this->access->decide($user, 'links', $p)['allowed'])->take(20)
            ->map(fn ($p) => ['id' => (int) $p->id, 'number' => $p->number, 'title' => $p->title])->values()->all();
    }

    /** @return array<string, array<string, mixed>> key => role */
    private function roleMap(): array
    {
        return collect($this->roles(true))->keyBy('key')->map(fn ($r) => ['key' => $r['key'], 'name' => $r['name'], 'status' => $r['status']])->all();
    }

    private function checkRole(mixed $role): ?string
    {
        $role = $role === null || $role === '' ? null : (string) $role;
        if ($role !== null && ! DB::table('project_link_roles')->where('key', $role)->where('is_active', 1)->exists()) {
            throw new ProjectException('Choose what it is to the work from the list.');
        }

        return $role;
    }

    private function cleanNote(mixed $note): ?string
    {
        return $note === null ? null : (mb_substr(trim((string) preg_replace('/\s+/u', ' ', strip_tags((string) $note))), 0, 200) ?: null);
    }

    private function mine(object $project, int $linkId, User $by): object
    {
        $link = DB::table('project_links')->where('id', $linkId)->where('project_id', $project->id)->whereNull('deleted_at')->first() ?? throw new ProjectException('Not found.', 404);
        $this->usable($by, $link->module . '.' . $link->link_type);

        return $link;
    }

    /** @return array<string, mixed> */
    private function usable(User $user, string $typeKey): array
    {
        $type = $this->types->get($typeKey);
        if (! $type || ! $this->moduleOn($type)) {
            throw new ProjectException('That kind of link is not available.', 404);
        }
        if (! $user->hasPermission($type['permission'])) {
            ProjectLog::refused(null, $user, 'link.' . $typeKey, 'Does not hold ' . $type['permission']);
            throw new ProjectException('You may not see those records.', 403);
        }

        return $type;
    }

    /** @param array<string, mixed> $type */
    private function moduleOn(array $type): bool
    {
        return $type['module'] === null || $this->licence->isActive($type['module']);
    }
}
