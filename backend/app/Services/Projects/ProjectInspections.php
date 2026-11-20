<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

/**
 * Inspections (docs/PROJECTS_STAGE10_SPEC.md, build 10.6). Kinds are made in Configuration: a name and its questions, one a line. An inspection
 * on a work copies its kind's questions; each is passed, failed or not applicable, with a note and a photo; finishing it with the inspector's
 * typed name gives the outcome, and every failed answer becomes a snag (10.7) on the work.
 */
class ProjectInspections
{
    public function __construct(private ProjectAccess $access) {}

    /** @return array<string, mixed> */
    public function kinds(User $user): array
    {
        return ['kinds' => ProjectsSetup::site() ? DB::table('project_inspection_kinds')->orderBy('name')->get()->map(fn ($k) => ['id' => (int) $k->id, 'key' => $k->key, 'name' => $k->name, 'questions' => $this->questions($k->questions), 'is_active' => (bool) $k->is_active])->all() : [],
            'ready' => ProjectsSetup::site(), 'can' => ['change' => $user->hasPermission('projects.config.manage')]];
    }

    /** @param array<string, mixed> $d name, questions (a list, or text one a line), is_active */
    public function saveKind(?int $id, array $d, User $by): void
    {
        $by->hasPermission('projects.config.manage') || throw new ProjectException('Changing inspection kinds needs Projects configuration.', 403);
        ProjectsSetup::site() || throw new ProjectException('The site is not set up yet. Run script 267.', 409);
        $name = trim((string) ($d['name'] ?? ''));
        $name !== '' || throw new ProjectException('Give the inspection kind a name.');
        $questions = is_array($d['questions'] ?? null) ? $d['questions'] : $this->questions((string) ($d['questions'] ?? ''));
        $questions = array_values(array_filter(array_map(fn ($q) => mb_substr(trim((string) $q), 0, 300), $questions), fn ($q) => $q !== ''));
        ($questions && count($questions) <= 60) || throw new ProjectException('Write between 1 and 60 questions, one a line.');
        $row = ['name' => mb_substr($name, 0, 120), 'questions' => implode("\n", $questions), 'is_active' => array_key_exists('is_active', $d) ? ($d['is_active'] ? 1 : 0) : 1, 'updated_at' => now()];
        if ($id) {
            DB::table('project_inspection_kinds')->where('id', $id)->update($row) || DB::table('project_inspection_kinds')->where('id', $id)->exists() || throw new ProjectException('That kind is not there.', 404);
        } else {
            $id = DB::table('project_inspection_kinds')->insertGetId($row + ['created_at' => now()]);
        }
        ProjectLog::record(null, $by, 'inspection_kind.saved', 'inspection_kind', $id, null, ['name' => $name, 'questions' => count($questions)]);
    }

    /** @return array<string, mixed> */
    public function page(object $project, User $user): array
    {
        $this->access->authorize($user, 'open', $project);
        if (! ProjectsSetup::site()) {
            return ['ready' => false];
        }
        $rows = DB::table('project_inspections as i')->join('project_inspection_kinds as k', 'k.id', '=', 'i.kind_id')->where('i.project_id', $project->id)->orderByDesc('i.done_on')->orderByDesc('i.id')->limit(200)->get(['i.*', 'k.name as kind']);
        $fails = DB::table('project_inspection_answers')->whereIn('inspection_id', $rows->pluck('id')->all() ?: [0])->where('answer', 'fail')->groupBy('inspection_id')->selectRaw('inspection_id, COUNT(*) AS n')->pluck('n', 'inspection_id');

        return ['ready' => true, 'inspections' => $rows->map(fn ($i) => ['id' => (int) $i->id, 'kind' => $i->kind, 'area' => $i->area, 'done_on' => $i->done_on, 'state' => $i->state, 'outcome' => $i->outcome,
            'inspector' => $i->inspector_name, 'failed' => (int) ($fails[$i->id] ?? 0)])->all(),
            'kinds' => DB::table('project_inspection_kinds')->where('is_active', 1)->orderBy('name')->get(['id', 'name'])->map(fn ($k) => ['id' => (int) $k->id, 'name' => $k->name])->all(),
            'can' => ['inspect' => $this->access->decide($user, 'inspections', $project)['allowed']]];
    }

    public function start(object $project, int $kindId, ?string $area, ?string $on, User $by): int
    {
        $this->access->authorize($by, 'inspections', $project);
        ProjectsSetup::site() || throw new ProjectException('The site is not set up yet. Run script 267.', 409);
        $kind = DB::table('project_inspection_kinds')->where('id', $kindId)->where('is_active', 1)->first() ?? throw new ProjectException('Choose a kind of inspection.');
        $on = $on ? (preg_match('/^\d{4}-\d{2}-\d{2}$/', $on) ? $on : throw new ProjectException('Choose the day.')) : now()->toDateString();

        return DB::transaction(function () use ($project, $kind, $area, $on, $by) {
            $id = DB::table('project_inspections')->insertGetId(['project_id' => $project->id, 'kind_id' => $kind->id, 'area' => $area ? mb_substr(trim($area), 0, 160) : null, 'done_on' => $on, 'state' => 'draft',
                'inspector_id' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
            foreach ($this->questions($kind->questions) as $i => $q) {
                DB::table('project_inspection_answers')->insert(['inspection_id' => $id, 'question_no' => $i + 1, 'question' => $q]);
            }
            ProjectLog::record((int) $project->id, $by, 'inspection.started', 'inspection', $id, null, ['kind' => $kind->name, 'area' => $area]);

            return $id;
        });
    }

    /** @return array<string, mixed> */
    public function show(object $project, int $id, User $user): array
    {
        $this->access->authorize($user, 'open', $project);
        $i = $this->inspection($project, $id);
        $answers = DB::table('project_inspection_answers')->where('inspection_id', $id)->orderBy('question_no')->get();
        $files = DB::table('project_files')->whereIn('id', $answers->pluck('file_id')->filter()->all() ?: [0])->pluck('name', 'id');
        $snags = DB::table('project_snags')->whereIn('id', $answers->pluck('snag_id')->filter()->all() ?: [0])->get(['id', 'number', 'state'])->keyBy('id');

        return ['inspection' => ['id' => (int) $i->id, 'kind' => DB::table('project_inspection_kinds')->where('id', $i->kind_id)->value('name'), 'area' => $i->area, 'done_on' => $i->done_on, 'state' => $i->state, 'outcome' => $i->outcome,
            'inspector' => $i->inspector_name, 'finished_at' => $i->finished_at],
            'answers' => $answers->map(fn ($a) => ['no' => (int) $a->question_no, 'question' => $a->question, 'answer' => $a->answer, 'note' => $a->note, 'file' => $a->file_id ? ['id' => (int) $a->file_id, 'name' => $files[$a->file_id] ?? 'Photo'] : null,
                'snag' => $a->snag_id && isset($snags[$a->snag_id]) ? ['number' => (int) $snags[$a->snag_id]->number, 'state' => $snags[$a->snag_id]->state] : null])->all(),
            'can' => ['answer' => $i->state === 'draft' && $this->access->decide($user, 'inspections', $project)['allowed']]];
    }

    public function answer(object $project, int $id, int $no, ?string $answer, ?string $note, User $by): void
    {
        $i = $this->draft($project, $id, $by);
        if ($answer !== null && ! in_array($answer, ['pass', 'fail', 'na'], true)) {
            throw new ProjectException('Choose passed, failed or not applicable.');
        }
        DB::table('project_inspection_answers')->where('inspection_id', $i->id)->where('question_no', $no)->update(['answer' => $answer, 'note' => $note !== null && trim($note) !== '' ? mb_substr(trim($note), 0, 500) : null])
            || DB::table('project_inspection_answers')->where('inspection_id', $i->id)->where('question_no', $no)->exists() || throw new ProjectException('That question is not on this inspection.', 404);
    }

    public function photo(object $project, int $id, int $no, UploadedFile $file, User $by): void
    {
        $i = $this->draft($project, $id, $by);
        DB::table('project_inspection_answers')->where('inspection_id', $i->id)->where('question_no', $no)->exists() || throw new ProjectException('That question is not on this inspection.', 404);
        $fileId = app(ProjectSnags::class)->keepPhoto($project, $file, $by->id, 'Inspections');
        DB::table('project_inspection_answers')->where('inspection_id', $i->id)->where('question_no', $no)->update(['file_id' => $fileId]);
    }

    /** Finished with the inspector's typed name: the outcome, and a snag for every failed answer. */
    public function finish(object $project, int $id, string $name, User $by): void
    {
        $i = $this->draft($project, $id, $by);
        mb_strlen(trim($name)) >= 2 || throw new ProjectException('Type your full name to finish the inspection.');
        $answers = DB::table('project_inspection_answers')->where('inspection_id', $id)->orderBy('question_no')->get();
        $open = $answers->whereNull('answer')->count();
        $open === 0 || throw new ProjectException($open === 1 ? 'One question has no answer yet.' : "{$open} questions have no answer yet.");
        $failed = $answers->where('answer', 'fail');

        DB::transaction(function () use ($project, $i, $name, $by, $failed) {
            foreach ($failed as $a) {
                $snag = app(ProjectSnags::class)->raise($project, ['title' => $a->note ? "{$a->question}: {$a->note}" : $a->question, 'area' => $i->area], $by, (int) $i->id, $a->file_id ? (int) $a->file_id : null);
                DB::table('project_inspection_answers')->where('id', $a->id)->update(['snag_id' => $snag]);
            }
            DB::table('project_inspections')->where('id', $i->id)->update(['state' => 'done', 'outcome' => $failed->isEmpty() ? 'passed' : 'failed', 'inspector_name' => mb_substr(trim($name), 0, 120), 'inspector_id' => $by->id,
                'finished_at' => now(), 'updated_at' => now()]);
            ProjectLog::record((int) $project->id, $by, 'inspection.finished', 'inspection', (int) $i->id, null, ['outcome' => $failed->isEmpty() ? 'passed' : 'failed', 'snags' => $failed->count()]);
        });
        if ($failed->isNotEmpty() && $project->lead_user_id && (int) $project->lead_user_id !== (int) $by->id) {
            ProjectNotices::tell(User::find($project->lead_user_id), ProjectNotices::TASK, "Inspection failed · {$project->number}", "{$failed->count()} " . ($failed->count() === 1 ? 'snag' : 'snags') . ' raised' . ($i->area ? " in {$i->area}" : '') . '.', "/admin/projects/{$project->id}?tab=site&part=snags", 'Open the snags');
        }
    }

    // ------------------------------------------------------------------ inside

    /** @return string[] */
    private function questions(string $text): array
    {
        return array_values(array_filter(array_map('trim', preg_split('/\r?\n|\\\\n/', $text)), fn ($q) => $q !== ''));
    }

    private function inspection(object $project, int $id): object
    {
        return DB::table('project_inspections')->where('id', $id)->where('project_id', $project->id)->first() ?? throw new ProjectException('That inspection is not on this work.', 404);
    }

    private function draft(object $project, int $id, User $by): object
    {
        $this->access->authorize($by, 'inspections', $project);
        $i = $this->inspection($project, $id);
        $i->state === 'draft' || throw new ProjectException('This inspection is finished.');

        return $i;
    }
}
