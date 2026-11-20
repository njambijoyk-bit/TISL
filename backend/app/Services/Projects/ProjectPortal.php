<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Books\OpenBillsService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The client portal (docs/PROJECTS_STAGE9_SPEC.md, build 9.5; owner's choice 3). In the customer area, "My work": each piece of work for the
 * signed-in customer, with its stage and phases, the client meetings they are invited to, the files shared with them, the files and sign-offs
 * asked of their people, and their invoices on that work (read from Books; paid through My Account). Nothing team-only is ever here.
 */
class ProjectPortal
{
    /** @return array<string, mixed> */
    public function list(User $user): array
    {
        $c = $this->customer($user);
        if (! $c) {
            return ['ready' => ProjectsSetup::ready(), 'work' => []];
        }
        $rows = DB::table('projects as p')->leftJoin('project_stages as s', 's.id', '=', 'p.stage_id')->where('p.customer_id', $c->id)->whereNull('p.deleted_at')->where('p.state', '!=', 'cancelled')
            ->orderByRaw("CASE WHEN p.state IN ('open', 'on_hold') THEN 0 ELSE 1 END")->orderByDesc('p.updated_at')->get(['p.id', 'p.number', 'p.title', 'p.state', 's.name as stage']);
        $open = $this->openRequests($c->id);

        return ['ready' => true, 'work' => $rows->map(fn ($p) => ['id' => (int) $p->id, 'number' => $p->number, 'title' => $p->title, 'state' => $p->state, 'stage' => $p->stage,
            'waiting' => count(array_filter($open, fn ($r) => (int) $r->project_id === (int) $p->id))])->all()];
    }

    /** @return array<string, mixed> */
    public function show(User $user, int $projectId): array
    {
        [$c, $p] = $this->mine($user, $projectId);
        $stages = DB::table('project_stages')->where('type_id', $p->type_id)->whereNull('deleted_at')->orderBy('sort_order')->orderBy('id')->get(['id', 'name']);
        $phases = Schema::hasTable('project_phases') ? DB::table('project_phases')->where('project_id', $p->id)->whereNull('deleted_at')->whereNull('parent_id')->orderBy('sort_order')->get(['name', 'state']) : collect();
        $contacts = DB::table('project_contacts')->where('owner_type', 'customer')->where('owner_id', $c->id)->whereNull('deleted_at')->pluck('id')->map(fn ($v) => (int) $v)->all();
        $meetings = ProjectsSetup::messages() ? DB::table('project_meetings as m')->join('project_meeting_people as mp', 'mp.meeting_id', '=', 'm.id')->where('m.project_id', $p->id)->where('m.audience', 'client')
            ->whereIn('mp.contact_id', $contacts ?: [0])->where('m.state', '!=', 'cancelled')->where('m.ends_at', '>=', now()->subDays(30))->orderBy('m.starts_at')->get(['m.id', 'm.title', 'm.starts_at', 'm.ends_at', 'm.location', 'm.online_link', 'm.state', 'm.minutes_shared_at', 'mp.answer_token', 'mp.response'])
            ->unique('id')->values() : collect();

        return [
            'work' => ['id' => (int) $p->id, 'number' => $p->number, 'title' => $p->title, 'state' => $p->state, 'start_date' => $p->start_date, 'due_date' => $p->due_date],
            'stages' => $stages->map(fn ($s) => ['name' => $s->name, 'now' => (int) $s->id === (int) $p->stage_id, 'past' => $this->before($stages, (int) $s->id, (int) $p->stage_id)])->values()->all(),
            'phases' => $phases->map(fn ($ph) => ['name' => $ph->name, 'state' => $ph->state])->all(),
            'meetings' => $meetings->map(fn ($m) => ['title' => $m->title, 'starts_at' => $m->starts_at, 'ends_at' => $m->ends_at, 'location' => $m->location, 'online_link' => $m->online_link, 'state' => $m->state,
                'answer' => $m->response, 'answer_link' => $m->state === 'planned' && $m->answer_token ? "/meeting/{$m->answer_token}" : null])->all(),
            'files' => ProjectsSetup::documents() ? DB::table('project_files as f')->join('vault_documents as d', 'd.id', '=', 'f.vault_document_id')->where('f.project_id', $p->id)->where('f.shared', 1)->whereNull('f.deleted_at')
                ->orderBy('f.name')->get(['f.id', 'f.name', 'f.shared_at', 'd.file_size', 'd.version_count'])->map(fn ($f) => ['id' => (int) $f->id, 'name' => $f->name, 'size' => (int) $f->file_size, 'versions' => (int) $f->version_count, 'shared_at' => $f->shared_at])->all() : [],
            'requests' => array_values(array_map(fn ($r) => ['what' => $r->what, 'kind' => $r->kind, 'due_on' => $r->due_on, 'of' => DB::table('project_contacts')->where('id', $r->contact_id)->value('name'), 'link' => "/request/{$r->token}"],
                array_filter($this->openRequests($c->id), fn ($r) => (int) $r->project_id === (int) $p->id))),
            'invoices' => $this->invoices($c, $p),
            'snags' => app(ProjectSnags::class)->forClient($p),   // stage 10: snags the team shared with the client
        ];
    }

    /** A shared file, for the customer. */
    public function download(User $user, int $projectId, int $fileId): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        [, $p] = $this->mine($user, $projectId);
        $f = DB::table('project_files')->where('id', $fileId)->where('project_id', $p->id)->where('shared', 1)->whereNull('deleted_at')->first() ?? throw new ProjectException('Not found.', 404);

        return app(ProjectFiles::class)->stream($f, null, false, (int) $user->id);
    }

    // ------------------------------------------------------------------ inside

    /** Invoices on this work for this customer: Books vouchers carrying the work's cost centres or linked to it, with what is still open. @return array<int, array<string, mixed>> */
    private function invoices(object $c, object $p): array
    {
        if (! Schema::hasTable('vouchers') || ! Schema::hasTable('voucher_types')) {
            return [];
        }
        $centres = array_filter(array_merge([$p->cost_centre_id], Schema::hasTable('project_phases') ? DB::table('project_phases')->where('project_id', $p->id)->pluck('cost_centre_id')->all() : []));
        $linked = DB::table('project_links')->where('project_id', $p->id)->where('module', 'books')->where('link_type', 'voucher')->whereNull('deleted_at')->pluck('linked_id')->all();
        $rows = DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->whereIn('t.base_type', ['sales', 'cash_sale'])->where('v.customer_id', $c->id)
            ->where('v.status', '!=', 'cancelled')->where(fn ($q) => $q->whereIn('v.cost_centre_id', $centres ?: [0])->orWhereIn('v.id', $linked ?: [0]))
            ->orderByDesc('v.date')->limit(100)->get(['v.id', 'v.voucher_number', 'v.date', 'v.total_amount', 'v.party_ledger_id', 't.name as type_name']);
        $open = [];
        $ledger = $rows->pluck('party_ledger_id')->filter()->first() ?? (Schema::hasTable('ledgers') ? DB::table('ledgers')->where('customer_id', $c->id)->value('id') : null);
        if ($ledger) {
            try {
                foreach (app(OpenBillsService::class)->forLedger((int) $ledger)['bills'] as $b) {
                    $open[(int) $b['voucher_id']] = (float) $b['outstanding'];
                }
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $rows->map(fn ($v) => ['number' => $v->voucher_number, 'type' => $v->type_name, 'date' => $v->date, 'total' => $v->total_amount === null ? null : (float) $v->total_amount, 'open' => $open[(int) $v->id] ?? 0.0])->all();
    }

    /** @return array<int, object> open requests asked of this customer's contacts */
    private function openRequests(int $customerId): array
    {
        if (! ProjectsSetup::documents()) {
            return [];
        }

        return DB::table('project_file_requests as r')->join('project_contacts as c', 'c.id', '=', 'r.contact_id')->where('c.owner_type', 'customer')->where('c.owner_id', $customerId)
            ->where('r.state', 'open')->get(['r.*'])->all();
    }

    private function before($stages, int $id, int $now): bool
    {
        $ids = $stages->pluck('id')->map(fn ($v) => (int) $v)->all();
        $a = array_search($id, $ids, true);
        $b = array_search($now, $ids, true);

        return $a !== false && $b !== false && $a < $b;
    }

    private function customer(User $user): ?object
    {
        return ProjectsSetup::ready() && $user->customer ? $user->customer : null;
    }

    /** @return array{0: object, 1: object} */
    private function mine(User $user, int $projectId): array
    {
        $c = $this->customer($user) ?? throw new ProjectException('Not found.', 404);
        $p = DB::table('projects')->where('id', $projectId)->where('customer_id', $c->id)->whereNull('deleted_at')->where('state', '!=', 'cancelled')->first() ?? throw new ProjectException('Not found.', 404);

        return [$c, $p];
    }
}
