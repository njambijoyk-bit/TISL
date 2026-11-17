<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Billing plans (docs/PROJECTS_STAGE4_SPEC.md, build 4.6).
 *
 * A plan is a list of stages, each a share (%) of the agreed value: the linked Books sales orders (or, with none, quotations), before tax.
 * A stage falls due on a date, when a phase is done, when the project reaches a stage, or when someone says so. No amount is stored: a stage's
 * amount is worked out from the agreed value when it is shown or billed, and the last stage of a plan that adds up to 100% takes what is left,
 * so the bills add up to the agreed value to the cent.
 *
 * Billing a stage makes a Books sales invoice to the project's client on its cost centre, with one line to the income ledger (which decides the
 * tax, as on the Books form). The money setting decides how: "post" posts it from here (the bill permission, then the serious-action rules);
 * "draft" opens Books' own sales form already filled in, for a person to check and post there with their Books permission. Books has no draft
 * vouchers, so a draft is the filled form; the stage is tied to the invoice when it is saved.
 * An invoice cancelled in Books frees its stage to be billed again.
 */
class ProjectBilling
{
    public const DUE_KINDS = ['manual' => 'When someone bills it', 'date' => 'On a date', 'phase' => 'When a phase is done', 'stage' => 'When the work reaches a stage'];

    public function ready(): bool
    {
        return ProjectsSetup::money() && Schema::hasTable('voucher_types') && Schema::hasTable('vouchers');
    }

    /** The plan as the Money tab shows it. @return array<string, mixed> */
    public function plan(object $project, User $user): array
    {
        if (! $this->ready()) {
            return ['ready' => false, 'stages' => []];
        }
        $basis = $this->basis((int) $project->id);
        $rows = $this->rows((int) $project->id);
        $amounts = $basis ? $this->amounts($rows, $basis['net']) : [];
        $vouchers = DB::table('vouchers')->whereIn('id', $rows->pluck('voucher_id')->filter())->get(['id', 'voucher_number', 'status', 'date'])->keyBy('id');
        $phases = DB::table('project_phases')->where('project_id', $project->id)->whereNull('deleted_at')->orderBy('sort_order')->orderBy('id')->get(['id', 'name', 'state']);
        $stages = DB::table('project_stages')->where('type_id', $project->type_id)->whereNull('deleted_at')->orderBy('sort_order')->orderBy('id')->get(['id', 'name', 'sort_order']);
        $here = $stages->firstWhere('id', $project->stage_id);
        $terms = $this->terms((int) $project->id);
        $mode = app(ProjectSettings::class)->get('money')['bill_mode'];

        return [
            'ready' => true,
            'basis' => $basis ? ['net' => $basis['net'], 'from' => $basis['from'], 'count' => count($basis['vouchers'])] : null,
            'income_ledger' => $this->incomeLedger((int) $project->id, $basis),
            'income_chosen' => (bool) ($terms->income_ledger_id ?? null),
            'shares' => round((float) $rows->sum('share'), 4),
            'mode' => $mode,
            'stages' => $rows->map(function ($r) use ($amounts, $vouchers, $phases, $stages, $here, $project) {
                $v = $r->voucher_id ? ($vouchers[$r->voucher_id] ?? null) : null;
                $billed = $v && $v->status !== 'cancelled';
                $phase = $r->phase_id ? $phases->firstWhere('id', $r->phase_id) : null;
                $target = $r->stage_id ? $stages->firstWhere('id', $r->stage_id) : null;
                $due = match ($r->due_kind) {
                    'date' => $r->due_on && $r->due_on <= now()->toDateString(),
                    'phase' => $phase && $phase->state === 'done',
                    'stage' => $target && $here && (int) $here->sort_order >= (int) $target->sort_order,
                    default => true,
                };

                $taken = fn ($id) => $id ? round((float) DB::table('voucher_entries')->where('voucher_id', $id)->where('side', 'D')->sum('amount'), 2) : null;

                return ['id' => (int) $r->id, 'name' => $r->name, 'share' => round((float) $r->share, 4), 'amount' => $amounts[(int) $r->id] ?? null,
                    'retention' => $billed ? $taken($r->retention_voucher_id) : null, 'advance' => $billed ? $taken($r->advance_voucher_id) : null,
                    'owing' => $billed && app(ProjectTerms::class)->owing($project, $r),
                    'due_kind' => $r->due_kind, 'due_on' => $r->due_on, 'phase' => $phase ? ['id' => (int) $phase->id, 'name' => $phase->name] : null, 'stage' => $target ? ['id' => (int) $target->id, 'name' => $target->name] : null,
                    'state' => $billed ? 'billed' : ($due ? 'due' : 'waiting'),
                    'voucher' => $v ? ['id' => (int) $v->id, 'number' => $v->voucher_number, 'status' => $v->status, 'date' => $v->date] : null];
            })->values()->all(),
            'options' => ['due_kinds' => self::DUE_KINDS, 'phases' => $phases->map(fn ($p) => ['id' => (int) $p->id, 'name' => $p->name])->values()->all(),
                'stages' => $stages->map(fn ($s) => ['id' => (int) $s->id, 'name' => $s->name])->values()->all(), 'income_ledgers' => $this->incomeLedgers()],
            'can' => ['plan' => $user->hasPermission('projects.money.bill'), 'bill' => $user->hasPermission('projects.money.bill') && ($mode === 'post' || $user->hasPermission('books.post'))],
        ];
    }

    /**
     * Save the plan. Stages already billed stay as they are; the rest are replaced by what is sent. Shares add up to no more than 100.
     *
     * @param array<int, array<string, mixed>> $stages id (to keep one), name, share, due_kind, due_on, phase_id, stage_id
     */
    public function save(object $project, array $stages, ?int $incomeLedgerId, User $by): void
    {
        $this->needReady();
        if (! $this->basis((int) $project->id)) {
            throw new ProjectException('A billing plan is shares of the agreed value. Link the quotation or sales order to this work first.');
        }
        $rows = $this->rows((int) $project->id);
        $live = $this->billedIds($rows);
        $kept = $rows->whereIn('id', $live);
        $clean = [];
        foreach (array_values($stages) as $i => $s) {
            if (! empty($s['id']) && in_array((int) $s['id'], $live, true)) {
                continue;   // a billed stage is not changed by a plan
            }
            $clean[] = $this->stage($project, (array) $s, $i + 1);
        }
        $total = round((float) $kept->sum('share') + array_sum(array_column($clean, 'share')), 4);
        if ($total > 100.0001) {
            throw new ProjectException('The shares add up to ' . rtrim(rtrim(number_format($total, 4), '0'), '.') . '%. A plan bills the agreed value once: no more than 100%.');
        }
        if ($incomeLedgerId && ! in_array($incomeLedgerId, array_column($this->incomeLedgers(), 'id'), true)) {
            throw new ProjectException('Choose an income ledger from the books.');
        }
        DB::transaction(function () use ($project, $live, $clean, $incomeLedgerId, $by, $total) {
            DB::table('project_billing_stages')->where('project_id', $project->id)->whereNotIn('id', $live ?: [0])->delete();
            foreach ($clean as $c) {
                DB::table('project_billing_stages')->insert($c + ['project_id' => $project->id, 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
            }
            DB::table('project_money_terms')->updateOrInsert(['project_id' => $project->id], ['income_ledger_id' => $incomeLedgerId ?: null, 'updated_by' => $by->id, 'updated_at' => now()]);
            ProjectLog::record((int) $project->id, $by, 'billing.plan_saved', 'project', (int) $project->id, null, ['stages' => count($clean) + count($live), 'shares' => $total]);
        });
    }

    /**
     * Bill one stage. With the setting on "post", the invoice is posted in Books now and its number comes back; on "draft", what the Books form
     * needs to open filled in comes back instead. The caller has checked the permission and, for posting, the serious-action rules.
     *
     * @return array{mode: string, voucher?: array{id: int, number: string}, form?: array<string, mixed>}
     */
    public function bill(object $project, int $stageId, User $by, ?string $date = null): array
    {
        $bill = $this->prepare($project, $stageId);
        if (app(ProjectSettings::class)->get('money')['bill_mode'] !== 'post') {
            return ['mode' => 'draft', 'form' => $bill];
        }

        return DB::transaction(function () use ($project, $stageId, $bill, $by, $date) {
            DB::table('project_billing_stages')->where('id', $stageId)->lockForUpdate()->first();   // two people billing one stage: the second finds it billed
            $this->prepare($project, $stageId);
            $v = app(ProjectVoucherPoster::class)->sales($date ?: now()->toDateString(), $bill['customer_id'], $bill['lines'], $bill['cost_centre_id'], $bill['narration'], $bill['reference_no'], $by);
            DB::table('project_billing_stages')->where('id', $stageId)->update(['voucher_id' => $v['id'], 'retention_voucher_id' => null, 'advance_voucher_id' => null, 'updated_at' => now()]);
            ProjectLog::record((int) $project->id, $by, 'billing.billed', 'billing_stage', $stageId, null, ['stage' => $bill['stage'], 'voucher' => $v['number']]);
            $taken = app(ProjectTerms::class)->deduct($project, $stageId, $by, $bill['amount']);   // retention held back and advances used, in the same step: all or nothing

            return ['mode' => 'post', 'voucher' => $v, 'taken' => $taken];
        });
    }

    /** What the bill for a stage would be: for posting, and for the Books form to open filled in. @return array<string, mixed> */
    public function prepare(object $project, int $stageId): array
    {
        $this->needReady();
        $rows = $this->rows((int) $project->id);
        $r = $rows->firstWhere('id', $stageId);
        if (! $r) {
            throw new ProjectException('Not found.', 404);
        }
        if (in_array($stageId, $this->billedIds($rows), true)) {
            throw new ProjectException('This stage is already billed.');
        }
        if (! $project->customer_id) {
            throw new ProjectException('This work has no client to bill. Choose its client first.');
        }
        if (! $project->cost_centre_id) {
            throw new ProjectException('This work has no cost centre in the books yet, so its bills would not count towards it.');
        }
        $basis = $this->basis((int) $project->id);
        if (! $basis) {
            throw new ProjectException('A billing plan is shares of the agreed value. Link the quotation or sales order to this work first.');
        }
        $ledger = $this->incomeLedger((int) $project->id, $basis);
        if (! $ledger) {
            throw new ProjectException('Choose the income ledger bills go to, on the billing plan.');
        }
        $amount = $this->amounts($rows, $basis['net'])[$stageId] ?? 0.0;
        if ($amount <= 0) {
            throw new ProjectException('This stage comes to nothing, so there is nothing to bill.');
        }
        $share = rtrim(rtrim(number_format((float) $r->share, 4), '0'), '.');

        return [
            'stage_id' => (int) $r->id, 'stage' => $r->name, 'project_id' => (int) $project->id,
            'voucher_type_id' => ($t = DB::table('voucher_types')->where('base_type', 'sales')->where('is_active', 1)->orderBy('id')->value('id')) ? (int) $t : null, 'customer_id' => (int) $project->customer_id, 'cost_centre_id' => (int) $project->cost_centre_id,
            'customer_name' => ($c = DB::table('customers')->where('id', $project->customer_id)->first()) ? ProjectService::customerName($c) : null,
            'amount' => $amount, 'narration' => "{$project->number} {$project->title}: {$r->name}", 'reference_no' => mb_substr($project->number, 0, 60),
            'lines' => [['type' => 'custom', 'description' => "{$r->name}: {$share}% of the agreed {$basis['word']} for {$project->number}", 'quantity' => 1, 'rate' => $amount, 'ledger_id' => $ledger['id']]],
        ];
    }

    /**
     * From the Books voucher form: a sales invoice saved from a drafted bill is tied to its stage, when it is on that work's cost centre (or a
     * phase's) and the stage is not billed yet. Anything else is left alone: the invoice stands as Books saved it.
     */
    public function tie(int $stageId, int $voucherId, ?int $costCentreId, ?User $by = null): void
    {
        if (! $this->ready()) {
            return;
        }
        $r = DB::table('project_billing_stages')->where('id', $stageId)->first();
        $on = app(VoucherProjects::class)->projectOf($costCentreId);
        if (! $r || ! $on || $on['project_id'] !== (int) $r->project_id || in_array($stageId, $this->billedIds(collect([$r])), true)) {
            return;
        }
        DB::table('project_billing_stages')->where('id', $stageId)->update(['voucher_id' => $voucherId, 'retention_voucher_id' => null, 'advance_voucher_id' => null, 'updated_at' => now()]);
        ProjectLog::record((int) $r->project_id, $by, 'billing.billed', 'billing_stage', $stageId, null, ['stage' => $r->name, 'voucher_id' => $voucherId, 'from' => 'books form']);
        if ($by) {
            // retention and advances come off it now; if they cannot (no retention ledger chosen, say), the invoice stands and the Money tab offers to try again
            try {
                $project = DB::table('projects')->where('id', $r->project_id)->first();
                app(ProjectTerms::class)->deduct($project, $stageId, $by, $this->stageNet($project, $stageId));
            } catch (ProjectException $e) {
                ProjectLog::record((int) $r->project_id, $by, 'billing.deduct_waiting', 'billing_stage', $stageId, null, ['why' => $e->getMessage()]);
            }
        }
    }

    /** Take retention and advances off a billed stage's invoice, when that did not happen as it was billed. @return array{retention: ?int, advance: ?int} */
    public function deduct(object $project, int $stageId, User $by): array
    {
        $this->needReady();
        if (! in_array($stageId, $this->billedIds($this->rows((int) $project->id)), true)) {
            throw new ProjectException('This stage is not billed yet.');
        }

        return app(ProjectTerms::class)->deduct($project, $stageId, $by, $this->stageNet($project, $stageId));
    }

    /** What a stage comes to before tax, from the agreed value as it is now. */
    private function stageNet(object $project, int $stageId): float
    {
        $basis = $this->basis((int) $project->id);

        return $basis ? ($this->amounts($this->rows((int) $project->id), $basis['net'])[$stageId] ?? 0.0) : 0.0;
    }

    // ------------------------------------------------------------------ inside

    /**
     * The agreed value, before tax: the linked sales orders, or with none the linked quotations, not cancelled. The income ledger most of it goes to
     * is offered as the default.
     *
     * @return array{net: float, from: string, word: string, vouchers: int[], ledger_id: ?int}|null
     */
    public function basis(int $projectId): ?array
    {
        if (! Schema::hasTable('project_links')) {
            return null;
        }
        $rows = DB::table('project_links as l')->join('vouchers as v', 'v.id', '=', 'l.linked_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->where('l.project_id', $projectId)->where('l.module', 'books')->where('l.link_type', 'voucher')->whereNull('l.deleted_at')->where('v.status', '!=', 'cancelled')
            ->whereIn('t.base_type', ['sales_order', 'quotation'])->get(['v.id', 't.base_type', 'v.total_amount']);
        foreach (['sales_order' => ['sales orders', 'order'], 'quotation' => ['quotations', 'quotation']] as $base => [$words, $word]) {
            $ids = $rows->where('base_type', $base)->pluck('id')->map(fn ($v) => (int) $v)->all();
            if (! $ids) {
                continue;
            }
            $net = (float) $rows->whereIn('id', $ids)->sum('total_amount');
            $ledger = null;
            if (Schema::hasTable('voucher_items')) {
                $items = DB::table('voucher_items')->whereIn('voucher_id', $ids)->where(fn ($q) => $q->whereNull('is_header')->orWhere('is_header', 0))->get(['amount', 'ledger_id']);
                if ($items->isNotEmpty()) {
                    $net = (float) $items->sum('amount');
                    $ledger = $items->whereNotNull('ledger_id')->groupBy('ledger_id')->map(fn ($g) => $g->sum('amount'))->sortDesc()->keys()->first();
                }
            }

            return ['net' => round($net, 2), 'from' => $words, 'word' => $word, 'vouchers' => $ids, 'ledger_id' => $ledger ? (int) $ledger : null];
        }

        return null;
    }

    /** Each stage's amount: its share of the agreed value; the last stage of a plan at 100% takes what the others leave. @return array<int, float> */
    private function amounts($rows, float $net): array
    {
        $out = [];
        foreach ($rows as $r) {
            $out[(int) $r->id] = round($net * (float) $r->share / 100, 2);
        }
        if ($rows->isNotEmpty() && abs((float) $rows->sum('share') - 100) < 0.0001) {
            $last = (int) $rows->last()->id;
            $out[$last] = round($net - (array_sum($out) - $out[$last]), 2);
        }

        return $out;
    }

    private function rows(int $projectId)
    {
        return DB::table('project_billing_stages')->where('project_id', $projectId)->orderBy('sort_order')->orderBy('id')->get();
    }

    /** Stages whose invoice stands (not cancelled). @return int[] */
    private function billedIds($rows): array
    {
        $ids = $rows->pluck('voucher_id')->filter()->all();
        $standing = $ids ? DB::table('vouchers')->whereIn('id', $ids)->where('status', '!=', 'cancelled')->pluck('id')->map(fn ($v) => (int) $v)->all() : [];

        return $rows->filter(fn ($r) => $r->voucher_id && in_array((int) $r->voucher_id, $standing, true))->pluck('id')->map(fn ($v) => (int) $v)->values()->all();
    }

    private function terms(int $projectId): ?object
    {
        return DB::table('project_money_terms')->where('project_id', $projectId)->first();
    }

    /** @return array{id: int, name: string}|null */
    private function incomeLedger(int $projectId, ?array $basis): ?array
    {
        $id = $this->terms($projectId)->income_ledger_id ?? null;
        $id = $id ?: ($basis['ledger_id'] ?? null);
        $name = $id && Schema::hasTable('ledgers') ? DB::table('ledgers')->where('id', $id)->value('name') : null;

        return $name ? ['id' => (int) $id, 'name' => $name] : null;
    }

    /** @return array<int, array{id: int, name: string}> */
    private function incomeLedgers(): array
    {
        if (! Schema::hasTable('ledgers') || ! Schema::hasTable('ledger_groups')) {
            return [];
        }

        return DB::table('ledgers as l')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')->where('g.nature', 'income')->where('l.is_active', 1)->orderBy('l.name')
            ->get(['l.id', 'l.name'])->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->name])->all();
    }

    /** @param array<string, mixed> $s @return array<string, mixed> */
    private function stage(object $project, array $s, int $order): array
    {
        $name = trim(preg_replace('/\s+/', ' ', (string) ($s['name'] ?? '')));
        if ($name === '') {
            throw new ProjectException('Give every stage a name.');
        }
        $share = round((float) ($s['share'] ?? 0), 4);
        if ($share <= 0 || $share > 100) {
            throw new ProjectException("\"{$name}\": the share is a percentage above 0 and up to 100.");
        }
        $kind = (string) ($s['due_kind'] ?? 'manual');
        if (! isset(self::DUE_KINDS[$kind])) {
            throw new ProjectException("\"{$name}\": choose when it falls due from the list.");
        }
        $row = ['name' => mb_substr($name, 0, 120), 'share' => $share, 'due_kind' => $kind, 'due_on' => null, 'phase_id' => null, 'stage_id' => null, 'voucher_id' => null, 'sort_order' => $order];
        if ($kind === 'date') {
            try {
                $row['due_on'] = \Carbon\Carbon::parse((string) ($s['due_on'] ?? ''))->toDateString();
            } catch (\Throwable) {
                throw new ProjectException("\"{$name}\": give the date it falls due.");
            }
            if (empty($s['due_on'])) {
                throw new ProjectException("\"{$name}\": give the date it falls due.");
            }
        } elseif ($kind === 'phase') {
            $row['phase_id'] = (int) ($s['phase_id'] ?? 0);
            if (! DB::table('project_phases')->where('id', $row['phase_id'])->where('project_id', $project->id)->whereNull('deleted_at')->exists()) {
                throw new ProjectException("\"{$name}\": choose one of this work's phases.");
            }
        } elseif ($kind === 'stage') {
            $row['stage_id'] = (int) ($s['stage_id'] ?? 0);
            if (! DB::table('project_stages')->where('id', $row['stage_id'])->where('type_id', $project->type_id)->whereNull('deleted_at')->exists()) {
                throw new ProjectException("\"{$name}\": choose one of this kind of work's stages.");
            }
        }

        return $row;
    }

    private function needReady(): void
    {
        if (! $this->ready()) {
            throw new ProjectException('Billing plans need database script 260. Run it first.', 409);
        }
    }
}
