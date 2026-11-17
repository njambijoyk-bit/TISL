<?php

namespace App\Services\Projects;

use App\Models\Books\Ledger;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Money held for clients (docs/PROJECTS_STAGE4_SPEC.md, builds 4.4 and 4.5). It is never the firm's own.
 *
 * An account is a Books bank ledger (where the money sits) with a Books liability ledger (which says it is owed to the clients). It is pooled
 * (many balances, one per client or group of clients) or dedicated (one balance). A balance belongs to one client or to several jointly,
 * and can be for one piece of work. What a balance holds is never stored: it is worked out from posted Books lines tagged with it.
 *
 * Receiving puts a journal into the books: debit the bank ledger, credit the liability ledger, both lines tagged with the balance.
 */
class ProjectHeldMoney
{
    public const KINDS = ['pooled' => 'Pooled: a balance per client inside one account', 'dedicated' => 'Dedicated: this account holds one balance'];

    public function ready(): bool
    {
        return ProjectsSetup::money() && Schema::hasTable('ledgers') && \App\Models\Books\VoucherEntry::holdsClientMoney();
    }

    /** Every account with its balances, for the client money page. @return array<int, array<string, mixed>> */
    public function accounts(User $user): array
    {
        if (! $this->ready()) {
            return [];
        }
        $accounts = DB::table('project_client_accounts as a')->leftJoin('ledgers as b', 'b.id', '=', 'a.ledger_id')->leftJoin('ledgers as l', 'l.id', '=', 'a.liability_ledger_id')
            ->orderBy('a.name')->get(['a.*', 'b.name as bank_name', 'l.name as liability_name']);
        $holdings = DB::table('project_client_holdings')->whereIn('account_id', $accounts->pluck('id'))->orderBy('label')->get();
        $held = $this->balances($holdings);
        $owners = $this->owners($holdings->pluck('id')->all());
        $projects = $this->projectsFor($holdings, $user);

        return $accounts->map(fn ($a) => ['id' => (int) $a->id, 'name' => $a->name, 'kind' => $a->kind, 'guard_on' => (bool) $a->guard_on, 'is_active' => (bool) $a->is_active,
            'bank_ledger' => ['id' => (int) $a->ledger_id, 'name' => $a->bank_name], 'liability_ledger' => $a->liability_ledger_id ? ['id' => (int) $a->liability_ledger_id, 'name' => $a->liability_name] : null,
            'held' => round(array_sum(array_map(fn ($h) => $held[(int) $h->id] ?? 0.0, $holdings->where('account_id', $a->id)->all())), 2),
            'balances' => $holdings->where('account_id', $a->id)->map(fn ($h) => $this->shapeHolding($h, $held, $owners, $projects))->values()->all()])->all();
    }

    /** The balances held for one piece of work, and their total. @return array{total: float, balances: array<int, array<string, mixed>>} */
    public function forProject(object $project, User $user): array
    {
        if (! $this->ready()) {
            return ['total' => 0.0, 'balances' => []];
        }
        $holdings = DB::table('project_client_holdings')->where('project_id', $project->id)->orderBy('label')->get();
        $held = $this->balances($holdings);
        $owners = $this->owners($holdings->pluck('id')->all());
        $projects = $this->projectsFor($holdings, $user);
        $accounts = DB::table('project_client_accounts')->whereIn('id', $holdings->pluck('account_id'))->pluck('name', 'id');

        return ['total' => round(array_sum($held), 2), 'balances' => $holdings->map(fn ($h) => $this->shapeHolding($h, $held, $owners, $projects) + ['account' => $accounts[$h->account_id] ?? null])->values()->all()];
    }

    /**
     * Open an account. Its bank ledger is one Books already has (under Bank Accounts, not used by another account) or a new one; its liability
     * ledger is one Books already has (of liability nature) or a new one under the chosen liability group.
     *
     * @param array<string, mixed> $d name, kind, bank_ledger_id | new_bank (name, group_id, bank_name, account_number, branch), liability_ledger_id | liability_group_id
     */
    public function openAccount(array $d, User $by): int
    {
        $this->needReady();
        $name = trim(preg_replace('/\s+/', ' ', (string) ($d['name'] ?? '')));
        if ($name === '') {
            throw new ProjectException('Give the account a name.');
        }
        $kind = (string) ($d['kind'] ?? 'pooled');
        if (! isset(self::KINDS[$kind])) {
            throw new ProjectException('Choose pooled or dedicated.');
        }
        $groups = app(ProjectLedgers::class)->groups();

        return DB::transaction(function () use ($d, $by, $name, $kind, $groups) {
            if (! empty($d['bank_ledger_id'])) {
                $bank = (int) $d['bank_ledger_id'];
                $l = DB::table('ledgers')->where('id', $bank)->first();
                if (! $l || ! in_array((int) $l->group_id, array_column($groups['bank'], 'id'), true)) {
                    throw new ProjectException('Choose a bank ledger from the books.');
                }
                if (DB::table('project_client_accounts')->where('ledger_id', $bank)->exists()) {
                    throw new ProjectException('That bank ledger is already a client money account.');
                }
            } else {
                if (! $by->hasPermission('projects.ledgers.bank')) {
                    throw new ProjectException('Making a bank ledger needs its own permission. Choose one the books already have.', 403);
                }
                $nb = (array) ($d['new_bank'] ?? []);
                $bank = $this->newLedger((string) ($nb['name'] ?? $name), (int) ($nb['group_id'] ?? 0), array_column($groups['bank'], 'id'), 'Choose a bank group from the books.',
                    array_intersect_key($nb, array_flip(['bank_name', 'account_number', 'branch', 'account_name'])), "Client money account opened in Projects.");
            }
            if (! empty($d['liability_ledger_id'])) {
                $liability = (int) $d['liability_ledger_id'];
                $nature = DB::table('ledgers as l')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')->where('l.id', $liability)->value('g.nature');
                if ($nature !== 'liability') {
                    throw new ProjectException('The money is owed to the clients: choose a liability ledger.');
                }
            } else {
                $liabilityGroups = array_column(array_filter($groups['general'], fn ($g) => $g['nature'] === 'liability'), 'id');
                $liability = $this->newLedger("Client money: {$name}", (int) ($d['liability_group_id'] ?? 0), $liabilityGroups, 'Choose a liability group for what is owed to the clients.', [], 'What is owed to clients for the money in this account. Opened in Projects.');
            }
            $id = DB::table('project_client_accounts')->insertGetId(['ledger_id' => $bank, 'liability_ledger_id' => $liability, 'name' => mb_substr($name, 0, 120), 'kind' => $kind, 'guard_on' => 0, 'is_active' => 1,
                'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
            ProjectLog::record(null, $by, 'client_money.account_opened', 'client_account', $id, null, ['name' => $name, 'kind' => $kind]);

            return $id;
        });
    }

    /** A balance inside an account, for one client or several jointly, optionally for one piece of work. @param array<string, mixed> $d owners (customer ids), label, project_id */
    public function openBalance(int $accountId, array $d, User $by): int
    {
        $this->needReady();
        $a = DB::table('project_client_accounts')->where('id', $accountId)->where('is_active', 1)->first();
        if (! $a) {
            throw new ProjectException('Not found.', 404);
        }
        if ($a->kind === 'dedicated' && DB::table('project_client_holdings')->where('account_id', $a->id)->where('is_closed', 0)->exists()) {
            throw new ProjectException('A dedicated account holds one balance, and this one already has it.');
        }
        $owners = array_values(array_unique(array_map('intval', (array) ($d['owners'] ?? []))));
        $names = DB::table('customers')->whereIn('id', $owners)->whereNull('deleted_at')->get(['id', 'company_name', 'first_name', 'last_name'])->keyBy('id');
        if (! $owners || $names->count() !== count($owners)) {
            throw new ProjectException('Choose the client, or clients, the money belongs to.');
        }
        $projectId = ($d['project_id'] ?? null) ? (int) $d['project_id'] : null;
        if ($projectId) {
            $p = DB::table('projects')->where('id', $projectId)->whereNull('deleted_at')->first();
            if (! $p || ! app(ProjectAccess::class)->base($by, 'open', $p)['allowed']) {
                throw new ProjectException('Choose a piece of work you can open.');
            }
        }
        $label = trim((string) ($d['label'] ?? '')) ?: implode(' and ', array_map(fn ($id) => ProjectService::customerName($names[$id]), $owners));

        return DB::transaction(function () use ($a, $owners, $projectId, $label, $by) {
            $id = DB::table('project_client_holdings')->insertGetId(['account_id' => $a->id, 'project_id' => $projectId, 'label' => mb_substr($label, 0, 160), 'is_closed' => 0, 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
            foreach ($owners as $o) {
                DB::table('project_client_holding_owners')->insert(['holding_id' => $id, 'customer_id' => $o]);
            }
            ProjectLog::record($projectId, $by, 'client_money.balance_opened', 'client_holding', $id, null, ['for' => $label, 'joint' => count($owners) > 1]);

            return $id;
        });
    }

    /** Money received into a balance: a journal in the books, debit the bank ledger and credit the liability ledger, both tagged. @param array<string, mixed> $d amount, date, from, reference */
    public function receive(int $holdingId, array $d, User $by): int
    {
        [$h, $a] = $this->holding($holdingId);
        if ($h->is_closed) {
            throw new ProjectException('This balance is closed.');
        }
        $amount = round((float) ($d['amount'] ?? 0), 2);
        if ($amount <= 0) {
            throw new ProjectException('Enter the amount received.');
        }
        $from = trim((string) ($d['from'] ?? ''));
        if ($from === '') {
            throw new ProjectException('Say who the money came from.');
        }
        $date = $this->date($d['date'] ?? null);
        $cc = $h->project_id ? DB::table('projects')->where('id', $h->project_id)->value('cost_centre_id') : null;
        $line = fn (int $ledger, string $side) => array_filter(['ledger_id' => $ledger, 'side' => $side, 'amount' => $amount, 'project_holding_id' => (int) $h->id, 'cost_centre_id' => $cc ? (int) $cc : null], fn ($v) => $v !== null);
        $voucher = app(ProjectVoucherPoster::class)->journal($date, "Client money received for {$h->label} from {$from}", ($r = trim((string) ($d['reference'] ?? ''))) === '' ? null : mb_substr($r, 0, 60),
            [$line((int) $a->ledger_id, 'D'), $line((int) $a->liability_ledger_id, 'C')], $by);
        ProjectLog::record($h->project_id ? (int) $h->project_id : null, $by, 'client_money.received', 'client_holding', (int) $h->id, null, ['for' => $h->label, 'from' => $from, 'voucher_id' => $voucher]);

        return $voucher;
    }

    /** What each balance holds now, from posted Books lines on its account's bank ledger: debits less credits. @return array<int, float> */
    public function balances(Collection $holdings): array
    {
        if ($holdings->isEmpty() || ! $this->ready()) {
            return [];
        }
        $banks = DB::table('project_client_accounts')->whereIn('id', $holdings->pluck('account_id'))->pluck('ledger_id', 'id');
        $out = array_fill_keys($holdings->pluck('id')->map(fn ($v) => (int) $v)->all(), 0.0);
        $rows = DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id')->where('v.status', 'posted')->whereIn('e.project_holding_id', array_keys($out))
            ->whereIn('e.ledger_id', $banks->values())->groupBy('e.project_holding_id')
            ->selectRaw("e.project_holding_id as h, SUM(CASE WHEN e.side = 'D' THEN e.amount ELSE -e.amount END) as n")->pluck('n', 'h');
        foreach ($rows as $h => $n) {
            $out[(int) $h] = round((float) $n, 2);
        }

        return $out;
    }

    /** @return array{0: object, 1: object} the balance and its account */
    public function holding(int $id): array
    {
        $this->needReady();
        $h = DB::table('project_client_holdings')->where('id', $id)->first();
        $a = $h ? DB::table('project_client_accounts')->where('id', $h->account_id)->first() : null;
        if (! $h || ! $a) {
            throw new ProjectException('Not found.', 404);
        }
        if (! $a->liability_ledger_id) {
            throw new ProjectException('This account has no liability ledger yet. Give it one before money moves.');
        }

        return [$h, $a];
    }

    /** What the account page and the forms offer. @return array<string, mixed> */
    public function options(): array
    {
        $groups = app(ProjectLedgers::class)->groups();
        $bankGroupIds = array_column($groups['bank'], 'id');
        $used = DB::table('project_client_accounts')->pluck('ledger_id')->all();

        return [
            'kinds' => self::KINDS,
            'bank_ledgers' => $bankGroupIds ? DB::table('ledgers')->whereIn('group_id', $bankGroupIds)->whereNotIn('id', $used)->where('is_active', 1)->orderBy('name')->get(['id', 'name'])->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->name])->all() : [],
            'bank_groups' => $groups['bank'],
            'liability_ledgers' => DB::table('ledgers as l')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')->where('g.nature', 'liability')->where('l.is_active', 1)->orderBy('l.name')->get(['l.id', 'l.name'])->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->name])->all(),
            'liability_groups' => array_values(array_filter($groups['general'], fn ($g) => $g['nature'] === 'liability')),
        ];
    }

    // ------------------------------------------------------------------ inside

    /** @param array<int, int> $allowed @param array<string, mixed> $extra */
    private function newLedger(string $name, int $groupId, array $allowed, string $badGroup, array $extra, string $notes): int
    {
        $name = trim(preg_replace('/\s+/', ' ', $name));
        if (! in_array($groupId, $allowed, true)) {
            throw new ProjectException($badGroup);
        }
        if ($name === '' || DB::table('ledgers')->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->exists()) {
            throw new ProjectException("The books already have a ledger called \"{$name}\". Choose it instead, or another name.");
        }
        $values = ['name' => mb_substr($name, 0, 160), 'group_id' => $groupId, 'opening_balance' => 0, 'opening_side' => 'D', 'is_active' => true, 'notes' => $notes];
        foreach ($extra as $k => $v) {
            if (trim((string) $v) !== '') {
                $values[$k] = mb_substr(trim((string) $v), 0, 120);
            }
        }
        if (\App\Services\Books\StatementLines::available()) {
            $values['statement_id'] = app(\App\Services\Books\StatementLines::class)->forNewLedger(null, $groupId, null);
        }

        return (int) Ledger::create($values)->id;
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

    /** @param int[] $ids @return array<int, array<int, array{id: int, name: string}>> */
    private function owners(array $ids): array
    {
        if (! $ids) {
            return [];
        }

        return DB::table('project_client_holding_owners as o')->join('customers as c', 'c.id', '=', 'o.customer_id')->whereIn('o.holding_id', $ids)->get(['o.holding_id', 'c.id', 'c.company_name', 'c.first_name', 'c.last_name'])
            ->groupBy('holding_id')->map(fn ($g) => $g->map(fn ($c) => ['id' => (int) $c->id, 'name' => ProjectService::customerName($c)])->values()->all())->all();
    }

    /** The work each balance is for, as this person may see it. @return array<int, array{id: int, number: string}|null> project id => what to show */
    private function projectsFor(Collection $holdings, User $user): array
    {
        $ids = $holdings->pluck('project_id')->filter()->unique()->all();
        $out = [];
        foreach (DB::table('projects')->whereIn('id', $ids)->get() as $p) {
            $out[(int) $p->id] = app(ProjectAccess::class)->base($user, 'open', $p)['allowed'] ? ['id' => (int) $p->id, 'number' => $p->number] : ['id' => null, 'number' => 'Confidential work'];
        }

        return $out;
    }

    /** @return array<string, mixed> */
    private function shapeHolding(object $h, array $held, array $owners, array $projects): array
    {
        return ['id' => (int) $h->id, 'label' => $h->label, 'held' => $held[(int) $h->id] ?? 0.0, 'owners' => $owners[(int) $h->id] ?? [], 'joint' => count($owners[(int) $h->id] ?? []) > 1,
            'project' => $h->project_id ? ($projects[(int) $h->project_id] ?? null) : null, 'is_closed' => (bool) $h->is_closed];
    }

    private function needReady(): void
    {
        if (! $this->ready()) {
            throw new ProjectException('Client money needs database script 260. Run it first.', 409);
        }
    }
}
