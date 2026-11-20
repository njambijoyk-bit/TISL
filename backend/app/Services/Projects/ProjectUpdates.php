<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Ai\AiGateway;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Weekly update drafts (docs/PROJECTS_STAGE12_SPEC.md, build 12.6). Each Friday Mimi drafts a short update for each open piece of work with a
 * client, from its week: tasks done, key dates kept or missed, daily records, snags, what is next. The lead reads it, changes it and sends it to
 * the client as a message, or throws it away; nothing is sent by itself (choice 4). The AI writes it with the company's keys (AI → Keys, for
 * analytics); confidential work and sensitive fields go to the AI only if the company switches that on, and without a key, or when the AI may
 * not see the work, the draft is written from the facts alone. No money is ever in it.
 */
class ProjectUpdates
{
    public function __construct(private ProjectAccess $access) {}

    public static function ready(): bool
    {
        return ProjectKpis::ready() && Schema::hasTable('project_updates');
    }

    /** Friday: a draft for every open work with a client that has none for this week. @return int drafts made */
    public function fridays(?Carbon $now = null): int
    {
        $now ??= now();
        if (! self::ready() || ! app(ProjectSettings::class)->get('insights')['weekly_updates']) {
            return 0;
        }
        $made = 0;
        $week = $now->copy()->startOfWeek()->toDateString();
        foreach (DB::table('projects')->whereNull('deleted_at')->where('state', 'open')->whereNull('frozen_at')->whereNotNull('customer_id')->get() as $p) {
            if (DB::table('project_updates')->where('project_id', $p->id)->where('week', $week)->exists()) {
                continue;
            }
            $id = $this->draft($p, null, $now);
            $made++;
            ProjectNotices::tell(User::find($p->lead_user_id), ProjectNotices::TASK, "Weekly update to check · {$p->number}", 'Mimi drafted this week\'s update for the client. Read it, change it and send it, or throw it away.',
                "/admin/projects/{$p->id}?update={$id}", 'Read the draft');
        }

        return $made;
    }

    /** Draft (or draft again) this week's update. @return int its id */
    public function draft(object $project, ?User $by, ?Carbon $now = null): int
    {
        $now ??= now();
        self::ready() || throw new ProjectException('Weekly updates need database script 269.', 409);
        if ($by) {
            $this->access->authorize($by, 'talk_client', $project);
        }
        $week = $now->copy()->startOfWeek();
        $current = DB::table('project_updates')->where('project_id', $project->id)->where('week', $week->toDateString())->first();
        if ($current && $current->state !== 'draft') {
            throw new ProjectException($current->state === 'sent' ? 'This week\'s update was already sent.' : 'This week\'s update was thrown away; it can be drafted again next week.');
        }
        $facts = $this->facts($project, $week, $now);
        [$body, $byAi] = $this->write($project, $facts);
        $row = ['body' => $body, 'by_ai' => $byAi ? 1 : 0, 'updated_at' => now()];
        if ($current) {
            DB::table('project_updates')->where('id', $current->id)->update($row);

            return (int) $current->id;
        }
        $id = DB::table('project_updates')->insertGetId($row + ['project_id' => $project->id, 'week' => $week->toDateString(), 'state' => 'draft', 'created_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'update.drafted', 'update', $id, null, ['week' => $week->toDateString(), 'by_ai' => $byAi]);

        return $id;
    }

    /** @return array<string, mixed> */
    public function list(object $project, User $user): array
    {
        $this->access->authorize($user, 'talk_client', $project);

        return ['ready' => self::ready(), 'updates' => self::ready() ? DB::table('project_updates as u')->leftJoin('users as d', 'd.id', '=', 'u.decided_by')->where('u.project_id', $project->id)->orderByDesc('u.week')->limit(12)
            ->get(['u.*', 'd.name as decided_by_name'])->map(fn ($u) => ['id' => (int) $u->id, 'week' => substr((string) $u->week, 0, 10), 'body' => $u->body, 'state' => $u->state, 'by_ai' => (bool) $u->by_ai,
                'decided_by' => $u->decided_by_name, 'decided_at' => $u->decided_at, 'message_id' => $u->message_id ? (int) $u->message_id : null])->all() : [],
            'threads' => DB::table('project_threads')->where('project_id', $project->id)->where('audience', 'client')->orderByDesc('last_message_at')->get(['id', 'subject', 'state'])->map(fn ($t) => ['id' => (int) $t->id, 'subject' => $t->subject, 'state' => $t->state])->all()];
    }

    public function save(object $project, int $id, string $body, User $by): void
    {
        $u = $this->open($project, $id, $by);
        trim($body) !== '' || throw new ProjectException('The update is empty.');
        DB::table('project_updates')->where('id', $u->id)->update(['body' => mb_substr(trim($body), 0, 5000), 'updated_at' => now()]);
    }

    /** Send it to the client: into the conversation chosen, else the latest client conversation, else a new one with the client's main contact. */
    public function send(object $project, int $id, User $by, ?int $threadId = null, ?string $body = null): int
    {
        $u = $this->open($project, $id, $by);
        $text = trim($body ?? $u->body);
        $text !== '' || throw new ProjectException('The update is empty.');
        $threads = app(ProjectThreads::class);
        $threadId ??= DB::table('project_threads')->where('project_id', $project->id)->where('audience', 'client')->orderByDesc('last_message_at')->value('id');
        if ($threadId) {
            DB::table('project_threads')->where('id', $threadId)->where('project_id', $project->id)->where('audience', 'client')->exists() || throw new ProjectException('Choose one of this work\'s client conversations.');
            $message = $threads->post($project, (int) $threadId, $text, $by);
        } else {
            $contacts = array_values(array_filter($threads->contactsFor($project)['client'], fn ($c) => $c['reachable']));
            $contacts || throw new ProjectException('The client has no contact with an email or phone yet. Add one on the client first.');
            $threadId = $threads->start($project, ['audience' => 'client', 'subject' => 'Weekly updates', 'contacts' => [$contacts[0]['id']], 'body' => $text], $by);
            $message = (int) DB::table('project_thread_messages')->where('thread_id', $threadId)->max('id');
        }
        DB::table('project_updates')->where('id', $u->id)->update(['body' => $text, 'state' => 'sent', 'decided_by' => $by->id, 'decided_at' => now(), 'message_id' => $message, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'update.sent', 'update', (int) $u->id, null, ['thread' => (int) $threadId, 'message' => $message]);

        return (int) $threadId;
    }

    public function discard(object $project, int $id, User $by): void
    {
        $u = $this->open($project, $id, $by);
        DB::table('project_updates')->where('id', $u->id)->update(['state' => 'discarded', 'decided_by' => $by->id, 'decided_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'update.discarded', 'update', (int) $u->id);
    }

    /** What happened on the work this week, as plain lines. @return array<string, mixed> */
    public function facts(object $project, Carbon $week, Carbon $now): array
    {
        $from = $week->copy()->startOfDay();
        $to = $week->copy()->endOfWeek();
        $tasks = DB::table('project_work_tasks')->where('project_id', $project->id)->whereNull('deleted_at');
        $dates = DB::table('project_key_dates')->where('project_id', $project->id)->whereNull('deleted_at');
        $f = [
            'work' => "{$project->title} ({$project->number})",
            'stage' => DB::table('project_stages')->where('id', $project->stage_id)->value('name'),
            'done' => (clone $tasks)->where('status', 'done')->whereBetween('completed_at', [$from, $to])->orderBy('completed_at')->limit(12)->pluck('title')->all(),
            'next' => (clone $tasks)->whereNotIn('status', ['done', 'cancelled'])->whereBetween('due_date', [$to->copy()->addDay()->toDateString(), $to->copy()->addDays(7)->toDateString()])->orderBy('due_date')->limit(8)->pluck('title')->all(),
            'late' => (clone $tasks)->whereNotIn('status', ['done', 'cancelled'])->where('due_date', '<', $now->toDateString())->count(),
            'dates_kept' => (clone $dates)->where('state', 'done')->whereBetween('done_at', [$from, $to])->pluck('title')->all(),
            'dates_missed' => (clone $dates)->where('state', 'missed')->whereBetween('starts_at', [$from, $to])->pluck('title')->all(),
            'next_date' => ($n = (clone $dates)->where('state', 'open')->where('starts_at', '>', $now)->orderBy('starts_at')->first(['title', 'starts_at'])) ? $n->title . ' on ' . Carbon::parse($n->starts_at)->format('j M') : null,
            'daily' => 0, 'snags_raised' => 0, 'snags_fixed' => 0, 'fields' => [],
        ];
        if (ProjectsSetup::site()) {
            $f['daily'] = DB::table('project_daily_records')->where('project_id', $project->id)->whereBetween('day', [$from->toDateString(), $to->toDateString()])->count();
            $f['snags_raised'] = DB::table('project_snags')->where('project_id', $project->id)->whereNull('deleted_at')->whereBetween('created_at', [$from, $to])->count();
            $f['snags_fixed'] = DB::table('project_snags')->where('project_id', $project->id)->whereNull('deleted_at')->whereBetween('fixed_at', [$from, $to])->count();
        }
        $sensitive = app(ProjectSettings::class)->get('insights')['ai_sensitive_fields'];
        foreach (DB::table('project_field_values as v')->join('project_fields as fl', 'fl.id', '=', 'v.field_id')->where('v.project_id', $project->id)->where('fl.is_active', 1)
            ->when(! $sensitive, fn ($q) => $q->where('fl.is_sensitive', 0))->whereNotNull('v.value')->limit(10)->get(['fl.label', 'v.value']) as $v) {
            $f['fields'][$v->label] = mb_substr((string) $v->value, 0, 120);
        }

        return $f;
    }

    /** @return array{0: string, 1: bool} the text, and whether the AI wrote it */
    private function write(object $project, array $f): array
    {
        $plain = $this->plain($f);
        $s = app(ProjectSettings::class)->get('insights');
        if (! $s['ai_drafts'] || ($project->confidential && ! $s['ai_confidential'])) {
            return [$plain, false];
        }
        try {
            $r = app(AiGateway::class)->run('drafts', 'You write short weekly progress updates from a firm to its client. Use only the facts given; do not invent anything. Plain, warm, '
                . 'professional English; at most 150 words; no headings; no amounts of money; end with what happens next week. Write the message only.', [['role' => 'user', 'content' => $this->factsText($f)]], ['max_tokens' => 400, 'temperature' => 0.3, 'feature' => 'projects_updates']);
            $text = trim((string) ($r['text'] ?? ''));

            return $text !== '' && empty($r['blocked']) ? [mb_substr($text, 0, 5000), true] : [$plain, false];
        } catch (\Throwable $e) {
            return [$plain, false];   // no key, or the AI failed: the draft from the facts is still useful
        }
    }

    private function factsText(array $f): string
    {
        $lines = ["Work: {$f['work']}", "Stage: {$f['stage']}"];
        $list = fn (string $label, array $x) => $x ? "{$label}: " . implode('; ', $x) : null;
        $lines[] = $list('Done this week', $f['done']) ?? 'Done this week: nothing marked done';
        $lines[] = $list('Key dates kept', $f['dates_kept']);
        $lines[] = $list('Key dates missed', $f['dates_missed']);
        $lines[] = $f['late'] ? "Tasks past their due day: {$f['late']}" : null;
        $lines[] = $f['daily'] ? "Daily site records kept: {$f['daily']}" : null;
        $lines[] = $f['snags_raised'] || $f['snags_fixed'] ? "Snags raised: {$f['snags_raised']}; fixed: {$f['snags_fixed']}" : null;
        $lines[] = $list('Planned next week', $f['next']);
        $lines[] = $f['next_date'] ? "Next key date: {$f['next_date']}" : null;
        foreach ($f['fields'] as $k => $v) {
            $lines[] = "{$k}: {$v}";
        }

        return implode("\n", array_filter($lines));
    }

    /** The draft without the AI. */
    private function plain(array $f): string
    {
        $p = ["Here is this week's update on {$f['work']}. It is at the {$f['stage']} stage."];
        $p[] = $f['done'] ? 'This week we finished: ' . implode(', ', $f['done']) . '.' : 'Work continued this week; nothing new was marked finished.';
        if ($f['dates_kept']) {
            $p[] = 'We kept ' . implode(', ', $f['dates_kept']) . '.';
        }
        if ($f['dates_missed']) {
            $p[] = 'We did not make ' . implode(', ', $f['dates_missed']) . ', and are putting it right.';
        }
        if ($f['snags_raised'] || $f['snags_fixed']) {
            $p[] = "On site, {$f['snags_fixed']} snag(s) were fixed and {$f['snags_raised']} new one(s) noted.";
        }
        $p[] = $f['next'] ? 'Next week: ' . implode(', ', $f['next']) . '.' : 'Next week we carry on with the work in hand.';
        if ($f['next_date']) {
            $p[] = "The next key date is {$f['next_date']}.";
        }

        return implode("\n\n", [implode(' ', array_slice($p, 0, 2)), implode(' ', array_slice($p, 2))]);
    }

    private function open(object $project, int $id, User $by): object
    {
        $this->access->authorize($by, 'talk_client', $project);
        $u = DB::table('project_updates')->where('id', $id)->where('project_id', $project->id)->first() ?? throw new ProjectException('That update is not there.', 404);
        $u->state === 'draft' || throw new ProjectException('That update was already ' . ($u->state === 'sent' ? 'sent.' : 'thrown away.'));

        return $u;
    }
}
