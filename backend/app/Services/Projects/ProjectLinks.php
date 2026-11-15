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
        $groups = [];
        $hidden = 0;
        foreach ($usable as $key => $type) {
            $mine = $rows[$key] ?? collect();
            $about = $mine->isEmpty() ? [] : ($type['describe'])($mine->pluck('linked_id')->map(fn ($i) => (int) $i)->all());
            $groups[] = ['type' => $key, 'label' => $type['label'], 'plural' => $type['plural'], 'items' => $mine->map(function ($r) use ($about) {
                $d = $about[(int) $r->linked_id] ?? null;

                return ['id' => (int) $r->id, 'linked_id' => (int) $r->linked_id, 'title' => $d['title'] ?? 'No longer there', 'detail' => $d['detail'] ?? null, 'url' => $d['url'] ?? null,
                    'amount' => $d['amount'] ?? null, 'currency' => $d['currency'] ?? null, 'gone' => $d === null, 'note' => $r->note, 'added_by' => $r->added_by_name, 'added_at' => $r->created_at];
            })->values()->all()];
        }
        foreach ($rows as $key => $mine) {
            if (! isset($usable[$key])) {
                $hidden += $mine->count();
            }
        }
        // the modules that could hold links but are not on: said by name, so an owner knows what switching one on would bring
        $off = array_values(array_unique(array_map(fn ($t) => $t['plural'], array_filter($this->types->all(), fn ($t) => ! $this->moduleOn($t)))));

        return ['groups' => $groups, 'hidden' => $hidden, 'off' => $off];
    }

    /** @return array<int, array{id: int, title: string, detail: ?string}> */
    public function search(User $user, string $typeKey, string $q): array
    {
        return ($this->usable($user, $typeKey)['search'])($q);
    }

    public function add(object $project, string $typeKey, int $linkedId, ?string $note, User $by): int
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
        $note = $note === null ? null : (mb_substr(trim((string) preg_replace('/\s+/u', ' ', strip_tags($note))), 0, 200) ?: null);
        if ($existing) {
            DB::table('project_links')->where('id', $existing->id)->update(['deleted_at' => null, 'deleted_by' => null, 'note' => $note, 'added_by' => $by->id, 'updated_at' => now()]);
            $id = (int) $existing->id;
        } else {
            $id = DB::table('project_links')->insertGetId($where + ['note' => $note, 'added_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
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
