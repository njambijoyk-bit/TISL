<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Advances and retention (docs/PROJECTS_STAGE4_SPEC.md, build 4.7). Every amount is a Books voucher; only percentages and ledgers are kept here.
 *
 * Retention: the client keeps back a percentage of each bill (before tax) until the work is accepted. When a stage is billed, a journal moves that
 * much from the client's account to the retention ledger and settles it against the invoice: debit retention, credit the client. Releasing it
 * (a serious action) puts it back on the client's account: debit the client, credit retention. The retention ledger is the company's (Configuration)
 * or, when Configuration says a ledger per client, the client's: the one their other work uses, or the one chosen on this work. A piece of work may
 * name its own, overriding both.
 *
 * Advances: money a client pays before it is billed. Receiving one is a journal into a cash or bank ledger, owed back through the advances ledger:
 * debit cash or bank, credit advances. Each bill then uses what is unused: debit advances, credit the client, settled against the invoice.
 *
 * What is held or unused is read from posted Books lines on those ledgers on the work's cost centres.
 */
class ProjectTerms
{
    public function ready(): bool
    {
        return ProjectsSetup::money() && Schema::hasTable('ledgers') && Schema::hasTable('voucher_entries');
    }

    /** For the Money tab. @return array<string, mixed> */
    public function of(object $project, User $user): array
    {
        if (! $this->ready()) {
            return ['ready' => false];
        }
        $t = $this->row((int) $project->id);
        $retention = $this->retentionLedger($project);
        $advance = $t && $t->advance_ledger_id ? $this->ledger((int) $t->advance_ledger_id) : null;
        $settings = app(ProjectSettings::class)->get('money');

        return [
            'ready' => true,
            'retention_percent' => $t && $t->retention_percent !== null ? round((float) $t->retention_percent, 3) : null,
            'retention_ledger' => $retention, 'retention_mode' => $settings['retention_mode'],
            'advance_ledger' => $advance,
            'retention_held' => $this->retentionHeld($project),
            'advance_unused' => $this->advanceUnused($project),
            'options' => ['retention_ledgers' => $this->ledgersOf('asset'), 'advance_ledgers' => $this->ledgersOf('liability'), 'cash_ledgers' => $this->cashLedgers()],
            'can' => ['retention' => $user->hasPermission('projects.money.retention'), 'advance' => $user->hasPermission('projects.money.bill')],
        ];
    }

    /**
     * Change this work's terms. Retention (percentage and ledger) needs `projects.money.retention`; the advances ledger needs `projects.money.bill`.
     * A ledger cannot change while money is held on the old one.
     *
     * @param array<string, mixed> $d retention_percent, retention_ledger_id (0 = as Configuration says), advance_ledger_id
     */
    public function save(object $project, array $d, User $by): void
    {
        $this->needReady();
        $t = $this->row((int) $project->id);
        $row = [];
        if (array_key_exists('retention_percent', $d) || array_key_exists('retention_ledger_id', $d)) {
            if (! $by->hasPermission('projects.money.retention')) {
                throw new ProjectException('Retention needs the permission to manage retention.', 403);
            }
            $pct = array_key_exists('retention_percent', $d) ? $d['retention_percent'] : ($t->retention_percent ?? null);   // what is not sent stays as it is
            $pct = $pct === null || $pct === '' ? null : round((float) $pct, 3);
            if ($pct !== null && ($pct < 0 || $pct > 50)) {
                throw new ProjectException('Retention is a percentage from 0 to 50.');
            }
            $ledger = (int) (array_key_exists('retention_ledger_id', $d) ? ($d['retention_ledger_id'] ?? 0) : ($t->retention_ledger_id ?? 0)) ?: null;
            if ($ledger && ! in_array($ledger, array_column($this->ledgersOf('asset'), 'id'), true)) {
                throw new ProjectException('Retention is money the client still owes: choose an asset ledger.');
            }
            $before = $this->retentionLedger($project)['id'] ?? null;
            $row += ['retention_percent' => $pct ?: null, 'retention_ledger_id' => $ledger];
            $after = $ledger ?: ($this->retentionLedger($project, $row)['id'] ?? null);
            if ($before && $after !== $before && $this->retentionHeld($project) > 0.004) {
                throw new ProjectException('Retention is held on the ledger this work uses now. Release it before changing the ledger.');
            }
        }
        if (array_key_exists('advance_ledger_id', $d)) {
            if (! $by->hasPermission('projects.money.bill')) {
                throw new ProjectException('Advances need the permission to bill.', 403);
            }
            $ledger = (int) ($d['advance_ledger_id'] ?? 0) ?: null;
            if ($ledger && ! in_array($ledger, array_column($this->ledgersOf('liability'), 'id'), true)) {
                throw new ProjectException('An advance is owed back to the client until it is billed: choose a liability ledger.');
            }
            if (($t->advance_ledger_id ?? null) && (int) $t->advance_ledger_id !== $ledger && $this->advanceUnused($project) > 0.004) {
                throw new ProjectException('Part of an advance is still unused on the ledger this work uses now. It can change once that is billed.');
            }
            $row['advance_ledger_id'] = $ledger;
        }
        if (! $row) {
            return;
        }
        DB::table('project_money_terms')->updateOrInsert(['project_id' => $project->id], $row + ['updated_by' => $by->id, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'money.terms_saved', 'project', (int) $project->id, null, $row);
    }

    /** An advance received: debit the cash or bank ledger, credit the advances ledger, both on the work's cost centre. @param array<string, mixed> $d amount, date, ledger_id, from, reference */
    public function receiveAdvance(object $project, array $d, User $by): int
    {
        $this->needReady();
        $advance = $this->row((int) $project->id)->advance_ledger_id ?? null;
        if (! $advance) {
            throw new ProjectException("Choose this work's advances ledger first.");
        }
        $amount = round((float) ($d['amount'] ?? 0), 2);
        if ($amount <= 0) {
            throw new ProjectException('Enter the amount received.');
        }
        $into = (int) ($d['ledger_id'] ?? 0);
        if (! in_array($into, array_column($this->cashLedgers(), 'id'), true)) {
            throw new ProjectException('Choose the cash or bank ledger it was paid into.');
        }
        $this->needCostCentre($project);
        $date = $this->date($d['date'] ?? null);
        $from = trim((string) ($d['from'] ?? '')) ?: 'the client';
        $cc = (int) $project->cost_centre_id;
        $voucher = app(ProjectVoucherPoster::class)->journal($date, "Advance from {$from} for {$project->number}", ($r = trim((string) ($d['reference'] ?? ''))) === '' ? null : mb_substr($r, 0, 60),
            [['ledger_id' => $into, 'side' => 'D', 'amount' => $amount, 'cost_centre_id' => $cc], ['ledger_id' => (int) $advance, 'side' => 'C', 'amount' => $amount, 'cost_centre_id' => $cc]], $by);
        ProjectLog::record((int) $project->id, $by, 'money.advance_received', 'project', (int) $project->id, null, ['voucher_id' => $voucher]);

        return $voucher;
    }

    /**
     * After a stage is billed: hold back retention, then use what is unused of advances, each a journal settled against the invoice. Each step is
     * done once (the stage remembers its journal). @return array{retention: ?int, advance: ?int}
     */
    public function deduct(object $project, int $stageId, User $by, float $net): array
    {
        $t = ProjectsSetup::money() ? $this->row((int) $project->id) : null;
        if (! $t || ((float) ($t->retention_percent ?? 0) <= 0 && ! $t->advance_ledger_id)) {
            return ['retention' => null, 'advance' => null];   // nothing is taken off this work's bills
        }
        $this->needReady();
        $s = DB::table('project_billing_stages')->where('id', $stageId)->where('project_id', $project->id)->first();
        $invoice = $s && $s->voucher_id ? DB::table('vouchers')->where('id', $s->voucher_id)->where('status', '!=', 'cancelled')->first() : null;
        if (! $invoice) {
            throw new ProjectException('This stage has no invoice in the books yet.');
        }
        $out = ['retention' => $s->retention_voucher_id ? (int) $s->retention_voucher_id : null, 'advance' => $s->advance_voucher_id ? (int) $s->advance_voucher_id : null];
        $client = null;
        $date = now()->toDateString();
        $cc = (int) $project->cost_centre_id;
        $total = round((float) $invoice->total_amount, 2);
        $kept = 0.0;

        $pct = (float) ($t->retention_percent ?? 0);
        if ($pct > 0 && ! $out['retention']) {
            $ledger = $this->retentionLedger($project);
            if (! $ledger) {
                throw new ProjectException('Retention is set on this work but no retention ledger is chosen. Choose one, then take it off the bill.');
            }
            $kept = min(round($net * $pct / 100, 2), $total);
            if ($kept > 0) {
                $client = $this->clientLedger($project);
                $out['retention'] = app(ProjectVoucherPoster::class)->journal($date, "Retention of {$pct}% held on {$invoice->voucher_number} for {$project->number}", mb_substr($project->number, 0, 60),
                    [['ledger_id' => $ledger['id'], 'side' => 'D', 'amount' => $kept, 'cost_centre_id' => $cc], ['ledger_id' => $client, 'side' => 'C', 'amount' => $kept, 'cost_centre_id' => $cc, 'is_party' => true]],
                    $by, [['against_voucher_id' => (int) $invoice->id, 'amount' => $kept]]);
                DB::table('project_billing_stages')->where('id', $stageId)->update(['retention_voucher_id' => $out['retention'], 'updated_at' => now()]);
            }
        } elseif ($out['retention']) {
            $kept = (float) DB::table('voucher_entries')->where('voucher_id', $out['retention'])->where('side', 'D')->sum('amount');
        }

        if (($t->advance_ledger_id ?? null) && ! $out['advance']) {
            $use = min($this->advanceUnused($project), round($total - $kept, 2));
            if ($use > 0.004) {
                $client ??= $this->clientLedger($project);
                $out['advance'] = app(ProjectVoucherPoster::class)->journal($date, "Advance used on {$invoice->voucher_number} for {$project->number}", mb_substr($project->number, 0, 60),
                    [['ledger_id' => (int) $t->advance_ledger_id, 'side' => 'D', 'amount' => $use, 'cost_centre_id' => $cc], ['ledger_id' => $client, 'side' => 'C', 'amount' => $use, 'cost_centre_id' => $cc, 'is_party' => true]],
                    $by, [['against_voucher_id' => (int) $invoice->id, 'amount' => $use]]);
                DB::table('project_billing_stages')->where('id', $stageId)->update(['advance_voucher_id' => $out['advance'], 'updated_at' => now()]);
            }
        }
        if ($out['retention'] || $out['advance']) {
            ProjectLog::record((int) $project->id, $by, 'billing.deducted', 'billing_stage', $stageId, null, $out);
        }

        return $out;
    }

    /** Is something still to be taken off this billed stage's invoice? */
    public function owing(object $project, object $stage): bool
    {
        $t = $this->row((int) $project->id);

        return ((float) ($t->retention_percent ?? 0) > 0 && ! $stage->retention_voucher_id) || (($t->advance_ledger_id ?? null) && ! $stage->advance_voucher_id && $this->advanceUnused($project) > 0.004);
    }

    /** Release retention back onto the client's account (the caller has asked the serious-action rules). */
    public function release(object $project, float $amount, User $by, ?string $date = null): int
    {
        $this->needReady();
        if (! $by->hasPermission('projects.money.retention')) {
            throw new ProjectException('Releasing retention needs the permission to manage retention.', 403);
        }
        $amount = round($amount, 2);
        if ($amount <= 0) {
            throw new ProjectException('Enter the amount to release.');
        }
        $ledger = $this->retentionLedger($project);
        $held = $this->retentionHeld($project);
        if (! $ledger || $amount > $held + 0.004) {
            throw new ProjectException('That is more than the retention held on this work (' . number_format($held, 2) . ').', 422, ['held' => $held]);
        }
        $cc = (int) $project->cost_centre_id;
        $voucher = app(ProjectVoucherPoster::class)->journal($this->date($date), "Retention released for {$project->number}", mb_substr($project->number, 0, 60),
            [['ledger_id' => $this->clientLedger($project), 'side' => 'D', 'amount' => $amount, 'cost_centre_id' => $cc, 'is_party' => true], ['ledger_id' => $ledger['id'], 'side' => 'C', 'amount' => $amount, 'cost_centre_id' => $cc]], $by);
        ProjectLog::record((int) $project->id, $by, 'money.retention_released', 'project', (int) $project->id, null, ['voucher_id' => $voucher]);

        return $voucher;
    }

    /** Held back and not yet released: debits less credits on the retention ledger, on this work's cost centres. */
    public function retentionHeld(object $project): float
    {
        $ledger = $this->retentionLedger($project);

        return $ledger ? round($this->net($project, $ledger['id']), 2) : 0.0;
    }

    /** Received and not yet used on bills: credits less debits on the advances ledger, on this work's cost centres. */
    public function advanceUnused(object $project): float
    {
        $ledger = $this->row((int) $project->id)->advance_ledger_id ?? null;

        return $ledger ? round(-$this->net($project, (int) $ledger), 2) : 0.0;
    }

    /**
     * The retention ledger for this work: its own, else (a ledger per client) the one its client's other work uses, else the company's.
     *
     * @param array<string, mixed>|null $pending terms about to be saved, to ask "what would it be"
     * @return array{id: int, name: string, from: string}|null
     */
    public function retentionLedger(object $project, ?array $pending = null): ?array
    {
        $own = $pending ? ($pending['retention_ledger_id'] ?? null) : ($this->row((int) $project->id)->retention_ledger_id ?? null);
        if ($own) {
            return $this->ledger((int) $own, 'this work');
        }
        $settings = app(ProjectSettings::class)->get('money');
        if ($settings['retention_mode'] === 'client') {
            $theirs = $project->customer_id ? DB::table('project_money_terms as t')->join('projects as p', 'p.id', '=', 't.project_id')->where('p.customer_id', $project->customer_id)
                ->where('p.id', '!=', $project->id)->whereNotNull('t.retention_ledger_id')->orderByDesc('t.updated_at')->value('t.retention_ledger_id') : null;

            return $theirs ? $this->ledger((int) $theirs, 'the client') : null;
        }

        return $settings['retention_ledger_id'] ? $this->ledger((int) $settings['retention_ledger_id'], 'the company') : null;
    }

    // ------------------------------------------------------------------ inside

    private function net(object $project, int $ledgerId): float
    {
        $cc = $this->costCentres($project);
        if (! $cc) {
            return 0.0;
        }

        return (float) DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id')->where('v.status', 'posted')->where('e.ledger_id', $ledgerId)
            ->where(fn ($q) => $q->whereIn('e.cost_centre_id', $cc)->orWhere(fn ($q) => $q->whereNull('e.cost_centre_id')->whereIn('v.cost_centre_id', $cc)))
            ->sum(DB::raw("CASE WHEN e.side = 'D' THEN e.amount ELSE -e.amount END"));
    }

    /** @return int[] the work's cost centre and its phases' */
    private function costCentres(object $project): array
    {
        $ids = DB::table('project_phases')->where('project_id', $project->id)->whereNotNull('cost_centre_id')->pluck('cost_centre_id')->map(fn ($v) => (int) $v)->all();

        return array_values(array_unique(array_filter(array_merge([(int) $project->cost_centre_id], $ids))));
    }

    /** The client's own ledger in the books (made by Books when it has none). */
    private function clientLedger(object $project): int
    {
        if (! $project->customer_id) {
            throw new ProjectException('This work has no client, so nothing can be taken off or put back on their account.');
        }
        if (Schema::hasColumn('ledgers', 'customer_id') && ($id = DB::table('ledgers')->where('customer_id', $project->customer_id)->value('id'))) {
            return (int) $id;
        }
        $customer = \App\Models\Customer::find($project->customer_id) ?? throw new ProjectException('The client is not in the books.');

        return (int) app(\App\Services\Books\LedgerService::class)->customerLedger($customer)->id;
    }

    private function row(int $projectId): ?object
    {
        return DB::table('project_money_terms')->where('project_id', $projectId)->first();
    }

    /** @return array{id: int, name: string, from?: string}|null */
    private function ledger(int $id, ?string $from = null): ?array
    {
        $name = DB::table('ledgers')->where('id', $id)->value('name');

        return $name ? ['id' => $id, 'name' => $name] + ($from ? ['from' => $from] : []) : null;
    }

    /** @return array<int, array{id: int, name: string}> */
    private function ledgersOf(string $nature): array
    {
        if (! Schema::hasTable('ledger_groups')) {
            return [];
        }
        $q = DB::table('ledgers as l')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')->where('g.nature', $nature)->where('l.is_active', 1);
        if (Schema::hasColumn('ledgers', 'customer_id')) {
            $q->whereNull('l.customer_id');   // a client's own account is not a retention or advances ledger
        }
        if (Schema::hasColumn('ledger_groups', 'behaviour')) {
            $q->where(fn ($w) => $w->whereNull('g.behaviour')->orWhereNotIn('g.behaviour', ['bank', 'cash', 'tax', 'debtors', 'creditors']));
        }

        return $q->orderBy('l.name')->get(['l.id', 'l.name'])->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->name])->all();
    }

    /** Cash and bank ledgers an advance can be paid into. @return array<int, array{id: int, name: string}> */
    private function cashLedgers(): array
    {
        if (! Schema::hasTable('ledger_groups')) {
            return [];
        }
        $groups = DB::table('ledger_groups')->whereIn('name', ['Cash-in-hand', 'Bank Accounts'])->pluck('id')->all();
        if (Schema::hasColumn('ledger_groups', 'parent_id')) {
            for ($i = 0, $more = $groups; $i < 5 && $more; $i++) {
                $more = DB::table('ledger_groups')->whereIn('parent_id', $more)->whereNotIn('id', $groups)->pluck('id')->all();
                $groups = array_merge($groups, $more);
            }
        }

        return DB::table('ledgers')->whereIn('group_id', $groups ?: [0])->where('is_active', 1)->orderBy('name')->get(['id', 'name'])->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->name])->all();
    }

    private function needCostCentre(object $project): void
    {
        if (! $project->cost_centre_id) {
            throw new ProjectException('This work has no cost centre in the books yet.');
        }
    }

    private function date(mixed $v): string
    {
        try {
            $d = $v ? \Carbon\Carbon::parse((string) $v) : now();
        } catch (\Throwable) {
            throw new ProjectException('That is not a date.');
        }
        if ($d->isAfter(now()->endOfDay())) {
            throw new ProjectException('Money is recorded on the day it moved, not ahead of it.');
        }

        return $d->format('Y-m-d');
    }

    private function needReady(): void
    {
        if (! $this->ready()) {
            throw new ProjectException('Advances and retention need database script 260. Run it first.', 409);
        }
    }
}
