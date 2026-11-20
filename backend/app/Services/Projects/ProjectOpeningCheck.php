<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The opening check (docs/PROJECTS_STAGE11_SPEC.md, build 11.2): the questions asked before work begins ("Conflict check" for a law firm, "Site
 * survey" for field service), for a whole industry or one kind of work. Answered yes or no with a note and signed with a typed name. A kind of
 * work can require it to pass before the work leaves its first stage. It also shows who else is involved: the client and every party on the
 * work searched against everyone already known, with a possible conflict marked.
 */
class ProjectOpeningCheck
{
    public function __construct(private ProjectAccess $access) {}

    /** @return array<string, mixed> */
    public function page(object $project, User $user): array
    {
        $this->access->authorize($user, 'open', $project);
        if (! ProjectWorkTemplates::ready()) {
            return ['ready' => false];
        }
        $check = DB::table('project_opening_checks')->where('project_id', $project->id)->first();
        $answers = collect(json_decode((string) ($check->answers ?? '[]'), true) ?: [])->keyBy('key');
        $questions = $check && $check->state === 'done' ? collect(json_decode((string) $check->answers, true) ?: [])->map(fn ($a) => (object) ['key' => $a['key'], 'question' => $a['question'], 'must_be_yes' => $a['must_be_yes'] ?? true]) : $this->questions($project);

        return ['ready' => true, 'name' => $this->name($project),
            'questions' => $questions->map(fn ($q) => ['key' => $q->key, 'question' => $q->question, 'must_be_yes' => (bool) $q->must_be_yes, 'answer' => $answers[$q->key]['answer'] ?? null, 'note' => $answers[$q->key]['note'] ?? null])->values()->all(),
            'state' => $check->state ?? 'none', 'passed' => $check && $check->passed !== null ? (bool) $check->passed : null,
            'signed' => $check && $check->state === 'done' ? ['name' => $check->signed_name, 'by' => DB::table('users')->where('id', $check->signed_by)->value('name'), 'at' => $check->signed_at] : null,
            'required' => app(ProjectWorkTemplates::class)->setting((int) $project->type_id, 'opening_required'),
            'involved' => $this->involved($project),
            'can' => ['answer' => $this->access->decide($user, 'edit', $project)['allowed'] && ($check->state ?? 'draft') !== 'done', 'redo' => $this->access->decide($user, 'edit', $project)['allowed'] && ($check->state ?? '') === 'done']];
    }

    /** @param array<string, array{answer?: ?string, note?: ?string}> $answers by question key */
    public function answer(object $project, array $answers, User $by): void
    {
        $this->access->authorize($by, 'edit', $project);
        $check = DB::table('project_opening_checks')->where('project_id', $project->id)->first();
        ($check->state ?? 'draft') !== 'done' || throw new ProjectException('The check is signed. Start it again to change it.');
        $kept = collect(json_decode((string) ($check->answers ?? '[]'), true) ?: [])->keyBy('key');
        foreach ($this->questions($project) as $q) {
            if (! array_key_exists($q->key, $answers)) {
                continue;
            }
            $a = $answers[$q->key];
            $value = $a['answer'] ?? null;
            if ($value !== null && ! in_array($value, ['yes', 'no'], true)) {
                throw new ProjectException('Answer yes or no.');
            }
            $kept[$q->key] = ['key' => $q->key, 'question' => $q->question, 'must_be_yes' => (bool) $q->must_be_yes, 'answer' => $value, 'note' => isset($a['note']) && trim((string) $a['note']) !== '' ? mb_substr(trim((string) $a['note']), 0, 500) : null];
        }
        DB::table('project_opening_checks')->updateOrInsert(['project_id' => $project->id], ['answers' => json_encode($kept->values()->all()), 'state' => 'draft', 'passed' => null, 'updated_at' => now()]);
    }

    /** Signed with a typed name: every question answered; it passes when every "must be yes" is yes. */
    public function sign(object $project, string $name, User $by): bool
    {
        $this->access->authorize($by, 'edit', $project);
        mb_strlen(trim($name)) >= 2 || throw new ProjectException('Type your full name to sign.');
        $check = DB::table('project_opening_checks')->where('project_id', $project->id)->first();
        ($check->state ?? 'draft') !== 'done' || throw new ProjectException('The check is already signed.');
        $answers = collect(json_decode((string) ($check->answers ?? '[]'), true) ?: [])->keyBy('key');
        $questions = $this->questions($project);
        $questions->isNotEmpty() || throw new ProjectException('There are no questions for this kind of work.');
        $missing = $questions->filter(fn ($q) => empty($answers[$q->key]['answer']))->count();
        $missing === 0 || throw new ProjectException($missing === 1 ? 'One question has no answer yet.' : "{$missing} questions have no answer yet.");
        $passed = $questions->every(fn ($q) => ! $q->must_be_yes || $answers[$q->key]['answer'] === 'yes');
        $final = $questions->map(fn ($q) => $answers[$q->key])->values()->all();
        DB::table('project_opening_checks')->where('project_id', $project->id)->update(['answers' => json_encode($final), 'state' => 'done', 'passed' => $passed ? 1 : 0, 'signed_by' => $by->id,
            'signed_name' => mb_substr(trim($name), 0, 120), 'signed_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'opening_check.signed', 'project', (int) $project->id, null, ['passed' => $passed, 'no' => collect($final)->where('answer', 'no')->pluck('question')->all()]);

        return $passed;
    }

    /** Start again: the answers are kept, the signature goes. */
    public function redo(object $project, string $why, User $by): void
    {
        $this->access->authorize($by, 'edit', $project);
        trim($why) !== '' || throw new ProjectException('Say why the check is done again.');
        DB::table('project_opening_checks')->where('project_id', $project->id)->where('state', 'done')->update(['state' => 'draft', 'passed' => null, 'signed_by' => null, 'signed_name' => null, 'signed_at' => null, 'updated_at' => now()])
            || throw new ProjectException('The check is not signed.');
        ProjectLog::record((int) $project->id, $by, 'opening_check.reopened', 'project', (int) $project->id, null, null, ProjectLog::DONE, $why);
    }

    /** Asked before a work leaves its first stage: null when it may, or why it may not. */
    public function blocks(object $project, int $toStageId): ?string
    {
        if (! ProjectWorkTemplates::ready() || ! app(ProjectWorkTemplates::class)->setting((int) $project->type_id, 'opening_required')) {
            return null;
        }
        $first = DB::table('project_stages')->where('type_id', $project->type_id)->whereNull('deleted_at')->orderBy('sort_order')->orderBy('id')->value('id');
        if ((int) $project->stage_id !== (int) $first || $toStageId === (int) $first || $this->questions($project)->isEmpty()) {
            return null;
        }
        $check = DB::table('project_opening_checks')->where('project_id', $project->id)->first();
        if ($check && $check->state === 'done' && $check->passed) {
            return null;
        }
        $name = $this->name($project);

        return $check && $check->state === 'done' ? "The {$name} did not pass. It must pass before the work moves on." : "Do the {$name} first: it must pass before the work moves on.";
    }

    // ---------------------------------------------------------------- the questions, in Configuration

    /** @return array<string, mixed> */
    public function config(string $industry, User $user): array
    {
        $types = DB::table('project_types')->where('industry_key', $industry)->whereNull('deleted_at')->orderBy('sort_order')->get(['id', 'name']);
        $rows = ProjectWorkTemplates::ready() ? DB::table('project_opening_questions')->where(fn ($q) => $q->where('industry_key', $industry)->orWhereIn('type_id', $types->pluck('id')->all() ?: [0]))->orderBy('type_id')->orderBy('sort_order')->orderBy('id')->get() : collect();

        return ['ready' => ProjectWorkTemplates::ready(), 'name' => app(ProjectNames::class)->names($industry)['opening_check']['name'] ?? 'Opening check',
            'types' => $types->map(fn ($t) => ['id' => (int) $t->id, 'name' => $t->name])->all(),
            'questions' => $rows->map(fn ($q) => ['id' => (int) $q->id, 'type_id' => (int) $q->type_id ?: null, 'question' => $q->question, 'must_be_yes' => (bool) $q->must_be_yes, 'is_active' => (bool) $q->is_active])->all(),
            'can' => ['change' => $user->hasPermission('projects.config.stages')]];
    }

    /** @param array<string, mixed> $d industry, type_id, question, must_be_yes, is_active */
    public function saveQuestion(?int $id, array $d, User $by): void
    {
        $by->hasPermission('projects.config.stages') || throw new ProjectException('Changing the opening check needs the permission to set up kinds of work.', 403);
        ProjectWorkTemplates::ready() || throw new ProjectException('The opening check needs database script 268.', 409);
        $text = trim((string) ($d['question'] ?? ''));
        $text !== '' || throw new ProjectException('Write the question.');
        $row = ['question' => mb_substr($text, 0, 300), 'must_be_yes' => ! empty($d['must_be_yes']) ? 1 : 0, 'is_active' => array_key_exists('is_active', $d) ? ($d['is_active'] ? 1 : 0) : 1, 'updated_at' => now()];
        if ($id) {
            DB::table('project_opening_questions')->where('id', $id)->update($row) || DB::table('project_opening_questions')->where('id', $id)->exists() || throw new ProjectException('That question is not there.', 404);
        } else {
            $type = ! empty($d['type_id']) ? (int) $d['type_id'] : 0;
            $industry = $type ? '' : (string) ($d['industry'] ?? '');
            if ($type) {
                DB::table('project_types')->where('id', $type)->whereNull('deleted_at')->exists() || throw new ProjectException('Choose a kind of work.');
            } else {
                DB::table('project_industries')->where('key', $industry)->exists() || throw new ProjectException('Choose an industry.');
            }
            $id = DB::table('project_opening_questions')->insertGetId($row + ['industry_key' => $industry, 'type_id' => $type, 'key' => 'q' . substr(md5($text . microtime()), 0, 10),
                'sort_order' => (int) DB::table('project_opening_questions')->where('industry_key', $industry)->where('type_id', $type)->max('sort_order') + 10, 'created_at' => now()]);
        }
        ProjectLog::record(null, $by, 'opening_question.saved', 'opening_question', $id, null, ['question' => $text]);
    }

    // ------------------------------------------------------------------ inside

    private function questions(object $project)
    {
        return DB::table('project_opening_questions')->where('is_active', 1)->where(fn ($q) => $q->where(fn ($w) => $w->where('industry_key', $project->industry_key)->where('type_id', 0))->orWhere('type_id', $project->type_id))
            ->orderByRaw('type_id = 0 DESC')->orderBy('sort_order')->orderBy('id')->get(['key', 'question', 'must_be_yes']);
    }

    private function name(object $project): string
    {
        return app(ProjectNames::class)->names($project->industry_key)['opening_check']['name'] ?? 'Opening check';
    }

    /**
     * The client and the parties on this work, each searched against everyone known. A party who is already a client, or the client found as a
     * party on other work, is a possible conflict. @return array<int, array<string, mixed>>
     */
    private function involved(object $project): array
    {
        if (! ProjectsSetup::relationships()) {
            return [];
        }
        $search = app(ProjectDuplicates::class);
        $out = [];
        $client = $project->customer_id ? DB::table('customers')->where('id', $project->customer_id)->first() : null;
        if ($client) {
            $name = ProjectService::customerName($client);
            $matches = array_values(array_filter($search->find(['name' => $name]), fn ($m) => ! ($m['type'] === 'customer' && $m['id'] === (int) $client->id)));
            $out[] = ['who' => $name, 'as' => 'Client', 'matches' => array_map(fn ($m) => $m + ['conflict' => $m['type'] === 'party'], $matches)];
        }
        $parties = DB::table('project_party_links as l')->join('project_parties as p', 'p.id', '=', 'l.party_id')->where('l.project_id', $project->id)->get(['p.id', 'p.name']);
        foreach ($parties->unique('id') as $p) {
            $matches = array_values(array_filter($search->find(['name' => $p->name]), fn ($m) => ! ($m['type'] === 'party' && $m['id'] === (int) $p->id)));
            $out[] = ['who' => $p->name, 'as' => 'Party', 'matches' => array_map(fn ($m) => $m + ['conflict' => $m['type'] === 'customer'], $matches)];
        }

        return $out;
    }
}
