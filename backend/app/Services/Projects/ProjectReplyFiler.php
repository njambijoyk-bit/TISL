<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Notify\Replies\InboundReplies;
use App\Services\Notify\Replies\ReplyFiler;
use Illuminate\Support\Facades\DB;

/**
 * Replies to Projects conversations (docs/PROJECTS_STAGE6_SPEC.md, build 6.5). A message the team writes in a client or others conversation goes
 * out answerable; the reply comes back here and becomes a message from that contact, by email or WhatsApp, opening the conversation again and
 * telling its followers. Replies nothing could match wait for someone with `projects.messages.moderate` to file or throw away.
 */
class ProjectReplyFiler implements ReplyFiler
{
    public function __construct(private ProjectAccess $access) {}

    public function file(object $route, array $reply): bool
    {
        if ($route->subject_type !== 'thread' || ! ProjectsSetup::messages()) {
            return false;
        }
        $t = DB::table('project_threads')->where('id', $route->subject_id)->first();
        $contact = (int) $route->contact_ref;
        if (! $t || $t->audience === 'team' || ! DB::table('project_thread_people')->where(['thread_id' => $t->id, 'contact_id' => $contact])->exists()) {
            return false;   // gone, or that person is no longer in it: a person decides
        }
        $this->add($t, $contact, $reply['body'], $reply['channel'], null);

        return true;
    }

    public function isOpen(object $route): bool
    {
        return $route->subject_type === 'thread' && DB::table('project_threads')->where('id', $route->subject_id)->where('state', 'open')->exists();
    }

    public function describe(object $route): ?string
    {
        $t = DB::table('project_threads as t')->join('projects as p', 'p.id', '=', 't.project_id')->where('t.id', $route->subject_id)->first(['t.subject', 'p.number']);

        return $t ? "{$t->number} · {$t->subject}" : null;
    }

    /** The waiting replies, each with the conversations its sender is in (by email address or number). @return array<string, mixed> */
    public function waiting(User $user): array
    {
        $out = [];
        foreach (app(InboundReplies::class)->waiting() as $w) {
            $out[] = $w + ['matches' => $this->matches($user, $w['channel'], $w['from'])];
        }

        return ['ready' => InboundReplies::ready(), 'replies' => $out];
    }

    /** A person files a waiting reply into a conversation, as from one of its contacts. */
    public function fileByHand(User $by, int $inboundId, int $threadId, int $contactId): void
    {
        $in = app(InboundReplies::class)->find($inboundId);
        if (! $in || $in->state !== 'waiting') {
            throw new ProjectException('This reply is no longer waiting.', 404);
        }
        $t = DB::table('project_threads')->where('id', $threadId)->first();
        $project = $t ? DB::table('projects')->where('id', $t->project_id)->whereNull('deleted_at')->first() : null;
        if (! $project || ! $this->access->decide($by, 'moderate', $project)['allowed']) {
            throw new ProjectException('Not found.', 404);
        }
        if ($t->audience === 'team') {
            throw new ProjectException('A reply from outside goes into a client or others conversation.');
        }
        if (! DB::table('project_thread_people')->where(['thread_id' => $t->id, 'contact_id' => $contactId])->exists()) {
            throw new ProjectException('Choose who it is from: one of the people in that conversation.');
        }
        DB::transaction(function () use ($t, $contactId, $in, $by, $inboundId) {
            $this->add($t, $contactId, (string) $in->body, $in->channel, $by);
            app(InboundReplies::class)->markFiled($inboundId, 'projects', 'thread', (int) $t->id, $by);
        });
    }

    // ------------------------------------------------------------------ inside

    private function add(object $t, int $contactId, string $body, string $via, ?User $by): void
    {
        $project = DB::table('projects')->where('id', $t->project_id)->first();
        $id = DB::table('project_thread_messages')->insertGetId(['thread_id' => $t->id, 'contact_id' => $contactId, 'body' => mb_substr(trim($body), 0, 10000) ?: '(empty)', 'via' => $via === 'whatsapp' ? 'whatsapp' : 'email', 'created_at' => now()]);
        DB::table('project_threads')->where('id', $t->id)->update(['last_message_at' => now(), 'state' => 'open', 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, $by ? 'message.filed' : 'message.received', 'thread', (int) $t->id, null, ['message' => $id, 'via' => $via]);
        $name = DB::table('project_contacts')->where('id', $contactId)->value('name') ?? 'A contact';
        app(ProjectThreads::class)->tellFollowers($project, DB::table('project_threads')->where('id', $t->id)->first(), "{$name} replied", $body, $by ? [(int) $by->id] : []);
    }

    /** Client and others conversations on work this person may moderate, where a contact has this address or number. @return array<int, array<string, mixed>> */
    private function matches(User $user, string $channel, string $from): array
    {
        $digits = preg_replace('/\D+/', '', $from);
        $q = DB::table('project_thread_people as tp')->join('project_contacts as c', 'c.id', '=', 'tp.contact_id')->join('project_threads as t', 't.id', '=', 'tp.thread_id')->join('projects as p', 'p.id', '=', 't.project_id')
            ->whereNull('p.deleted_at')->whereNull('c.deleted_at');
        if ($channel === 'email') {
            $q->whereRaw('LOWER(c.email) = ?', [strtolower($from)]);
        } elseif (strlen($digits) >= 9) {
            $q->where('c.phone', 'like', '%' . substr($digits, -9));
        } else {
            return [];
        }
        $rows = $q->orderByDesc('t.last_message_at')->limit(20)->get(['t.id as thread_id', 't.subject', 't.state', 'c.id as contact_id', 'c.name as contact', 'p.id as project_id', 'p.number', 'p.confidential', 'p.frozen_at', 'p.deleted_at']);

        return $rows->filter(fn ($r) => $this->access->decide($user, 'moderate', (object) ['id' => $r->project_id, 'confidential' => $r->confidential, 'frozen_at' => $r->frozen_at, 'deleted_at' => $r->deleted_at])['allowed'])
            ->map(fn ($r) => ['thread_id' => (int) $r->thread_id, 'label' => "{$r->number} · {$r->subject}" . ($r->state === 'closed' ? ' (closed)' : ''), 'contact_id' => (int) $r->contact_id, 'contact' => $r->contact])->values()->all();
    }
}
