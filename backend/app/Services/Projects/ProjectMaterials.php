<?php

namespace App\Services\Projects;

use App\Models\StockJob;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Notify\Staff;
use App\Services\Stock\StockJobService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Materials on a piece of work (docs/PROJECTS_STAGE10_SPEC.md, build 10.1). Planned quantities and requests are kept here; the stock itself moves
 * only through Stock's own jobs: one job for the work at each branch, opened when the first material is issued there, on the work's cost centre.
 * Issuing takes stock into Work in progress, returning puts it back, and closing the work completes its jobs (the cost becomes Cost of services).
 * Projects never stores what anything cost: it reads Stock's job lines.
 */
class ProjectMaterials
{
    public function __construct(private ProjectAccess $access, private StockJobService $jobs) {}

    /** @return array<string, mixed> */
    public function page(object $project, User $user): array
    {
        if (! $this->mayIssue($user, $project)) {
            $this->access->authorize($user, 'open', $project);
        }
        if (! ProjectsSetup::site()) {
            return ['ready' => false];
        }
        $site = DB::table('project_site')->where('project_id', $project->id)->first();
        $plans = DB::table('project_material_plans')->where('project_id', $project->id)->get()->keyBy('variant_id');
        $requests = DB::table('project_material_requests')->where('project_id', $project->id)->orderByRaw("CASE state WHEN 'open' THEN 0 WHEN 'part' THEN 1 ELSE 2 END")->orderByDesc('id')->limit(300)->get();
        $jobIds = DB::table('project_stock_jobs')->where('project_id', $project->id)->pluck('stock_job_id')->all();
        $lines = $jobIds && Schema::hasTable('stock_job_lines') ? DB::table('stock_job_lines')->whereIn('job_id', $jobIds)->get(['id', 'job_id', 'variant_id', 'quantity', 'unit_cost', 'issued_at']) : collect();
        $ids = array_values(array_unique(array_merge($plans->keys()->all(), $requests->pluck('variant_id')->all(), $lines->pluck('variant_id')->all())));
        $names = $this->names($ids);
        $branches = $this->branches();
        $open = $requests->whereIn('state', ['open', 'part']);

        $rows = array_map(function ($v) use ($plans, $open, $lines, $names) {
            $mine = $lines->where('variant_id', $v);

            return ['variant_id' => (int) $v, 'name' => $names[$v]['name'] ?? "Item {$v}", 'unit' => $names[$v]['unit'] ?? null,
                'planned' => isset($plans[$v]) ? (float) $plans[$v]->planned_qty : null, 'plan_note' => $plans[$v]->note ?? null,
                'waiting' => round($open->where('variant_id', $v)->sum(fn ($r) => (float) $r->quantity - (float) $r->issued_qty), 4),
                'issued' => round($mine->sum(fn ($l) => (float) $l->quantity), 4), 'cost' => round($mine->sum(fn ($l) => (float) $l->quantity * (float) $l->unit_cost), 2)];
        }, $ids);
        usort($rows, fn ($a, $b) => strcasecmp($a['name'], $b['name']));
        $jobs = $jobIds ? DB::table('stock_jobs')->whereIn('id', $jobIds)->get(['id', 'number', 'location_id', 'status']) : collect();
        $askers = DB::table('users')->whereIn('id', $requests->pluck('asked_by')->filter()->all() ?: [0])->pluck('name', 'id');

        return ['ready' => true, 'site' => ['location_id' => $site?->location_id ? (int) $site->location_id : null, 'keeps_daily' => (bool) ($site->keeps_daily ?? false)],
            'branches' => $branches, 'materials' => $rows, 'cost' => round(array_sum(array_column($rows, 'cost')), 2),
            'requests' => $requests->map(fn ($r) => ['id' => (int) $r->id, 'variant_id' => (int) $r->variant_id, 'name' => $names[$r->variant_id]['name'] ?? "Item {$r->variant_id}", 'unit' => $names[$r->variant_id]['unit'] ?? null,
                'quantity' => (float) $r->quantity, 'issued' => (float) $r->issued_qty, 'branch' => $branches[array_search((int) $r->location_id, array_column($branches, 'id'), true)]['name'] ?? null, 'location_id' => (int) $r->location_id,
                'needed_on' => $r->needed_on, 'late' => in_array($r->state, ['open', 'part'], true) && $r->needed_on && $r->needed_on < now()->toDateString(), 'note' => $r->note, 'state' => $r->state,
                'asked_by' => $askers[$r->asked_by] ?? null, 'at' => $r->created_at])->all(),
            'issued' => $lines->sortByDesc('id')->values()->map(fn ($l) => ['id' => (int) $l->id, 'name' => $names[$l->variant_id]['name'] ?? "Item {$l->variant_id}", 'unit' => $names[$l->variant_id]['unit'] ?? null,
                'quantity' => (float) $l->quantity, 'job' => $jobs->firstWhere('id', $l->job_id)?->number, 'open' => $jobs->firstWhere('id', $l->job_id)?->status === 'open', 'at' => $l->issued_at])->all(),
            'jobs' => $jobs->map(fn ($j) => ['number' => $j->number, 'status' => $j->status, 'branch' => collect($branches)->firstWhere('id', (int) $j->location_id)['name'] ?? null])->values()->all(),
            'can' => ['plan' => $this->access->decide($user, 'materials', $project)['allowed'], 'issue' => $this->mayIssue($user, $project), 'see_cost' => $this->access->decide($user, 'money', $project)['allowed']]];
    }

    /** Set (or with 0, clear) how much of a material the work needs. */
    public function plan(object $project, int $variantId, float $qty, ?string $note, User $by): void
    {
        $this->access->authorize($by, 'materials', $project);
        $this->needSite();
        $this->variant($variantId);
        if ($qty < 0) {
            throw new ProjectException('The quantity cannot be below nothing.');
        }
        if ($qty == 0.0) {
            DB::table('project_material_plans')->where(['project_id' => $project->id, 'variant_id' => $variantId])->delete();
        } else {
            DB::table('project_material_plans')->updateOrInsert(['project_id' => $project->id, 'variant_id' => $variantId],
                ['planned_qty' => round($qty, 4), 'note' => $note ? mb_substr(trim($note), 0, 300) : null, 'created_by' => $by->id, 'updated_at' => now(), 'created_at' => now()]);
        }
        ProjectLog::record((int) $project->id, $by, 'material.planned', 'material', $variantId, null, ['quantity' => $qty]);
    }

    /** @param array<string, mixed> $d variant_id, quantity, location_id, needed_on, note @return int */
    public function ask(object $project, array $d, User $by): int
    {
        $this->access->authorize($by, 'materials', $project);
        $this->needSite();
        $variantId = (int) ($d['variant_id'] ?? 0);
        $name = $this->variant($variantId);
        $qty = round((float) ($d['quantity'] ?? 0), 4);
        $qty > 0 || throw new ProjectException('Say how much is needed.');
        $location = (int) ($d['location_id'] ?? 0) ?: (int) DB::table('project_site')->where('project_id', $project->id)->value('location_id');
        in_array($location, array_column($this->branches(), 'id'), true) || throw new ProjectException('Choose the branch it comes from.');
        $needed = ! empty($d['needed_on']) ? (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $d['needed_on']) ? $d['needed_on'] : throw new ProjectException('Choose the day it is needed.')) : null;
        $id = DB::table('project_material_requests')->insertGetId(['project_id' => $project->id, 'variant_id' => $variantId, 'quantity' => $qty, 'location_id' => $location, 'needed_on' => $needed,
            'note' => ! empty($d['note']) ? mb_substr(trim((string) $d['note']), 0, 300) : null, 'state' => 'open', 'asked_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('project_site')->updateOrInsert(['project_id' => $project->id], ['location_id' => $location, 'updated_by' => $by->id, 'updated_at' => now()]);   // the branch asked from becomes the usual one
        ProjectLog::record((int) $project->id, $by, 'material.asked', 'material_request', $id, null, ['material' => $name, 'quantity' => $qty]);
        $store = app(Staff::class)->holding('stock.manage')->filter(fn ($u) => (int) $u->id !== (int) $by->id && $u->hasPermission('projects.materials'));
        ProjectNotices::tell($store, ProjectNotices::TASK, "Materials asked for · {$project->number}", "{$by->name} asks for {$qty} × {$name}" . ($needed ? ' by ' . \Carbon\Carbon::parse($needed)->format('j M') : '') . '.',
            "/admin/projects/{$project->id}?tab=site", 'Issue them');

        return $id;
    }

    public function cancel(object $project, int $id, User $by): void
    {
        $r = $this->request($project, $id);
        if ((int) $r->asked_by !== (int) $by->id) {
            $this->access->authorize($by, 'materials', $project);
        }
        DB::table('project_material_requests')->where('id', $id)->update(['state' => $r->issued_qty > 0 ? 'done' : 'cancelled', 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'material.request_closed', 'material_request', $id, null, null);
    }

    /**
     * Issue materials to the work from a branch, against a request or not. @param array<int, array{variant_id: int, quantity: float}> $items
     */
    public function issue(object $project, int $locationId, array $items, ?int $requestId, User $by): void
    {
        $this->mayIssue($by, $project) || throw new ProjectException('Issuing materials needs Projects materials and Stock management.', 403);
        $this->needSite();
        in_array($project->state, ['open', 'on_hold'], true) || throw new ProjectException('This work is closed. Nothing more can be issued to it.');
        $request = $requestId ? $this->request($project, $requestId) : null;
        if ($request) {
            in_array($request->state, ['open', 'part'], true) || throw new ProjectException('That request is no longer open.');
            $locationId = (int) $request->location_id;
            $items = [['variant_id' => (int) $request->variant_id, 'quantity' => (float) ($items[0]['quantity'] ?? ((float) $request->quantity - (float) $request->issued_qty))]];
        }
        $items = array_values(array_filter(array_map(fn ($i) => ['variant_id' => (int) ($i['variant_id'] ?? 0), 'quantity' => round((float) ($i['quantity'] ?? 0), 4)], $items), fn ($i) => $i['quantity'] > 0));
        $items || throw new ProjectException('Say how much to issue.');
        in_array($locationId, array_column($this->branches(), 'id'), true) || throw new ProjectException('Choose the branch it comes from.');

        DB::transaction(function () use ($project, $locationId, $items, $request, $by) {
            $job = $this->jobFor($project, $locationId, $by);
            try {
                $this->jobs->issue($job, $items, $by);
            } catch (BooksException $e) {
                throw new ProjectException($e->getMessage());
            }
            if ($request) {
                $done = round((float) $request->issued_qty + $items[0]['quantity'], 4);
                DB::table('project_material_requests')->where('id', $request->id)->update(['issued_qty' => $done, 'state' => $done + 0.00005 >= (float) $request->quantity ? 'done' : 'part', 'updated_at' => now()]);
            }
            ProjectLog::record((int) $project->id, $by, 'material.issued', 'stock_job', (int) $job->id, null, ['job' => $job->number, 'items' => $items, 'request' => $request?->id]);
        });
        if ($request && $request->asked_by && (int) $request->asked_by !== (int) $by->id) {
            ProjectNotices::tell(User::find($request->asked_by), ProjectNotices::TASK, "Materials issued · {$project->number}", "{$by->name} issued {$items[0]['quantity']} × " . $this->variant((int) $request->variant_id) . '.', "/admin/projects/{$project->id}?tab=site", 'Open the site');
        }
    }

    /** Take an issued line (or part of it) back to stock. */
    public function giveBack(object $project, int $lineId, ?float $qty, User $by): void
    {
        $this->mayIssue($by, $project) || throw new ProjectException('Returning materials needs Projects materials and Stock management.', 403);
        $line = DB::table('stock_job_lines')->where('id', $lineId)->first();
        $jobId = $line ? DB::table('project_stock_jobs')->where('project_id', $project->id)->where('stock_job_id', $line->job_id)->value('stock_job_id') : null;
        $jobId || throw new ProjectException('That material was not issued to this work.', 404);
        try {
            $this->jobs->returnLine(StockJob::findOrFail($jobId), $lineId, $qty, $by);
        } catch (BooksException $e) {
            throw new ProjectException($e->getMessage());
        }
        ProjectLog::record((int) $project->id, $by, 'material.returned', 'stock_job', (int) $jobId, null, ['line' => $lineId, 'quantity' => $qty]);
    }

    /** The work closed: its open jobs are completed, so what they hold becomes a cost. A refusal from Books does not stop the closing; it is logged and the lead told. */
    public function useUp(object $project, User $by): void
    {
        if (! ProjectsSetup::site()) {
            return;
        }
        foreach (DB::table('project_stock_jobs')->where('project_id', $project->id)->pluck('stock_job_id') as $id) {
            $job = StockJob::find($id);
            if (! $job || $job->status !== 'open') {
                continue;
            }
            try {
                $this->jobs->complete($job, null, $by);
                ProjectLog::record((int) $project->id, $by, 'material.used_up', 'stock_job', (int) $job->id, null, ['job' => $job->number]);
            } catch (\Throwable $e) {
                ProjectLog::record((int) $project->id, $by, 'material.used_up_failed', 'stock_job', (int) $job->id, null, ['job' => $job->number, 'reason' => $e->getMessage()]);
                ProjectNotices::tell($by, ProjectNotices::TASK, "Stock job {$job->number} was not completed · {$project->number}", $e->getMessage() . ' Complete it in Stock → Jobs.', '/admin/stock/jobs', 'Open Stock jobs');
            }
        }
    }

    /** Products to choose from: name, SKU or barcode. @return array<int, array{id: int, name: string, unit: ?string}> */
    public function find(string $q): array
    {
        $q = trim($q);
        if (mb_strlen($q) < 2) {
            return [];
        }
        $ids = DB::table('product_variants as pv')->join('products as p', 'p.id', '=', 'pv.product_id')->whereNull('pv.deleted_at')
            ->where(fn ($w) => $w->where('p.name', 'like', "%{$q}%")->orWhere('pv.name', 'like', "%{$q}%")->orWhere('pv.sku', 'like', "{$q}%")->orWhere('pv.barcode', $q))
            ->orderBy('p.name')->limit(20)->pluck('pv.id')->map(fn ($v) => (int) $v)->all();
        $names = $this->names($ids);

        return array_map(fn ($id) => ['id' => $id, 'name' => $names[$id]['name'] ?? "Item {$id}", 'unit' => $names[$id]['unit'] ?? null], $ids);
    }

    /** For whoever keeps the store: materials asked for on every work they may issue to. @return array<int, array<string, mixed>> */
    public function waiting(User $user): array
    {
        if (! ProjectsSetup::site() || ! $user->hasPermission('stock.manage') || ! $user->hasPermission('projects.materials')) {
            return [];
        }
        $rows = DB::table('project_material_requests as r')->join('projects as p', 'p.id', '=', 'r.project_id')->whereIn('r.state', ['open', 'part'])->whereNull('p.deleted_at')->whereIn('p.state', ['open', 'on_hold'])
            ->orderByRaw('r.needed_on IS NULL')->orderBy('r.needed_on')->orderBy('r.id')->limit(300)->get(['r.*', 'p.number', 'p.title', 'p.confidential', 'p.frozen_at', 'p.deleted_at']);
        $rows = $rows->filter(fn ($r) => $this->mayIssue($user, (object) ['id' => $r->project_id, 'confidential' => $r->confidential, 'frozen_at' => $r->frozen_at, 'deleted_at' => $r->deleted_at, 'state' => 'open']));
        $names = $this->names($rows->pluck('variant_id')->unique()->all());
        $branches = collect($this->branches())->keyBy('id');

        return $rows->values()->map(fn ($r) => ['id' => (int) $r->id, 'project_id' => (int) $r->project_id, 'project' => "{$r->number} {$r->title}", 'name' => $names[$r->variant_id]['name'] ?? "Item {$r->variant_id}",
            'unit' => $names[$r->variant_id]['unit'] ?? null, 'still' => round((float) $r->quantity - (float) $r->issued_qty, 4), 'branch' => $branches[(int) $r->location_id]['name'] ?? null, 'needed_on' => $r->needed_on,
            'late' => $r->needed_on && $r->needed_on < now()->toDateString()])->all();
    }

    public function mayIssue(User $user, object $project): bool
    {
        if (! empty($project->deleted_at) || ! $user->hasPermission('stock.manage') || ! $user->hasPermission('projects.materials')) {
            return false;
        }

        // whoever keeps the store may not be on the work; confidential work stays for those on it
        return $this->access->decide($user, 'materials', $project)['allowed'] || ! $project->confidential;
    }

    // ------------------------------------------------------------------ inside

    private function jobFor(object $project, int $locationId, User $by): StockJob
    {
        foreach (DB::table('project_stock_jobs')->where('project_id', $project->id)->where('location_id', $locationId)->orderByDesc('id')->pluck('stock_job_id') as $id) {
            $job = StockJob::find($id);
            if ($job && $job->status === 'open') {
                return $job;
            }
        }
        try {
            $job = $this->jobs->open(mb_substr("{$project->number} {$project->title}", 0, 190), $locationId, $project->customer_id ? (int) $project->customer_id : null, 'Materials for a piece of work in Projects', $by, $project->cost_centre_id ? (int) $project->cost_centre_id : null);
        } catch (BooksException $e) {
            throw new ProjectException($e->getMessage());
        }
        DB::table('project_stock_jobs')->insert(['project_id' => $project->id, 'location_id' => $locationId, 'stock_job_id' => $job->id, 'created_at' => now()]);

        return $job;
    }

    /** @return array<int, array{id: int, name: string}> */
    private function branches(): array
    {
        return DB::table('locations')->where('is_active', 1)->orderBy('sort_order')->orderBy('name')->get(['id', 'name'])->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->name])->all();
    }

    /** @return array<int, array{name: string, unit: ?string}> */
    private function names(array $ids): array
    {
        if (! $ids) {
            return [];
        }
        $units = Schema::hasTable('product_variant_units') && Schema::hasTable('units_of_measure') && Schema::hasColumn('product_variant_units', 'unit_id') ? DB::table('product_variant_units as vu')->join('units_of_measure as u', 'u.id', '=', 'vu.unit_id')->whereIn('vu.variant_id', $ids)->where('vu.role', 'base')->pluck('u.name', 'vu.variant_id') : collect();
        $out = [];
        foreach (DB::table('product_variants as pv')->join('products as p', 'p.id', '=', 'pv.product_id')->whereIn('pv.id', $ids)->get(['pv.id', 'p.name', 'pv.name as variant']) as $r) {
            $out[(int) $r->id] = ['name' => $r->variant && $r->variant !== $r->name && $r->variant !== 'Default' ? "{$r->name} ({$r->variant})" : $r->name, 'unit' => $units[$r->id] ?? null];
        }

        return $out;
    }

    private function variant(int $id): string
    {
        return $this->names([$id])[$id]['name'] ?? throw new ProjectException('Choose a product from the catalogue.');
    }

    private function request(object $project, int $id): object
    {
        return DB::table('project_material_requests')->where('id', $id)->where('project_id', $project->id)->first() ?? throw new ProjectException('That request is not on this work.', 404);
    }

    private function needSite(): void
    {
        ProjectsSetup::site() || throw new ProjectException('The site is not set up yet. Run script 267.', 409);
    }
}
