<?php

namespace App\Services\Projects;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

/**
 * The daily record (docs/PROJECTS_STAGE10_SPEC.md, build 10.5): one a day per piece of work, made for a phone. The weather, who was on site,
 * plant and its hours, materials received, work done, delays, visitors, anything that happened, and photos (kept in the work's Files, in a
 * "Daily records" folder). Signing locks it; after that only notes can be added, and they are marked as added after signing.
 */
class ProjectDaily
{
    public const KINDS = ['person', 'crew', 'plant', 'material', 'visitor', 'event', 'photo', 'note'];

    public function __construct(private ProjectAccess $access) {}

    /** @return array<string, mixed> */
    public function day(object $project, string $day, User $user): array
    {
        $this->access->authorize($user, 'open', $project);
        if (! ProjectsSetup::site()) {
            return ['ready' => false];
        }
        $day = $this->date($day);
        $r = DB::table('project_daily_records')->where('project_id', $project->id)->where('day', $day)->first();
        $lines = $r ? DB::table('project_daily_lines')->where('record_id', $r->id)->orderBy('id')->get() : collect();
        $users = DB::table('users')->whereIn('id', array_merge($lines->pluck('user_id')->filter()->all(), $lines->pluck('created_by')->filter()->all(), [$r->signed_by ?? 0]))->pluck('name', 'id');
        $plant = app(ProjectPlant::class)->onSite($project, $day);
        $products = $lines->pluck('variant_id')->filter()->all();
        $names = $products ? DB::table('product_variants as pv')->join('products as p', 'p.id', '=', 'pv.product_id')->whereIn('pv.id', $products)->pluck('p.name', 'pv.id') : collect();
        $files = DB::table('project_files')->whereIn('id', $lines->pluck('file_id')->filter()->all() ?: [0])->pluck('name', 'id');
        $can = $this->access->decide($user, 'daily', $project)['allowed'];

        return ['ready' => true, 'day' => $day, 'today' => now()->toDateString(), 'keeps_daily' => (bool) DB::table('project_site')->where('project_id', $project->id)->value('keeps_daily'),
            'record' => $r ? ['id' => (int) $r->id, 'weather' => $r->weather, 'work_done' => $r->work_done, 'delays' => $r->delays, 'notes' => $r->notes, 'state' => $r->state,
                'signed' => $r->state === 'signed' ? ['name' => $r->signed_name, 'by' => $users[$r->signed_by] ?? null, 'at' => $r->signed_at] : null] : null,
            'lines' => $lines->map(fn ($l) => ['id' => (int) $l->id, 'kind' => $l->kind, 'person' => $l->user_id ? ($users[$l->user_id] ?? 'Someone') : null, 'trade' => $l->trade, 'head_count' => $l->head_count !== null ? (int) $l->head_count : null,
                'hours' => $l->hours !== null ? (float) $l->hours : null, 'plant' => $l->instance_id || $l->hire_id ? (collect($plant)->first(fn ($p) => ($l->instance_id && $p['instance_id'] === (int) $l->instance_id) || ($l->hire_id && $p['hire_id'] === (int) $l->hire_id))['name'] ?? $l->text) : null,
                'material' => $l->variant_id ? ($names[$l->variant_id] ?? "Item {$l->variant_id}") : null, 'quantity' => $l->quantity !== null ? (float) $l->quantity : null, 'text' => $l->text,
                'file' => $l->file_id ? ['id' => (int) $l->file_id, 'name' => $files[$l->file_id] ?? 'Photo'] : null, 'after_signing' => (bool) $l->after_signing, 'by' => $users[$l->created_by] ?? null])->all(),
            'people' => DB::table('project_members as m')->join('users as u', 'u.id', '=', 'm.user_id')->where('m.project_id', $project->id)->where('m.status', 'active')->orderBy('u.name')->get(['u.id', 'u.name'])->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name])->all(),
            'plant' => $plant,
            'recent' => DB::table('project_daily_records')->where('project_id', $project->id)->where('day', '>=', Carbon::parse($day)->subDays(30)->toDateString())->orderByDesc('day')->limit(31)->get(['day', 'state'])->map(fn ($d) => ['day' => $d->day, 'state' => $d->state])->all(),
            'can' => ['write' => $can && (! $r || $r->state === 'draft'), 'note' => $can, 'sign' => $can && $r && $r->state === 'draft', 'photos' => $can && ProjectsSetup::documents(), 'settings' => $can]];
    }

    /** @param array<string, mixed> $d weather, work_done, delays, notes */
    public function save(object $project, string $day, array $d, User $by): void
    {
        $r = $this->draft($project, $day, $by);
        $row = [];
        foreach (['weather' => 60, 'work_done' => 5000, 'delays' => 5000, 'notes' => 5000] as $k => $max) {
            if (array_key_exists($k, $d)) {
                $row[$k] = $d[$k] !== null && trim((string) $d[$k]) !== '' ? mb_substr(trim((string) $d[$k]), 0, $max) : null;
            }
        }
        if ($row) {
            DB::table('project_daily_records')->where('id', $r->id)->update($row + ['updated_at' => now()]);
        }
    }

    /** @param array<string, mixed> $d kind and what that kind needs */
    public function addLine(object $project, string $day, array $d, User $by): void
    {
        $this->access->authorize($by, 'daily', $project);
        $kind = in_array($d['kind'] ?? null, self::KINDS, true) && $d['kind'] !== 'photo' ? $d['kind'] : throw new ProjectException('Choose what to add.');
        $r = $this->record($project, $day, $by);
        $after = $r->state === 'signed';
        if ($after && $kind !== 'note') {
            throw new ProjectException('This day is signed. Only a note can be added now.');
        }
        $text = isset($d['text']) && trim((string) $d['text']) !== '' ? mb_substr(trim((string) $d['text']), 0, 500) : null;
        $hours = isset($d['hours']) && $d['hours'] !== '' && $d['hours'] !== null ? round((float) $d['hours'], 2) : null;
        if ($hours !== null && ($hours < 0 || $hours > 24)) {
            throw new ProjectException('Hours are between 0 and 24.');
        }
        $row = ['record_id' => $r->id, 'kind' => $kind, 'hours' => $hours, 'text' => $text, 'after_signing' => $after ? 1 : 0, 'created_by' => $by->id, 'created_at' => now()];
        switch ($kind) {
            case 'person':
                $u = (int) ($d['user_id'] ?? 0);
                DB::table('project_members')->where(['project_id' => $project->id, 'user_id' => $u, 'status' => 'active'])->exists() || throw new ProjectException('Choose someone on the work.');
                $row['user_id'] = $u;
                break;
            case 'crew':
                $trade = trim((string) ($d['trade'] ?? ''));
                $trade !== '' || throw new ProjectException('Say the trade (masons, electricians…).');
                $count = (int) ($d['head_count'] ?? 0);
                $count > 0 || throw new ProjectException('Say how many.');
                $row += ['trade' => mb_substr($trade, 0, 80), 'head_count' => $count];
                break;
            case 'plant':
                $on = app(ProjectPlant::class)->onSite($project, $r->day);
                $pick = collect($on)->first(fn ($p) => (! empty($d['instance_id']) && $p['instance_id'] === (int) $d['instance_id']) || (! empty($d['hire_id']) && $p['hire_id'] === (int) $d['hire_id']));
                $pick || throw new ProjectException('Choose plant that is on the work that day.');
                $row += ['instance_id' => $pick['instance_id'], 'hire_id' => $pick['hire_id'], 'text' => $text ?? $pick['name']];
                break;
            case 'material':
                $v = (int) ($d['variant_id'] ?? 0);
                DB::table('product_variants')->where('id', $v)->exists() || throw new ProjectException('Choose the material from the catalogue.');
                $q = round((float) ($d['quantity'] ?? 0), 4);
                $q > 0 || throw new ProjectException('Say how much came.');
                $row += ['variant_id' => $v, 'quantity' => $q];
                break;
            default:   // visitor, event, note
                $text || throw new ProjectException($kind === 'visitor' ? 'Say who visited.' : 'Say what happened.');
        }
        DB::table('project_daily_lines')->insert($row);
        if ($after) {
            ProjectLog::record((int) $project->id, $by, 'daily.noted_after_signing', 'daily_record', (int) $r->id, null, ['day' => $r->day]);
        }
    }

    public function removeLine(object $project, int $lineId, User $by): void
    {
        $this->access->authorize($by, 'daily', $project);
        $l = DB::table('project_daily_lines as l')->join('project_daily_records as r', 'r.id', '=', 'l.record_id')->where('l.id', $lineId)->where('r.project_id', $project->id)->first(['l.id', 'r.state']);
        $l || throw new ProjectException('That is not on this work.', 404);
        $l->state === 'draft' || throw new ProjectException('This day is signed, so nothing on it can be taken off.');
        DB::table('project_daily_lines')->where('id', $lineId)->delete();
    }

    /** A photo for the day, kept in the work's Files under "Daily records". */
    public function photo(object $project, string $day, UploadedFile $file, ?string $caption, User $by): void
    {
        $this->access->authorize($by, 'daily', $project);
        ProjectsSetup::documents() || throw new ProjectException('Photos need the work\'s Files (script 266).', 409);
        $r = $this->record($project, $day, $by);
        $folder = DB::table('project_folders')->where('project_id', $project->id)->whereNull('parent_id')->where('name', 'Daily records')->whereNull('deleted_at')->value('id')
            ?? DB::table('project_folders')->insertGetId(['project_id' => $project->id, 'parent_id' => null, 'name' => 'Daily records', 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
        $fileId = app(ProjectFiles::class)->receive($project, $file, (int) $folder, $by->id, 'daily');
        DB::table('project_daily_lines')->insert(['record_id' => $r->id, 'kind' => 'photo', 'file_id' => $fileId, 'text' => $caption ? mb_substr(trim($caption), 0, 500) : null, 'after_signing' => $r->state === 'signed' ? 1 : 0, 'created_by' => $by->id, 'created_at' => now()]);
    }

    /** Signing locks the day; the typed name is kept with the time. */
    public function sign(object $project, string $day, string $name, User $by): void
    {
        $this->access->authorize($by, 'daily', $project);
        $r = DB::table('project_daily_records')->where('project_id', $project->id)->where('day', $this->date($day))->first() ?? throw new ProjectException('There is nothing written for this day yet.');
        $r->state === 'draft' || throw new ProjectException('This day is already signed.');
        mb_strlen(trim($name)) >= 2 || throw new ProjectException('Type your full name to sign.');
        if (! $r->work_done && ! DB::table('project_daily_lines')->where('record_id', $r->id)->exists()) {
            throw new ProjectException('Write what was done, or add something, before signing.');
        }
        DB::table('project_daily_records')->where('id', $r->id)->update(['state' => 'signed', 'signed_by' => $by->id, 'signed_name' => mb_substr(trim($name), 0, 120), 'signed_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'daily.signed', 'daily_record', (int) $r->id, null, ['day' => $r->day]);
    }

    public function keepsDaily(object $project, bool $on, User $by): void
    {
        $this->access->authorize($by, 'daily', $project);
        DB::table('project_site')->updateOrInsert(['project_id' => $project->id], ['keeps_daily' => $on ? 1 : 0, 'updated_by' => $by->id, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, $on ? 'daily.kept' : 'daily.not_kept', 'project', (int) $project->id, null, null);
    }

    /** At 18:00 on a weekday: the lead of each open work that keeps a daily record and has none today is told. @return int how many told */
    public function remind(?Carbon $now = null): int
    {
        $now ??= now();
        if (! ProjectsSetup::site() || $now->isWeekend()) {
            return 0;
        }
        $n = 0;
        foreach (DB::table('project_site as s')->join('projects as p', 'p.id', '=', 's.project_id')->where('s.keeps_daily', 1)->where('p.state', 'open')->whereNull('p.deleted_at')->whereNotNull('p.lead_user_id')
            ->whereNotExists(fn ($q) => $q->from('project_daily_records as r')->whereColumn('r.project_id', 'p.id')->where('r.day', $now->toDateString()))->get(['p.id', 'p.number', 'p.title', 'p.lead_user_id']) as $p) {
            ProjectNotices::tell(User::find($p->lead_user_id), ProjectNotices::TASK, "No daily record today · {$p->number}", "{$p->number} {$p->title} has no daily record for " . $now->format('j M') . '.', "/admin/projects/{$p->id}?tab=site&part=daily", 'Write it');
            $n++;
        }

        return $n;
    }

    // ------------------------------------------------------------------ inside

    /** The day's record, made when it is not there yet. */
    private function record(object $project, string $day, User $by): object
    {
        $day = $this->date($day);
        if ($day > now()->toDateString()) {
            throw new ProjectException('A daily record cannot be written ahead of the day.');
        }
        $r = DB::table('project_daily_records')->where('project_id', $project->id)->where('day', $day)->first();
        if (! $r) {
            DB::table('project_daily_records')->insertOrIgnore(['project_id' => $project->id, 'day' => $day, 'state' => 'draft', 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
            $r = DB::table('project_daily_records')->where('project_id', $project->id)->where('day', $day)->first();
        }

        return $r;
    }

    private function draft(object $project, string $day, User $by): object
    {
        $this->access->authorize($by, 'daily', $project);
        $r = $this->record($project, $day, $by);
        $r->state === 'draft' || throw new ProjectException('This day is signed. Only a note can be added now.');

        return $r;
    }

    private function date(string $v): string
    {
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : throw new ProjectException('Choose a day.');
    }
}
