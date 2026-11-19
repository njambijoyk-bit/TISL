<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Notify\Notifier;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Asking for files and sign-off (docs/PROJECTS_STAGE9_SPEC.md, build 9.3). Asked of a colleague on the work (answered in the app) or of a client
 * or party contact (answered on a link with a long code, no sign-in; and in the portal, 9.5). A file sent back lands in the work's files. A
 * sign-off is on one exact version: the person approves or declines with their typed name and a note, kept with the time and their address
 * (owner's choice 2); a later version needs a new sign-off. Asking needs `projects.files.sign` and a project role that keeps files.
 */
class ProjectFileRequests
{
    public function __construct(private ProjectAccess $access, private ProjectFiles $files) {}

    /** @return array<string, mixed> */
    public function list(object $project, User $user): array
    {
        $this->access->authorize($user, 'files_view', $project);
        $rows = DB::table('project_file_requests')->where('project_id', $project->id)->orderByRaw("CASE state WHEN 'open' THEN 0 ELSE 1 END")->orderByDesc('id')->limit(200)->get();

        return ['requests' => $rows->map(fn ($r) => $this->shape($r, $user))->all(), 'can' => ['ask' => $this->access->decide($user, 'files_sign', $project)['allowed']],
            'people' => array_map(fn ($u) => ['id' => $u->id, 'name' => $u->name], DB::table('project_members as m')->join('users as u', 'u.id', '=', 'm.user_id')->where('m.project_id', $project->id)->where('m.status', 'active')->orderBy('u.name')->get(['u.id', 'u.name'])->all()),
            'contacts' => array_merge(...array_values(array_map(fn ($list) => array_values(array_filter($list, fn ($c) => $c['email'])), app(ProjectThreads::class)->contactsFor($project))))];
    }

    /** @param array<string, mixed> $d kind, what, user_id | contact_id, due_on, folder_id (file) | file_id (signoff) @return int */
    public function ask(object $project, array $d, User $by): int
    {
        $this->access->authorize($by, 'files_sign', $project);
        $kind = in_array($d['kind'] ?? null, ['file', 'signoff'], true) ? $d['kind'] : throw new ProjectException('Choose a file or a sign-off.');
        $what = trim((string) ($d['what'] ?? ''));
        $what !== '' || throw new ProjectException('Say what you are asking for.');
        $userId = ! empty($d['user_id']) ? (int) $d['user_id'] : null;
        $contactId = ! empty($d['contact_id']) ? (int) $d['contact_id'] : null;
        if (! $userId === ! $contactId) {
            throw new ProjectException('Ask one person: someone on the work, or a contact.');
        }
        if ($userId && ! DB::table('project_members')->where(['project_id' => $project->id, 'user_id' => $userId, 'status' => 'active'])->exists()) {
            throw new ProjectException('Ask someone on this work.');
        }
        if ($contactId && ! in_array($contactId, array_column(array_merge(...array_values(app(ProjectThreads::class)->contactsFor($project))), 'id'), true)) {
            throw new ProjectException('Ask one of the client\'s contacts, or a party\'s on this work.');
        }
        $contact = $contactId ? DB::table('project_contacts')->where('id', $contactId)->first() : null;
        if ($contact && ! filter_var($contact->email, FILTER_VALIDATE_EMAIL)) {
            throw new ProjectException('That contact has no email address to send the link to.');
        }
        $file = null;
        $version = null;
        if ($kind === 'signoff') {
            $file = $this->files->file($project, (int) ($d['file_id'] ?? 0));
            $version = (int) DB::table('vault_documents')->where('id', $file->vault_document_id)->value('version_count');
        }
        $folder = $kind === 'file' && ! empty($d['folder_id']) ? (int) (DB::table('project_folders')->where('id', (int) $d['folder_id'])->where('project_id', $project->id)->whereNull('deleted_at')->value('id') ?? throw new ProjectException('Choose a folder on this work.')) : null;
        $due = ! empty($d['due_on']) ? (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $d['due_on']) ? $d['due_on'] : throw new ProjectException('Choose the day it is due.')) : null;
        $id = DB::table('project_file_requests')->insertGetId(['project_id' => $project->id, 'kind' => $kind, 'what' => mb_substr($what, 0, 300), 'user_id' => $userId, 'contact_id' => $contactId,
            'file_id' => $file?->id, 'version_number' => $version, 'folder_id' => $folder, 'due_on' => $due, 'token' => $contactId ? Str::random(48) : null, 'state' => 'open', 'asked_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'request.asked', 'request', $id, null, ['kind' => $kind, 'what' => $what]);
        $this->tell(DB::table('project_file_requests')->where('id', $id)->first(), $project, $by->name, false);

        return $id;
    }

    /** A colleague answers in the app. @param array<string, mixed> $d decision, name, note */
    public function answerInApp(object $project, int $id, User $by, ?UploadedFile $file, array $d): void
    {
        $r = $this->open($project, $id);
        if ((int) $r->user_id !== (int) $by->id) {
            throw new ProjectException('This was asked of someone else.', 403);
        }
        $this->answer($project, $r, $file, $d, $by->id, $by->name, request()->ip());
    }

    /** What an outsider sees on their link. @return array<string, mixed> */
    public function byToken(string $token): array
    {
        [$r, $p] = $this->tokenRow($token);
        $file = $r->file_id ? DB::table('project_files')->where('id', $r->file_id)->first() : null;

        return ['kind' => $r->kind, 'what' => $r->what, 'due_on' => $r->due_on, 'state' => $r->state, 'project' => "{$p->number} {$p->title}", 'company' => \App\Models\CompanyProfile::name(),
            'who' => DB::table('project_contacts')->where('id', $r->contact_id)->value('name'), 'file' => $file ? ['name' => $file->name, 'version' => (int) $r->version_number] : null,
            'answer' => $r->state !== 'open' ? ['name' => $r->answer_name, 'note' => $r->answer_note, 'at' => $r->answered_at] : null];
    }

    public function answerByToken(string $token, ?UploadedFile $file, array $d): array
    {
        [$r, $p] = $this->tokenRow($token);
        $r->state === 'open' || throw new ProjectException('This has already been answered.');
        $this->answer($p, $r, $file, $d, null, DB::table('project_contacts')->where('id', $r->contact_id)->value('name') ?? 'A contact', request()->ip());

        return $this->byToken($token);
    }

    /** The exact version asked to be signed off, for the outsider's link. */
    public function fileByToken(string $token): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        [$r] = $this->tokenRow($token);
        $r->kind === 'signoff' || throw new ProjectException('Not found.', 404);

        return $this->files->stream(DB::table('project_files')->where('id', $r->file_id)->first(), (int) $r->version_number, true, null);
    }

    public function cancel(object $project, int $id, User $by): void
    {
        $this->access->authorize($by, 'files_sign', $project);
        $r = $this->open($project, $id);
        DB::table('project_file_requests')->where('id', $r->id)->update(['state' => 'cancelled', 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'request.cancelled', 'request', (int) $r->id, null, null);
    }

    /** Requests due today or late, reminded once a day. @return int */
    public function remind(?Carbon $today = null): int
    {
        if (! ProjectsSetup::documents()) {
            return 0;
        }
        $today = ($today ?? now())->toDateString();
        $n = 0;
        foreach (DB::table('project_file_requests')->where('state', 'open')->whereNotNull('due_on')->where('due_on', '<=', $today)->where(fn ($q) => $q->whereNull('reminded_on')->orWhere('reminded_on', '<', $today))->get() as $r) {
            $p = DB::table('projects')->where('id', $r->project_id)->first();
            if (! $p || $p->deleted_at) {
                continue;
            }
            $this->tell($r, $p, null, true);
            DB::table('project_file_requests')->where('id', $r->id)->update(['reminded_on' => $today]);
            $n++;
        }

        return $n;
    }

    // ------------------------------------------------------------------ inside

    private function answer(object $project, object $r, ?UploadedFile $file, array $d, ?int $byId, string $name, ?string $ip): void
    {
        if ($r->kind === 'file') {
            $file || throw new ProjectException('Choose the file to send.');
            $fileId = $this->files->receive($project, $file, $r->folder_id ? (int) $r->folder_id : null, $byId, 'request');
            $row = ['state' => 'done', 'file_id' => $fileId, 'answer_name' => mb_substr($name, 0, 120), 'answer_note' => isset($d['note']) ? mb_substr(trim((string) $d['note']), 0, 1000) ?: null : null];
        } else {
            $decision = $d['decision'] ?? null;
            in_array($decision, ['approve', 'decline'], true) || throw new ProjectException('Approve or decline it.');
            $typed = trim((string) ($d['name'] ?? ''));
            mb_strlen($typed) >= 2 || throw new ProjectException('Type your full name to sign.');
            $current = (int) DB::table('vault_documents')->where('id', DB::table('project_files')->where('id', $r->file_id)->value('vault_document_id'))->value('version_count');
            if ($current !== (int) $r->version_number) {
                throw new ProjectException('The file has changed since this was asked. A new sign-off is needed.');
            }
            $note = mb_substr(trim((string) ($d['note'] ?? '')), 0, 1000) ?: null;
            if ($decision === 'decline' && ! $note) {
                throw new ProjectException('Say why you decline it.');
            }
            $row = ['state' => $decision === 'approve' ? 'done' : 'declined', 'answer_name' => mb_substr($typed, 0, 120), 'answer_note' => $note];
        }
        DB::table('project_file_requests')->where('id', $r->id)->update($row + ['answer_ip' => $ip, 'answered_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $byId ? User::find($byId) : null, 'request.answered', 'request', (int) $r->id, null, ['state' => $row['state'], 'by' => $row['answer_name'], 'ip' => $ip]);
        if ($r->asked_by && ($asker = User::find($r->asked_by))) {
            $what = $r->kind === 'file' ? "{$name} sent: {$r->what}" : ($row['state'] === 'done' ? "{$row['answer_name']} signed off: {$r->what}" : "{$row['answer_name']} declined: {$r->what}");
            ProjectNotices::tell($asker, ProjectNotices::TASK, "{$what} · {$project->number}", $row['answer_note'] ?? '', "/admin/projects/{$project->id}?tab=files", 'Open the files');
        }
    }

    private function tell(object $r, object $p, ?string $by, bool $reminder): void
    {
        $title = ($reminder ? 'Reminder: ' : '') . ($r->kind === 'file' ? 'A file is asked of you' : 'Your sign-off is asked') . " · {$p->number}";
        $body = ($by ? "{$by} asks: " : '') . $r->what . ($r->due_on ? "\nBy " . Carbon::parse($r->due_on)->format('j M Y') . '.' : '');
        if ($r->user_id) {
            ProjectNotices::tell(User::find($r->user_id), ProjectNotices::TASK, $title, $body, "/admin/projects/{$p->id}?tab=files&requests=1", 'Answer it');
        } elseif ($r->contact_id && ($c = DB::table('project_contacts')->where('id', $r->contact_id)->first())) {
            try {
                app(Notifier::class)->sendToContact(['name' => $c->name, 'email' => $c->email, 'phone' => $c->phone], ProjectNotices::REQUEST, $title, "{$body}\n\n" . rtrim((string) config('app.frontend_url'), '/') . "/request/{$r->token}",
                    ['subject' => $title, 'action_url' => "/request/{$r->token}", 'action_text' => $r->kind === 'file' ? 'Send the file' : 'Look and sign off', 'only' => ['email']]);
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }

    /** @return array<string, mixed> */
    private function shape(object $r, User $viewer): array
    {
        $names = DB::table('users')->whereIn('id', array_filter([$r->user_id, $r->asked_by]) ?: [0])->pluck('name', 'id');
        $file = $r->file_id ? DB::table('project_files')->where('id', $r->file_id)->first(['id', 'name', 'vault_document_id']) : null;
        $now = $file ? (int) DB::table('vault_documents')->where('id', $file->vault_document_id)->value('version_count') : null;

        return ['id' => (int) $r->id, 'kind' => $r->kind, 'what' => $r->what, 'state' => $r->state, 'due_on' => $r->due_on, 'late' => $r->state === 'open' && $r->due_on && $r->due_on < now()->toDateString(),
            'of' => $r->user_id ? ($names[$r->user_id] ?? 'Someone') : (DB::table('project_contacts')->where('id', $r->contact_id)->value('name') ?? 'A contact'), 'outside' => (bool) $r->contact_id,
            'asked_by' => $names[$r->asked_by] ?? null, 'file' => $file ? ['id' => (int) $file->id, 'name' => $file->name] : null, 'version' => $r->version_number ? (int) $r->version_number : null,
            'newer' => $r->kind === 'signoff' && $now && $now > (int) $r->version_number, 'answer' => $r->answered_at ? ['name' => $r->answer_name, 'note' => $r->answer_note, 'at' => $r->answered_at, 'ip' => $r->answer_ip] : null,
            'mine' => $r->state === 'open' && (int) $r->user_id === (int) $viewer->id];
    }

    private function open(object $project, int $id): object
    {
        return DB::table('project_file_requests')->where('id', $id)->where('project_id', $project->id)->where('state', 'open')->first() ?? throw new ProjectException('This is no longer open.', 404);
    }

    /** @return array{0: object, 1: object} */
    private function tokenRow(string $token): array
    {
        if (! ProjectsSetup::documents() || strlen($token) < 40) {
            throw new ProjectException('This link is not valid.', 404);
        }
        $r = DB::table('project_file_requests')->where('token', $token)->first();
        $p = $r ? DB::table('projects')->where('id', $r->project_id)->whereNull('deleted_at')->first() : null;
        if (! $r || ! $p || $r->state === 'cancelled') {
            throw new ProjectException('This link is not valid.', 404);
        }

        return [$r, $p];
    }
}
