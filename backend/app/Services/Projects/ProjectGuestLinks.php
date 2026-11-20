<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Notify\Notifier;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Guest links (docs/PROJECTS_STAGE9_SPEC.md, build 9.6): someone outside who is not the client (an expert, the other side's advocate, an
 * auditor) gets a link with an end date of at most 90 days. It opens a read-only page with the work's shared files and the requests asked of
 * that link; nothing else. Every opening and download is logged, a link can be ended at any time, and giving one is the serious action
 * "Give a guest link" (checked by the controller).
 */
class ProjectGuestLinks
{
    public const MAX_DAYS = 90;

    public function __construct(private ProjectAccess $access, private ProjectFiles $files) {}

    /** The links on a piece of work, for whoever may see its files. @return array<string, mixed> */
    public function list(object $project, User $user): array
    {
        $this->access->authorize($user, 'files_view', $project);
        $can = $this->access->decide($user, 'guests', $project)['allowed'];
        $rows = ProjectsSetup::documents() ? DB::table('project_guest_links')->where('project_id', $project->id)->orderByDesc('id')->limit(200)->get() : collect();
        $visits = $rows->isEmpty() ? collect() : DB::table('project_guest_visits')->whereIn('link_id', $rows->pluck('id'))->groupBy('link_id')
            ->get(['link_id', DB::raw('COUNT(*) as n'), DB::raw('MAX(created_at) as last')])->keyBy('link_id');
        $names = DB::table('users')->whereIn('id', $rows->pluck('created_by')->filter()->all() ?: [0])->pluck('name', 'id');

        return ['links' => $rows->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->name, 'email' => $l->email, 'ends_on' => $l->ends_on, 'state' => $this->state($l),
            'link' => $can && $this->live($l) ? "/guest/{$l->token}" : null, 'visits' => (int) ($visits[$l->id]->n ?? 0), 'last_visit' => $visits[$l->id]->last ?? null,
            'by' => $names[$l->created_by] ?? null, 'created_at' => $l->created_at])->all(),
            'can' => ['give' => $can], 'max_days' => self::MAX_DAYS, 'shared' => ProjectsSetup::documents() ? DB::table('project_files')->where('project_id', $project->id)->where('shared', 1)->whereNull('deleted_at')->count() : 0];
    }

    /** @param array<string, mixed> $d name, email, ends_on @return int */
    public function give(object $project, array $d, User $by): int
    {
        $this->access->authorize($by, 'guests', $project);
        ProjectsSetup::documents() || throw new ProjectException('Documents are not set up yet. Run script 266.');
        $name = trim((string) ($d['name'] ?? ''));
        mb_strlen($name) >= 2 || throw new ProjectException('Say who the link is for.');
        $email = trim((string) ($d['email'] ?? '')) ?: null;
        if ($email && ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new ProjectException('That email address does not look right.');
        }
        $ends = $this->endsOn($d['ends_on'] ?? null);
        $token = Str::random(48);
        $id = DB::table('project_guest_links')->insertGetId(['project_id' => $project->id, 'token' => $token, 'name' => mb_substr($name, 0, 120), 'email' => $email,
            'ends_on' => $ends, 'created_by' => $by->id, 'created_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'guest.given', 'guest_link', $id, null, ['name' => $name, 'email' => $email, 'ends_on' => $ends]);
        if ($email) {
            $title = "{$by->name} shared documents with you · {$project->number}";
            $body = "{$project->number} {$project->title}\nThe link works until " . Carbon::parse($ends)->format('j M Y') . '.';
            try {
                app(Notifier::class)->sendToContact(['name' => $name, 'email' => $email, 'phone' => null], ProjectNotices::REQUEST, $title, "{$body}\n\n" . rtrim((string) config('app.frontend_url'), '/') . "/guest/{$token}",
                    ['subject' => $title, 'action_url' => "/guest/{$token}", 'action_text' => 'Open the documents', 'only' => ['email']]);
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $id;
    }

    public function end(object $project, int $id, User $by): void
    {
        $this->access->authorize($by, 'guests', $project);
        $l = DB::table('project_guest_links')->where('id', $id)->where('project_id', $project->id)->first() ?? throw new ProjectException('That link is not on this work.', 404);
        $this->live($l) || throw new ProjectException('That link has already ended.');
        DB::table('project_guest_links')->where('id', $id)->update(['ended_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'guest.ended', 'guest_link', $id, null, ['name' => $l->name]);
    }

    /** Every opening of one link. @return array<int, array<string, mixed>> */
    public function visits(object $project, int $id, User $by): array
    {
        $this->access->authorize($by, 'files_view', $project);
        DB::table('project_guest_links')->where('id', $id)->where('project_id', $project->id)->exists() || throw new ProjectException('That link is not on this work.', 404);
        $rows = DB::table('project_guest_visits')->where('link_id', $id)->orderByDesc('id')->limit(200)->get();
        $files = DB::table('project_files')->whereIn('id', $rows->pluck('file_id')->filter()->all() ?: [0])->pluck('name', 'id');

        return $rows->map(fn ($v) => ['what' => $v->what, 'file' => $v->file_id ? ($files[$v->file_id] ?? 'A file') : null, 'ip' => $v->ip, 'at' => $v->created_at])->all();
    }

    /** Live links, to ask a guest for a file or sign-off. @return array<int, array{id: int, name: string}> */
    public function liveOn(object $project): array
    {
        if (! ProjectsSetup::documents()) {
            return [];
        }

        return DB::table('project_guest_links')->where('project_id', $project->id)->whereNull('ended_at')->where('ends_on', '>=', now()->toDateString())->orderBy('name')
            ->get(['id', 'name'])->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->name])->all();
    }

    // ------------------------------------------------------------------ the guest's page (no sign-in; the long code is the key)

    /** @return array<string, mixed> */
    public function page(string $token): array
    {
        [$l, $p] = $this->byToken($token);
        $this->visit((int) $l->id, 'opened', null);
        $requests = DB::table('project_file_requests')->where('guest_link_id', $l->id)->whereIn('state', ['open', 'done', 'declined'])->orderByRaw("CASE state WHEN 'open' THEN 0 ELSE 1 END")->orderByDesc('id')->get();

        return ['company' => \App\Models\CompanyProfile::name(), 'project' => "{$p->number} {$p->title}", 'name' => $l->name, 'ends_on' => $l->ends_on,
            'files' => DB::table('project_files as f')->join('vault_documents as d', 'd.id', '=', 'f.vault_document_id')->where('f.project_id', $p->id)->where('f.shared', 1)->whereNull('f.deleted_at')
                ->orderBy('f.name')->get(['f.id', 'f.name', 'd.file_size', 'd.version_count', 'f.shared_at'])->map(fn ($f) => ['id' => (int) $f->id, 'name' => $f->name, 'size' => (int) $f->file_size, 'versions' => (int) $f->version_count, 'shared_at' => $f->shared_at])->all(),
            'requests' => $requests->map(fn ($r) => ['what' => $r->what, 'kind' => $r->kind, 'state' => $r->state, 'due_on' => $r->due_on, 'link' => "/request/{$r->token}"])->all()];
    }

    public function file(string $token, int $fileId): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        [$l, $p] = $this->byToken($token);
        $f = DB::table('project_files')->where('id', $fileId)->where('project_id', $p->id)->where('shared', 1)->whereNull('deleted_at')->first() ?? throw new ProjectException('Not found.', 404);
        $this->visit((int) $l->id, 'file', (int) $f->id);

        return $this->files->stream($f, null, false, null);
    }

    public function visit(int $linkId, string $what, ?int $fileId): void
    {
        DB::table('project_guest_visits')->insert(['link_id' => $linkId, 'what' => $what, 'file_id' => $fileId, 'ip' => request()->ip(), 'created_at' => now()]);
    }

    public function live(?object $l): bool
    {
        return $l !== null && $l->ended_at === null && $l->ends_on >= now()->toDateString();
    }

    // ------------------------------------------------------------------ inside

    private function state(object $l): string
    {
        return $l->ended_at ? 'ended' : ($l->ends_on < now()->toDateString() ? 'ran_out' : 'live');
    }

    private function endsOn(mixed $v): string
    {
        if (! is_string($v) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) {
            throw new ProjectException('Choose the day the link ends.');
        }
        $d = Carbon::parse($v)->startOfDay();
        if ($d->lt(now()->startOfDay())) {
            throw new ProjectException('The end day cannot be in the past.');
        }
        if ($d->gt(now()->startOfDay()->addDays(self::MAX_DAYS))) {
            throw new ProjectException('A guest link can last ' . self::MAX_DAYS . ' days at most.');
        }

        return $d->toDateString();
    }

    /** @return array{0: object, 1: object} */
    private function byToken(string $token): array
    {
        if (! ProjectsSetup::documents() || strlen($token) < 40) {
            throw new ProjectException('This link is not valid.', 404);
        }
        $l = DB::table('project_guest_links')->where('token', $token)->first();
        $p = $l ? DB::table('projects')->where('id', $l->project_id)->whereNull('deleted_at')->first() : null;
        if (! $l || ! $p) {
            throw new ProjectException('This link is not valid.', 404);
        }
        if (! $this->live($l)) {
            throw new ProjectException('This link has ended. Ask whoever sent it for a new one.', 410);
        }

        return [$l, $p];
    }
}
