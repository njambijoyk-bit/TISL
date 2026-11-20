<?php

namespace App\Services\Projects;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Snags (docs/PROJECTS_STAGE10_SPEC.md, build 10.7): what, where, a photo, given to someone on the work or a subcontract, by a day. Open, then
 * fixed by whoever it was given to (a subcontractor on their portal included), then closed by whoever may inspect, or opened again. A failed
 * inspection answer raises one (10.6). A snag shared with the client shows on their portal. Late ones are told once a day.
 */
class ProjectSnags
{
    public function __construct(private ProjectAccess $access) {}

    /** @return array<string, mixed> */
    public function page(object $project, User $user, ?string $state = null): array
    {
        $this->access->authorize($user, 'open', $project);
        if (! ProjectsSetup::site()) {
            return ['ready' => false];
        }
        $q = DB::table('project_snags')->where('project_id', $project->id)->whereNull('deleted_at');
        $counts = (clone $q)->selectRaw('state, COUNT(*) AS n')->groupBy('state')->pluck('n', 'state');
        if (in_array($state, ['open', 'fixed', 'closed'], true)) {
            $q->where('state', $state);
        }
        $rows = $q->orderByRaw("CASE state WHEN 'open' THEN 0 WHEN 'fixed' THEN 1 ELSE 2 END")->orderByRaw('due_on IS NULL')->orderBy('due_on')->orderBy('number')->limit(500)->get();

        return ['ready' => true, 'snags' => $this->shape($rows, $user), 'counts' => ['open' => (int) ($counts['open'] ?? 0), 'fixed' => (int) ($counts['fixed'] ?? 0), 'closed' => (int) ($counts['closed'] ?? 0)],
            'people' => DB::table('project_members as m')->join('users as u', 'u.id', '=', 'm.user_id')->where('m.project_id', $project->id)->where('m.status', 'active')->orderBy('u.name')->get(['u.id', 'u.name'])->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name])->all(),
            'subcontracts' => DB::table('project_subcontracts')->where('project_id', $project->id)->where('state', 'active')->whereNull('deleted_at')->orderBy('title')->get(['id', 'title', 'vendor_id'])
                ->map(fn ($s) => ['id' => (int) $s->id, 'name' => $s->title . ' · ' . $this->vendorName((int) $s->vendor_id)])->all(),
            'can' => ['manage' => $this->access->decide($user, 'inspections', $project)['allowed'], 'photos' => ProjectsSetup::documents()]];
    }

    /** @param array<string, mixed> $d title, area, user_id | subcontract_id, due_on, shared @return int */
    public function raise(object $project, array $d, ?User $by, ?int $inspectionId = null, ?int $fileId = null): int
    {
        if (! $inspectionId) {
            $this->access->authorize($by, 'inspections', $project);
        }
        ProjectsSetup::site() || throw new ProjectException('The site is not set up yet. Run script 267.', 409);
        $title = trim((string) ($d['title'] ?? ''));
        $title !== '' || throw new ProjectException('Say what the snag is.');
        [$user, $sub] = $this->given($project, $d);
        $number = (int) DB::table('project_snags')->where('project_id', $project->id)->max('number') + 1;
        $id = DB::table('project_snags')->insertGetId(['project_id' => $project->id, 'number' => $number, 'title' => mb_substr($title, 0, 200), 'area' => ! empty($d['area']) ? mb_substr(trim((string) $d['area']), 0, 160) : null,
            'file_id' => $fileId, 'user_id' => $user, 'subcontract_id' => $sub, 'due_on' => $this->day($d['due_on'] ?? null), 'state' => 'open', 'shared' => ! empty($d['shared']) ? 1 : 0, 'inspection_id' => $inspectionId,
            'raised_by' => $by?->id, 'created_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'snag.raised', 'snag', $id, null, ['number' => $number, 'title' => $title, 'inspection' => $inspectionId]);
        $this->tellGiven($project, (object) ['number' => $number, 'title' => $title, 'user_id' => $user, 'subcontract_id' => $sub, 'due_on' => $this->day($d['due_on'] ?? null)], $by, false);

        return $id;
    }

    /** @param array<string, mixed> $d title, area, user_id | subcontract_id, due_on, shared */
    public function update(object $project, int $id, array $d, User $by): void
    {
        $this->access->authorize($by, 'inspections', $project);
        $s = $this->snag($project, $id);
        $row = [];
        if (array_key_exists('title', $d)) {
            $t = trim((string) $d['title']);
            $t !== '' || throw new ProjectException('Say what the snag is.');
            $row['title'] = mb_substr($t, 0, 200);
        }
        if (array_key_exists('area', $d)) {
            $row['area'] = $d['area'] ? mb_substr(trim((string) $d['area']), 0, 160) : null;
        }
        if (array_key_exists('due_on', $d)) {
            $row['due_on'] = $this->day($d['due_on']);
            $row['reminded_on'] = null;
        }
        if (array_key_exists('shared', $d)) {
            $row['shared'] = $d['shared'] ? 1 : 0;
        }
        if (array_key_exists('user_id', $d) || array_key_exists('subcontract_id', $d)) {
            [$row['user_id'], $row['subcontract_id']] = $this->given($project, $d);
        }
        if ($row) {
            DB::table('project_snags')->where('id', $id)->update($row + ['updated_at' => now()]);
            ProjectLog::record((int) $project->id, $by, 'snag.changed', 'snag', $id, null, array_diff_key($row, ['reminded_on' => 1]));
            if (isset($row['user_id']) || isset($row['subcontract_id'])) {
                $this->tellGiven($project, (object) (array_merge((array) $s, $row)), $by, false);
            }
        }
    }

    /** Whoever it was given to says it is fixed (or anyone who may inspect, for them). */
    public function fix(object $project, int $id, ?string $note, User $by): void
    {
        $s = $this->snag($project, $id);
        if ((int) $s->user_id !== (int) $by->id) {
            $this->access->authorize($by, 'inspections', $project);
        }
        $this->markFixed($project, $s, $note, $by->name, $by);
    }

    /** The subcontractor says it is fixed, on their portal. */
    public function fixByVendor(int $vendorId, int $id, ?string $note, User $by): void
    {
        $s = DB::table('project_snags as n')->join('project_subcontracts as s', 's.id', '=', 'n.subcontract_id')->where('n.id', $id)->where('s.vendor_id', $vendorId)->whereNull('n.deleted_at')->first(['n.*']);
        $s || throw new ProjectException('Not found.', 404);
        $project = DB::table('projects')->where('id', $s->project_id)->whereNull('deleted_at')->first() ?? throw new ProjectException('Not found.', 404);
        $this->markFixed($project, $s, $note, $this->vendorName((int) DB::table('project_subcontracts')->where('id', $s->subcontract_id)->value('vendor_id')), $by);
    }

    /** Checked and closed, by whoever may inspect. */
    public function close(object $project, int $id, User $by): void
    {
        $this->access->authorize($by, 'inspections', $project);
        $s = $this->snag($project, $id);
        $s->state !== 'closed' || throw new ProjectException('That snag is already closed.');
        DB::table('project_snags')->where('id', $id)->update(['state' => 'closed', 'closed_by' => $by->id, 'closed_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'snag.closed', 'snag', $id, null, ['number' => (int) $s->number]);
    }

    /** Not fixed after all: open again, with why. */
    public function reopen(object $project, int $id, string $note, User $by): void
    {
        $this->access->authorize($by, 'inspections', $project);
        $s = $this->snag($project, $id);
        $s->state !== 'open' || throw new ProjectException('That snag is open already.');
        trim($note) !== '' || throw new ProjectException('Say why it is opened again.');
        DB::table('project_snags')->where('id', $id)->update(['state' => 'open', 'fixed_note' => mb_substr('Opened again: ' . trim($note), 0, 500), 'fixed_at' => null, 'fixed_by_name' => null, 'closed_by' => null, 'closed_at' => null, 'reminded_on' => null, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'snag.reopened', 'snag', $id, null, ['number' => (int) $s->number, 'why' => $note]);
        $this->tellGiven($project, $s, $by, false, "Opened again: {$note}");
    }

    public function photo(object $project, int $id, UploadedFile $file, User $by): void
    {
        $s = $this->snag($project, $id);
        if ((int) $s->user_id !== (int) $by->id) {
            $this->access->authorize($by, 'inspections', $project);
        }
        $fileId = $this->keepPhoto($project, $file, $by->id, 'Snags');
        DB::table('project_snags')->where('id', $id)->update(['file_id' => $fileId, 'updated_at' => now()]);
    }

    public function remove(object $project, int $id, User $by): void
    {
        $this->access->authorize($by, 'inspections', $project);
        $s = $this->snag($project, $id);
        DB::table('project_snags')->where('id', $id)->update(['deleted_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'snag.removed', 'snag', $id, null, ['number' => (int) $s->number]);
    }

    /** Late open snags, told once a day to whoever they are given to. @return int */
    public function remind(?Carbon $today = null): int
    {
        if (! ProjectsSetup::site()) {
            return 0;
        }
        $today = ($today ?? now())->toDateString();
        $n = 0;
        foreach (DB::table('project_snags as s')->join('projects as p', 'p.id', '=', 's.project_id')->where('s.state', 'open')->whereNull('s.deleted_at')->whereNull('p.deleted_at')->whereIn('p.state', ['open', 'on_hold'])
            ->whereNotNull('s.due_on')->where('s.due_on', '<', $today)->where(fn ($q) => $q->whereNull('s.reminded_on')->orWhere('s.reminded_on', '<', $today))->get(['s.*', 'p.number as project_number', 'p.title as project_title']) as $s) {
            $this->tellGiven((object) ['id' => $s->project_id, 'number' => $s->project_number, 'title' => $s->project_title], $s, null, true);
            DB::table('project_snags')->where('id', $s->id)->update(['reminded_on' => $today]);
            $n++;
        }

        return $n;
    }

    /** Snags given to a vendor's subcontracts, for their portal. @return array<int, array<string, mixed>> */
    public function forVendor(int $vendorId): array
    {
        if (! ProjectsSetup::site()) {
            return [];
        }
        $rows = DB::table('project_snags as n')->join('project_subcontracts as s', 's.id', '=', 'n.subcontract_id')->join('projects as p', 'p.id', '=', 'n.project_id')->where('s.vendor_id', $vendorId)
            ->whereNull('n.deleted_at')->whereNull('p.deleted_at')->whereIn('n.state', ['open', 'fixed'])->orderByRaw("CASE n.state WHEN 'open' THEN 0 ELSE 1 END")->orderBy('n.due_on')->get(['n.*', 'p.number as project_number', 's.title as sub_title']);

        return $rows->map(fn ($s) => ['id' => (int) $s->id, 'project' => $s->project_number, 'subcontract' => $s->sub_title, 'number' => (int) $s->number, 'title' => $s->title, 'area' => $s->area, 'due_on' => $s->due_on,
            'late' => $s->state === 'open' && $s->due_on && $s->due_on < now()->toDateString(), 'state' => $s->state, 'note' => $s->fixed_note])->all();
    }

    /** Snags shared with the client, for the client portal. @return array<int, array<string, mixed>> */
    public function forClient(object $project): array
    {
        if (! ProjectsSetup::site()) {
            return [];
        }

        return DB::table('project_snags')->where('project_id', $project->id)->where('shared', 1)->whereNull('deleted_at')->orderByRaw("CASE state WHEN 'open' THEN 0 WHEN 'fixed' THEN 1 ELSE 2 END")->orderBy('number')
            ->get(['number', 'title', 'area', 'state', 'due_on'])->map(fn ($s) => ['number' => (int) $s->number, 'title' => $s->title, 'area' => $s->area, 'state' => $s->state, 'due_on' => $s->due_on])->all();
    }

    /** @internal photos for snags and inspections go into the work's Files, in a folder of that name */
    public function keepPhoto(object $project, UploadedFile $file, ?int $byId, string $folderName): int
    {
        ProjectsSetup::documents() || throw new ProjectException('Photos need the work\'s Files (script 266).', 409);
        $folder = DB::table('project_folders')->where('project_id', $project->id)->whereNull('parent_id')->where('name', $folderName)->whereNull('deleted_at')->value('id')
            ?? DB::table('project_folders')->insertGetId(['project_id' => $project->id, 'parent_id' => null, 'name' => $folderName, 'created_by' => $byId, 'created_at' => now(), 'updated_at' => now()]);

        return app(ProjectFiles::class)->receive($project, $file, (int) $folder, $byId, 'site');
    }

    // ------------------------------------------------------------------ inside

    /** @return array<int, array<string, mixed>> */
    private function shape($rows, User $viewer): array
    {
        $users = DB::table('users')->whereIn('id', array_merge($rows->pluck('user_id')->filter()->all(), $rows->pluck('raised_by')->filter()->all(), [0]))->pluck('name', 'id');
        $subs = DB::table('project_subcontracts')->whereIn('id', $rows->pluck('subcontract_id')->filter()->all() ?: [0])->get(['id', 'title', 'vendor_id'])->keyBy('id');
        $files = Schema::hasTable('project_files') ? DB::table('project_files')->whereIn('id', $rows->pluck('file_id')->filter()->all() ?: [0])->pluck('name', 'id') : collect();

        return $rows->map(fn ($s) => ['id' => (int) $s->id, 'number' => (int) $s->number, 'title' => $s->title, 'area' => $s->area, 'state' => $s->state, 'due_on' => $s->due_on,
            'late' => $s->state === 'open' && $s->due_on && $s->due_on < now()->toDateString(), 'shared' => (bool) $s->shared, 'from_inspection' => (bool) $s->inspection_id,
            'given' => $s->user_id ? ['kind' => 'person', 'id' => (int) $s->user_id, 'name' => $users[$s->user_id] ?? 'Someone'] : ($s->subcontract_id && isset($subs[$s->subcontract_id]) ? ['kind' => 'subcontract', 'id' => (int) $s->subcontract_id, 'name' => $this->vendorName((int) $subs[$s->subcontract_id]->vendor_id)] : null),
            'mine' => (int) $s->user_id === (int) $viewer->id, 'file' => $s->file_id ? ['id' => (int) $s->file_id, 'name' => $files[$s->file_id] ?? 'Photo'] : null, 'fixed_note' => $s->fixed_note, 'fixed_by' => $s->fixed_by_name, 'fixed_at' => $s->fixed_at,
            'raised_by' => $users[$s->raised_by] ?? null, 'at' => $s->created_at])->all();
    }

    private function markFixed(object $project, object $s, ?string $note, string $byName, ?User $by): void
    {
        $s->state === 'open' || throw new ProjectException('Only an open snag can be marked fixed.');
        DB::table('project_snags')->where('id', $s->id)->update(['state' => 'fixed', 'fixed_note' => $note ? mb_substr(trim($note), 0, 500) : null, 'fixed_by_name' => mb_substr($byName, 0, 120), 'fixed_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'snag.fixed', 'snag', (int) $s->id, null, ['number' => (int) $s->number, 'by' => $byName]);
        if ($s->raised_by && (int) $s->raised_by !== (int) $by?->id && ($u = User::find($s->raised_by))) {
            ProjectNotices::tell($u, ProjectNotices::TASK, "Snag {$s->number} fixed · {$project->number}", "{$byName}: {$s->title}" . ($note ? "\n{$note}" : '') . "\nCheck it and close it.", "/admin/projects/{$project->id}?tab=site&part=snags", 'Check it');
        }
    }

    /** @return array{0: ?int, 1: ?int} */
    private function given(object $project, array $d): array
    {
        $user = ! empty($d['user_id']) ? (int) $d['user_id'] : null;
        $sub = ! empty($d['subcontract_id']) ? (int) $d['subcontract_id'] : null;
        if ($user && $sub) {
            throw new ProjectException('Give it to someone on the work or a subcontract, not both.');
        }
        if ($user && ! DB::table('project_members')->where(['project_id' => $project->id, 'user_id' => $user, 'status' => 'active'])->exists()) {
            throw new ProjectException('Give it to someone on the work.');
        }
        if ($sub && ! DB::table('project_subcontracts')->where('id', $sub)->where('project_id', $project->id)->whereNull('deleted_at')->exists()) {
            throw new ProjectException('Give it to a subcontract on this work.');
        }

        return [$user, $sub];
    }

    private function tellGiven(object $project, object $s, ?User $by, bool $late, ?string $extra = null): void
    {
        $title = ($late ? 'Late: ' : '') . "Snag {$s->number} · {$project->number}";
        $body = $s->title . (! empty($s->due_on) ? "\nBy " . Carbon::parse($s->due_on)->format('j M') . '.' : '') . ($extra ? "\n{$extra}" : '');
        if (! empty($s->user_id) && (int) $s->user_id !== (int) $by?->id && ($u = User::find($s->user_id))) {
            ProjectNotices::tell($u, ProjectNotices::TASK, $title, $body, "/admin/projects/{$project->id}?tab=site&part=snags", 'Open the snags');
        } elseif (! empty($s->subcontract_id) && Schema::hasColumn('vendors', 'user_id')) {
            $userId = DB::table('project_subcontracts as c')->join('vendors as v', 'v.id', '=', 'c.vendor_id')->where('c.id', $s->subcontract_id)->value('v.user_id');
            if ($userId && ($u = User::find($userId))) {
                ProjectNotices::tell($u, ProjectNotices::REQUEST, $title, $body, '/vendor-portal/subcontracts', 'Open your snags');
            }
        }
    }

    private function snag(object $project, int $id): object
    {
        return DB::table('project_snags')->where('id', $id)->where('project_id', $project->id)->whereNull('deleted_at')->first() ?? throw new ProjectException('That snag is not on this work.', 404);
    }

    private function vendorName(int $id): string
    {
        $v = Schema::hasTable('vendors') ? DB::table('vendors')->where('id', $id)->first(['company_name', 'contact_name']) : null;

        return $v ? ($v->company_name ?: $v->contact_name ?: "Vendor {$id}") : "Vendor {$id}";
    }

    private function day(mixed $v): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }

        return is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : throw new ProjectException('Choose a day.');
    }
}
