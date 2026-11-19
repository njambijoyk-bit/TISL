<?php

namespace App\Services\Projects;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Registers and expiry (docs/PROJECTS_STAGE9_SPEC.md, build 9.4). A register is a numbered list on a piece of work (number, title, revision,
 * status, the file), from a company register kind with its own statuses (drawings, documents, permits...). A new version of a register's file
 * moves its revision on (A to B, 1 to 2, P01 to P02). Any file may carry the day it runs out; the lead and whoever added it are told at 60, 30 and
 * 7 days and on the day.
 */
class ProjectRegisters
{
    public const WARN_AT = [60, 30, 7, 0];

    public function __construct(private ProjectAccess $access) {}

    /** @return array<int, array<string, mixed>> */
    public function kinds(bool $all = false): array
    {
        $this->needReady();

        return DB::table('project_register_kinds')->when(! $all, fn ($q) => $q->where('is_active', 1))->orderBy('name')->get()
            ->map(fn ($k) => ['id' => (int) $k->id, 'key' => $k->key, 'name' => $k->name, 'statuses' => array_values(array_filter(array_map('trim', explode(',', (string) $k->statuses)))), 'is_active' => (bool) $k->is_active])->all();
    }

    /** @param array<string, mixed> $d name, statuses (array or comma separated), is_active */
    public function saveKind(?int $id, array $d, User $by): void
    {
        $this->needReady();
        $name = trim((string) ($d['name'] ?? ''));
        $name !== '' || throw new ProjectException('Give the register kind a name.');
        $statuses = is_array($d['statuses'] ?? null) ? $d['statuses'] : explode(',', (string) ($d['statuses'] ?? ''));
        $statuses = array_values(array_unique(array_filter(array_map(fn ($s) => mb_substr(trim(str_replace(',', ' ', (string) $s)), 0, 40), $statuses))));
        $statuses || throw new ProjectException('Give it at least one status.');
        $row = ['name' => mb_substr($name, 0, 80), 'statuses' => mb_substr(implode(',', $statuses), 0, 300), 'is_active' => array_key_exists('is_active', $d) ? (int) (bool) $d['is_active'] : 1];
        if ($id) {
            DB::table('project_register_kinds')->where('id', $id)->update($row) || DB::table('project_register_kinds')->where('id', $id)->exists() || throw new ProjectException('Not found.', 404);
        } else {
            $key = trim(preg_replace('/[^a-z0-9]+/', '_', mb_strtolower($name)), '_');
            DB::table('project_register_kinds')->where('key', $key)->exists() && throw new ProjectException('There is already a register kind like that.');
            DB::table('project_register_kinds')->insert($row + ['key' => mb_substr($key, 0, 30), 'created_at' => now()]);
        }
        ProjectLog::record(null, $by, 'register_kind.saved', null, null, null, ['name' => $name]);
    }

    /** @return array<string, mixed> */
    public function forProject(object $project, User $user): array
    {
        $this->needReady();
        $this->access->authorize($user, 'files_view', $project);
        $kinds = collect($this->kinds(true))->keyBy('id');
        $registers = DB::table('project_registers')->where('project_id', $project->id)->orderBy('name')->get();
        $lines = DB::table('project_register_lines as l')->leftJoin('project_files as f', fn ($j) => $j->on('f.id', '=', 'l.file_id')->whereNull('f.deleted_at'))->whereIn('l.register_id', $registers->pluck('id')->all() ?: [0])
            ->orderBy('l.number')->get(['l.*', 'f.name as file_name'])->groupBy('register_id');

        return ['registers' => $registers->map(fn ($r) => ['id' => (int) $r->id, 'name' => $r->name, 'kind' => $kinds[$r->kind_id]['name'] ?? null, 'statuses' => $kinds[$r->kind_id]['statuses'] ?? [],
            'lines' => ($lines[$r->id] ?? collect())->map(fn ($l) => ['id' => (int) $l->id, 'number' => $l->number, 'title' => $l->title, 'revision' => $l->revision, 'status' => $l->status,
                'file' => $l->file_id && $l->file_name ? ['id' => (int) $l->file_id, 'name' => $l->file_name] : null, 'updated_at' => $l->updated_at])->values()->all()])->all(),
            'kinds' => array_values(array_filter($kinds->all(), fn ($k) => $k['is_active'])), 'can' => ['change' => $this->access->decide($user, 'files', $project)['allowed']]];
    }

    public function addRegister(object $project, int $kindId, ?string $name, User $by): int
    {
        $this->access->authorize($by, 'files', $project);
        $kind = DB::table('project_register_kinds')->where('id', $kindId)->where('is_active', 1)->first() ?? throw new ProjectException('Choose a register kind.');
        $id = DB::table('project_registers')->insertGetId(['project_id' => $project->id, 'kind_id' => $kind->id, 'name' => mb_substr(trim((string) $name) ?: $kind->name, 0, 120), 'created_by' => $by->id, 'created_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'register.added', 'register', $id, null, ['name' => $name ?: $kind->name]);

        return $id;
    }

    /** @param array<string, mixed> $d number, title, revision, status, file_id */
    public function saveLine(object $project, int $registerId, ?int $lineId, array $d, User $by): void
    {
        $this->access->authorize($by, 'files', $project);
        $reg = DB::table('project_registers')->where('id', $registerId)->where('project_id', $project->id)->first() ?? throw new ProjectException('Not found.', 404);
        $statuses = array_values(array_filter(array_map('trim', explode(',', (string) DB::table('project_register_kinds')->where('id', $reg->kind_id)->value('statuses')))));
        $number = mb_substr(trim((string) ($d['number'] ?? '')), 0, 40);
        $title = mb_substr(trim((string) ($d['title'] ?? '')), 0, 200);
        ($number !== '' && $title !== '') || throw new ProjectException('Give the line its number and title.');
        $status = ($d['status'] ?? '') !== '' ? (in_array($d['status'], $statuses, true) ? $d['status'] : throw new ProjectException('Choose a status from the list.')) : null;
        $file = ! empty($d['file_id']) ? (int) (DB::table('project_files')->where('id', (int) $d['file_id'])->where('project_id', $project->id)->whereNull('deleted_at')->value('id') ?? throw new ProjectException('Choose a file on this work.')) : null;
        if (DB::table('project_register_lines')->where('register_id', $reg->id)->where('number', $number)->when($lineId, fn ($q) => $q->where('id', '!=', $lineId))->exists()) {
            throw new ProjectException("There is already a line {$number} in this register.");
        }
        $row = ['number' => $number, 'title' => $title, 'revision' => mb_substr(trim((string) ($d['revision'] ?? '')), 0, 20) ?: null, 'status' => $status, 'file_id' => $file, 'updated_by' => $by->id, 'updated_at' => now()];
        if ($lineId) {
            DB::table('project_register_lines')->where('id', $lineId)->where('register_id', $reg->id)->update($row) || throw new ProjectException('Not found.', 404);
        } else {
            $lineId = DB::table('project_register_lines')->insertGetId($row + ['register_id' => $reg->id, 'created_at' => now()]);
        }
        ProjectLog::record((int) $project->id, $by, 'register.line', 'register', (int) $reg->id, null, ['line' => $number, 'revision' => $row['revision'], 'status' => $status]);
    }

    public function removeLine(object $project, int $registerId, int $lineId, User $by): void
    {
        $this->access->authorize($by, 'files', $project);
        DB::table('project_registers')->where('id', $registerId)->where('project_id', $project->id)->exists() || throw new ProjectException('Not found.', 404);
        $l = DB::table('project_register_lines')->where('id', $lineId)->where('register_id', $registerId)->first() ?? throw new ProjectException('Not found.', 404);
        DB::table('project_register_lines')->where('id', $l->id)->delete();
        ProjectLog::record((int) $project->id, $by, 'register.line_removed', 'register', $registerId, ['line' => $l->number, 'title' => $l->title], null);
    }

    /** A new version of a file moves the revision of each register line that holds it. */
    public function versionAdded(int $fileId): void
    {
        if (! ProjectsSetup::documents()) {
            return;
        }
        foreach (DB::table('project_register_lines')->where('file_id', $fileId)->get() as $l) {
            DB::table('project_register_lines')->where('id', $l->id)->update(['revision' => self::nextRevision($l->revision), 'updated_at' => now()]);
        }
    }

    /** A to B, Z to AA, 1 to 2, P01 to P02, C3 to C4; nothing yet is A. */
    public static function nextRevision(?string $r): string
    {
        $r = trim((string) $r);
        if ($r === '') {
            return 'A';
        }
        if (preg_match('/^(.*?)(\d+)$/', $r, $m)) {
            return $m[1] . str_pad((string) ((int) $m[2] + 1), strlen($m[2]), '0', STR_PAD_LEFT);
        }
        if (preg_match('/^[A-Za-z]{1,2}$/', $r)) {   // a revision letter or two; a word is not one
            $upper = ctype_upper($r[strlen($r) - 1]);
            $next = ++$r;   // PHP's own: Z becomes AA

            return $upper ? strtoupper($next) : $next;
        }

        return $r . '.1';
    }

    /** Files running out: the lead and whoever added it, at 60, 30 and 7 days and on the day; each once. @return int */
    public function warnExpiry(?Carbon $today = null): int
    {
        if (! ProjectsSetup::documents()) {
            return 0;
        }
        $today = ($today ?? now())->copy()->startOfDay();
        $n = 0;
        foreach (DB::table('project_files as f')->join('projects as p', 'p.id', '=', 'f.project_id')->whereNull('f.deleted_at')->whereNull('p.deleted_at')->whereNotNull('f.expires_on')
            ->whereBetween('f.expires_on', [$today->toDateString(), $today->copy()->addDays(60)->toDateString()])->get(['f.*', 'p.number', 'p.lead_user_id']) as $f) {
            $left = (int) $today->diffInDays(Carbon::parse($f->expires_on)->startOfDay(), false);
            $mark = collect(self::WARN_AT)->sort()->first(fn ($d) => $left <= $d);   // the nearest mark reached: a missed morning still warns once
            $done = array_filter(explode(',', (string) $f->warned), 'strlen');
            if ($mark === null || in_array((string) $mark, $done, true)) {
                continue;
            }
            $people = User::whereIn('id', array_unique(array_filter([$f->lead_user_id, $f->uploaded_by])))->get();
            ProjectNotices::tell($people, ProjectNotices::TASK, ($left === 0 ? "{$f->name} runs out today" : "{$f->name} runs out in {$left} days") . " · {$f->number}",
                'It runs out on ' . Carbon::parse($f->expires_on)->format('j M Y') . '. Add the renewed one as a new version.', "/admin/projects/{$f->project_id}?tab=files", 'Open the files');
            DB::table('project_files')->where('id', $f->id)->update(['warned' => implode(',', array_merge($done, [(string) $mark]))]);
            $n++;
        }

        return $n;
    }

    private function needReady(): void
    {
        if (! ProjectsSetup::documents()) {
            throw new ProjectException('Registers need database script 266.', 409);
        }
    }
}
