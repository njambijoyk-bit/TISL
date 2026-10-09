<?php

namespace App\Services\Books;

use App\Models\Books\LedgerGroup;
use App\Models\Books\Voucher;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The books' reports. Balances are signed: debit positive, credit negative, in the
 * base currency, from posted vouchers only.
 */
class BooksReportService
{
    /** @var int[]|null the cost centre asked for and everything beneath it, null for no filter */
    private ?array $costCentreIds = null;

    private ?int $dimLocation = null;

    /**
     * A copy of this service that only counts entries of one cost centre (and the ones under it) and/or one branch. Opening balances belong to
     * the company, not to a cost centre, so a filtered report starts from nothing and shows movement only.
     */
    public function withDimensions(?int $costCentreId, ?int $locationId): static
    {
        $c = clone $this;
        $c->costCentreIds = $costCentreId && app(\App\Services\CostCentres\CostCentreService::class)->booksReady() ? app(\App\Services\CostCentres\CostCentreService::class)->withDescendants($costCentreId) : null;
        $c->dimLocation = $locationId && app(\App\Services\CostCentres\CostCentreService::class)->booksReady() ? $locationId : null;

        return $c;
    }

    private function dimensional(): bool
    {
        return $this->costCentreIds !== null || $this->dimLocation !== null;
    }

    /** Narrow a query over voucher_entries as e to the chosen cost centre / branch. */
    private function dims($q)
    {
        if ($this->costCentreIds !== null) {
            $q->whereIn('e.cost_centre_id', $this->costCentreIds);
        }
        if ($this->dimLocation !== null) {
            $q->where('e.location_id', $this->dimLocation);
        }

        return $q;
    }

    private function branches(): \App\Services\Access\BranchFilter
    {
        return app(\App\Services\Access\BranchFilter::class);
    }

    /** True when the person is limited to some branches (mode on), so the screen can say the figures cover those only. */
    private function limited(): bool
    {
        return $this->branches()->enforcing('books');
    }

    /** Per-ledger movement inside a period (posted vouchers only). */
    private function movement(?string $from, ?string $to, ?string $before = null): array
    {
        $b = RestatedBase::entry();   // today's base: see RestatedBase
        $q = RestatedBase::join(DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id'))
            ->where('v.status', Voucher::POSTED)
            ->selectRaw("e.ledger_id, SUM(CASE WHEN e.side='D' THEN {$b} ELSE 0 END) AS dr, SUM(CASE WHEN e.side='C' THEN {$b} ELSE 0 END) AS cr")
            ->groupBy('e.ledger_id');
        if ($from) {
            $q->where('v.date', '>=', $from);
        }
        if ($to) {
            $q->where('v.date', '<=', $to);
        }
        if ($before) {
            $q->where('v.date', '<', $before);
        }
        $this->dims($q);
        $this->branches()->apply($q, 'v.location_id', 'books', 'reports');

        return $q->get()->keyBy('ledger_id')->map(fn ($r) => ['dr' => (float) $r->dr, 'cr' => (float) $r->cr])->all();
    }

    private function ledgers(): array
    {
        return DB::table('ledgers as l')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')
            ->select('l.id', 'l.name', 'l.group_id', 'l.opening_balance', 'l.opening_side', 'g.name as group_name', 'g.nature', 'g.affects_gross_profit', 'g.parent_id')
            ->orderBy('g.name')->orderBy('l.name')->get()->all();
    }

    private function opening($l): float
    {
        if ($this->dimensional()) {
            return 0.0;
        }
        $o = (float) $l->opening_balance;

        return $l->opening_side === 'C' ? -$o : $o;
    }

    /** Nature of a group's primary ancestor is stored on every group, so `nature` is enough. */

    public function dayBook(?string $from, ?string $to, ?int $typeId = null, ?int $locationId = null): array
    {
        $rows = Voucher::query()->with(['type:id,code,name,base_type', 'partyLedger:id,name'])
            ->when($from, fn ($q) => $q->where('date', '>=', $from))
            ->when($to, fn ($q) => $q->where('date', '<=', $to))
            ->when($typeId, fn ($q) => $q->where('voucher_type_id', $typeId))
            ->when($locationId, fn ($q) => $q->where('location_id', $locationId))
            ->when($this->costCentreIds !== null, fn ($q) => $q->whereIn('cost_centre_id', $this->costCentreIds))
            ->whereHas('type', fn ($t) => $t->where('base_type', '!=', \App\Models\Books\VoucherType::MEMORANDUM))   // a memorandum is a note, not a transaction
            ->orderBy('date')->orderBy('id');
        $this->branches()->apply($rows, 'location_id', 'books', 'day_book');
        $rows = $rows->get();

        $cur = \App\Models\Currency::all()->keyBy('id')->all();
        $base = fn ($v) => RestatedBase::amount((float) $v->total_amount, (float) $v->base_total, $v->currency_id, $cur, (float) $v->total_amount, (float) $v->base_total)[0];

        return [
            'from' => $from, 'to' => $to, 'branch_limited' => $this->limited(),
            'rows' => $rows->map(fn ($v) => [
                'id' => $v->id, 'date' => $v->date?->toDateString(), 'voucher_number' => $v->voucher_number,
                'type' => $v->type?->name, 'base_type' => $v->type?->base_type, 'party' => $v->partyLedger?->name,
                'status' => $v->status, 'narration' => $v->narration, 'total' => round($base($v), 2),
            ])->all(),
            'total' => round($rows->where('status', Voucher::POSTED)->sum(fn ($v) => $base($v)), 2),
        ];
    }

    /** @return array<int, object{id:int, code:string, is_base:int, conversion_rate:float}> currencies by id */
    private function currencyMap(): array
    {
        return DB::table('currencies')->get(['id', 'code', 'is_base', 'conversion_rate'])->keyBy('id')->all();
    }

    public function ledgerStatement(int $ledgerId, ?string $from, ?string $to): array
    {
        $ledger = DB::table('ledgers')->where('id', $ledgerId)->first();
        abort_unless($ledger, 404, 'Ledger not found.');
        $cur = $this->currencyMap();
        $baseCode = (string) (collect($cur)->firstWhere('is_base', 1)->code ?? '');
        $rows = DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id')
            ->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->where('e.ledger_id', $ledgerId)->where('v.status', Voucher::POSTED)
            ->when($to, fn ($q) => $q->where('v.date', '<=', $to))
            ->when(true, fn ($q) => $this->dims($q))
            ->when(true, fn ($q) => $this->branches()->apply($q, 'v.location_id', 'books', 'ledger'))
            ->orderBy('v.date')->orderBy('v.id')->orderBy('e.line_no')
            ->get(['v.id as voucher_id', 'v.date', 'v.voucher_number', 't.name as type', 'e.side', 'e.amount', 'e.base_amount', 'e.narration', 'v.narration as voucher_narration',
                'v.currency_id', 'v.total_amount as v_total', 'v.base_total as v_base']);
        $open = $this->opening($ledger);
        $bal = null;
        $out = [];
        $dr = $cr = 0.0;
        $byCur = [];   // what each currency moved, in that currency (the running balance below is in the base currency)
        $restated = false;
        foreach ($rows as $r) {
            [$amt, $re] = RestatedBase::amount((float) $r->amount, (float) $r->base_amount, $r->currency_id, $cur, (float) $r->v_total, (float) $r->v_base);
            $sign = $r->side === 'D' ? 1 : -1;
            if ($from && $r->date < $from) {   // before the period: only moves the opening balance
                $open += $sign * $amt;
                continue;
            }
            $bal ??= $open;
            $bal += $sign * $amt;
            $r->side === 'D' ? ($dr += $amt) : ($cr += $amt);
            $c = $r->currency_id !== null ? ($cur[$r->currency_id] ?? null) : null;
            $code = $c->code ?? $baseCode;
            $foreign = $c && (int) $c->is_base !== 1;
            $fc = (float) $r->amount;
            $byCur[$code] ??= ['currency' => $code, 'debit' => 0.0, 'credit' => 0.0, 'net' => 0.0];
            $byCur[$code][$r->side === 'D' ? 'debit' : 'credit'] += $fc;
            $byCur[$code]['net'] += $sign * $fc;
            $restated = $restated || $re;
            $out[] = ['voucher_id' => $r->voucher_id, 'date' => $r->date, 'voucher_number' => $r->voucher_number, 'type' => $r->type,
                'currency' => $code, 'foreign' => $foreign, 'amount_fc' => round($fc, 2), 'rate' => $fc > 0 ? round($amt / $fc, 6) : 1.0, 'restated' => $re,
                'in_currency' => $foreign ? $code . ' ' . number_format($fc, 2) . ($r->side === 'D' ? ' Dr' : ' Cr') : '',
                'debit' => $r->side === 'D' ? $amt : 0, 'credit' => $r->side === 'C' ? $amt : 0, 'balance' => round($bal, 2),
                'narration' => $r->narration ?: $r->voucher_narration];
        }
        $bal ??= $open;
        $byCur = array_map(fn ($x) => array_map(fn ($v) => is_float($v) ? round($v, 2) : $v, $x), array_values($byCur));

        return ['ledger' => ['id' => $ledger->id, 'name' => $ledger->name], 'from' => $from, 'to' => $to, 'base_currency' => $baseCode, 'branch_limited' => $this->limited(),
            'opening' => round($open, 2), 'debit' => round($dr, 2), 'credit' => round($cr, 2), 'closing' => round($bal, 2), 'rows' => $out,
            'by_currency' => $byCur, 'has_foreign' => (bool) collect($out)->firstWhere('foreign', true), 'restated' => $restated];
    }

    public function trialBalance(?string $from, ?string $to): array
    {
        $prior = $from ? $this->movement(null, null, $from) : [];
        $mv = $this->movement($from, $to);
        $rows = [];
        $tDr = $tCr = 0.0;
        foreach ($this->ledgers() as $l) {
            $open = $this->opening($l) + (($prior[$l->id]['dr'] ?? 0) - ($prior[$l->id]['cr'] ?? 0));
            $dr = $mv[$l->id]['dr'] ?? 0;
            $cr = $mv[$l->id]['cr'] ?? 0;
            $close = $open + $dr - $cr;
            if (abs($open) < 0.005 && $dr < 0.005 && $cr < 0.005) {
                continue;
            }
            $rows[] = ['ledger_id' => $l->id, 'ledger' => $l->name, 'group' => $l->group_name, 'nature' => $l->nature,
                'opening' => round($open, 2), 'debit' => round($dr, 2), 'credit' => round($cr, 2), 'closing' => round($close, 2)];
            $tDr += $close > 0 ? $close : 0;
            $tCr += $close < 0 ? -$close : 0;
        }

        // every opening balance needs an opposite one; if they do not net to nothing the trial balance can never balance, whatever is posted
        $openings = [];
        $openNet = 0.0;
        foreach ($this->ledgers() as $l) {
            $o = $this->opening($l);
            if (abs($o) >= 0.005) {
                $openNet += $o;
                $openings[] = ['ledger_id' => (int) $l->id, 'ledger' => $l->name, 'group' => $l->group_name, 'amount' => round(abs($o), 2), 'side' => $o > 0 ? 'Dr' : 'Cr'];
            }
        }

        // like Tally's "Difference in opening balances": a placeholder, not a ledger, that carries what the opening balances are out by
        $diff = abs($openNet) < 0.01 ? 0.0 : round($openNet, 2);
        if ($diff != 0.0 && ! $this->dimensional()) {
            $rows[] = ['ledger_id' => null, 'ledger' => 'Difference in opening balances', 'group' => '', 'nature' => null, 'placeholder' => true,
                'opening' => -$diff, 'debit' => 0, 'credit' => 0, 'closing' => -$diff];
            $tDr += $diff < 0 ? -$diff : 0;
            $tCr += $diff > 0 ? $diff : 0;
        }

        return ['from' => $from, 'to' => $to, 'branch_limited' => $this->limited(), 'rows' => $rows, 'total_debit' => round($tDr, 2), 'total_credit' => round($tCr, 2),
            'balanced' => abs($tDr - $tCr) < 0.01, 'restated_vouchers' => RestatedBase::restatedCount(),
            'opening_difference' => $diff, 'opening_balances' => abs($openNet) < 0.01 ? [] : $openings, 'filtered' => $this->dimensional()];
    }

    /** Income & expense ledgers for a period, split into trading (gross profit) and the rest. */
    public function profitLoss(?string $from, ?string $to): array
    {
        $mv = $this->movement($from, $to);
        $sec = ['income_direct' => [], 'expense_direct' => [], 'income_indirect' => [], 'expense_indirect' => []];
        foreach ($this->ledgers() as $l) {
            if (! in_array($l->nature, ['income', 'expense'], true)) {
                continue;
            }
            $net = ($mv[$l->id]['dr'] ?? 0) - ($mv[$l->id]['cr'] ?? 0);
            if (abs($net) < 0.005) {
                continue;
            }
            $amount = $l->nature === 'income' ? -$net : $net;   // natural side positive
            $key = $l->nature . '_' . ($l->affects_gross_profit ? 'direct' : 'indirect');
            $sec[$key][] = ['ledger_id' => $l->id, 'ledger' => $l->name, 'group' => $l->group_name, 'amount' => round($amount, 2)];
        }
        $sum = fn ($k) => round(array_sum(array_column($sec[$k], 'amount')), 2);
        $gross = round($sum('income_direct') - $sum('expense_direct'), 2);
        $net = round($gross + $sum('income_indirect') - $sum('expense_indirect'), 2);

        return ['from' => $from, 'to' => $to, 'branch_limited' => $this->limited(), 'restated_vouchers' => RestatedBase::restatedCount(), 'sections' => $sec,
            'totals' => ['direct_income' => $sum('income_direct'), 'direct_expense' => $sum('expense_direct'), 'gross_profit' => $gross,
                'indirect_income' => $sum('income_indirect'), 'indirect_expense' => $sum('expense_indirect'), 'net_profit' => $net]];
    }

    /**
     * Profit and loss by cost centre: what each earned and spent on its own, and in total with everything beneath it (a branch's total adds up
     * its utilities, stock, payroll and departments). Entries with no cost centre (before script 102) are not counted.
     */
    public function profitLossByCostCentre(?string $from, ?string $to): array
    {
        $svc = app(\App\Services\CostCentres\CostCentreService::class);
        if (! $svc->booksReady()) {
            return ['ready' => false, 'rows' => [], 'totals' => ['income' => 0, 'expense' => 0, 'profit' => 0]];
        }
        $b = RestatedBase::entry();
        $q = RestatedBase::join(DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id'))
            ->join('ledgers as l', 'l.id', '=', 'e.ledger_id')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')
            ->where('v.status', Voucher::POSTED)->whereIn('g.nature', ['income', 'expense'])->whereNotNull('e.cost_centre_id')
            ->selectRaw("e.cost_centre_id, g.nature, SUM(CASE WHEN e.side='D' THEN {$b} ELSE 0 END) AS dr, SUM(CASE WHEN e.side='C' THEN {$b} ELSE 0 END) AS cr")
            ->groupBy('e.cost_centre_id', 'g.nature');
        if ($from) {
            $q->where('v.date', '>=', $from);
        }
        if ($to) {
            $q->where('v.date', '<=', $to);
        }
        if ($this->dimLocation !== null) {
            $q->where('e.location_id', $this->dimLocation);
        }
        $this->branches()->apply($q, 'v.location_id', 'books', 'reports');
        $own = [];
        foreach ($q->get() as $r) {
            $o = &$own[(int) $r->cost_centre_id];
            $o ??= ['income' => 0.0, 'expense' => 0.0];
            if ($r->nature === 'income') {
                $o['income'] += (float) $r->cr - (float) $r->dr;
            } else {
                $o['expense'] += (float) $r->dr - (float) $r->cr;
            }
            unset($o);
        }

        $tree = $svc->tree();
        $children = [];
        foreach ($tree as $r) {
            $children[$r['parent_id'] ?? 0][] = $r['id'];
        }
        $total = [];
        $sum = function ($id) use (&$sum, &$total, $own, $children) {
            $t = ($own[$id] ?? ['income' => 0.0, 'expense' => 0.0]);
            foreach ($children[$id] ?? [] as $c) {
                $ct = $sum($c);
                $t['income'] += $ct['income'];
                $t['expense'] += $ct['expense'];
            }

            return $total[$id] = $t;
        };
        foreach ($children[0] ?? [] as $root) {
            $sum($root);
        }

        $rows = [];
        foreach ($tree as $r) {
            $t = $total[$r['id']] ?? ['income' => 0.0, 'expense' => 0.0];
            if (abs($t['income']) < 0.005 && abs($t['expense']) < 0.005) {
                continue;
            }
            $o = $own[$r['id']] ?? ['income' => 0.0, 'expense' => 0.0];
            $rows[] = ['cost_centre_id' => $r['id'], 'name' => $r['name'], 'code' => $r['code'], 'purpose' => $r['purpose'], 'depth' => $r['depth'], 'path' => $r['path'],
                'own_income' => round($o['income'], 2), 'own_expense' => round($o['expense'], 2), 'own_profit' => round($o['income'] - $o['expense'], 2),
                'income' => round($t['income'], 2), 'expense' => round($t['expense'], 2), 'profit' => round($t['income'] - $t['expense'], 2)];
        }
        $inc = round(array_sum(array_column($own, 'income')), 2);
        $exp = round(array_sum(array_column($own, 'expense')), 2);

        return ['ready' => true, 'from' => $from, 'to' => $to, 'branch_limited' => $this->limited(), 'restated_vouchers' => RestatedBase::restatedCount(), 'rows' => $rows,
            'totals' => ['income' => $inc, 'expense' => $exp, 'profit' => round($inc - $exp, 2)]];
    }

    public function balanceSheet(?string $asOf): array
    {
        $mv = $this->movement(null, $asOf);
        $assets = $liabilities = [];
        $plNet = 0.0;   // credit-positive profit of income/expense ledgers to date
        foreach ($this->ledgers() as $l) {
            $bal = $this->opening($l) + ($mv[$l->id]['dr'] ?? 0) - ($mv[$l->id]['cr'] ?? 0);
            if (in_array($l->nature, ['income', 'expense'], true)) {
                $plNet -= $bal;
                continue;
            }
            if (abs($bal) < 0.005) {
                continue;
            }
            $row = ['ledger_id' => $l->id, 'ledger' => $l->name, 'group' => $l->group_name];
            if ($l->nature === 'asset') {
                $assets[] = $row + ['amount' => round($bal, 2)];
            } else {
                $liabilities[] = $row + ['amount' => round(-$bal, 2)];
            }
        }
        if (abs($plNet) >= 0.005) {
            $liabilities[] = ['ledger_id' => null, 'ledger' => $plNet >= 0 ? 'Profit & Loss (to date)' : 'Loss (to date)', 'group' => 'Capital', 'amount' => round($plNet, 2)];
        }
        // Tally's "Difference in opening balances": a placeholder on the lighter side so the sheet carries what the openings are out by
        $openNet = 0.0;
        foreach ($this->ledgers() as $l) {
            $openNet += $this->opening($l);
        }
        $diff = abs($openNet) < 0.01 ? 0.0 : round($openNet, 2);
        if ($diff > 0) {
            $liabilities[] = ['ledger_id' => null, 'ledger' => 'Difference in opening balances', 'group' => '', 'placeholder' => true, 'amount' => $diff];
        } elseif ($diff < 0) {
            $assets[] = ['ledger_id' => null, 'ledger' => 'Difference in opening balances', 'group' => '', 'placeholder' => true, 'amount' => -$diff];
        }
        $tA = round(array_sum(array_column($assets, 'amount')), 2);
        $tL = round(array_sum(array_column($liabilities, 'amount')), 2);

        return ['as_of' => $asOf, 'branch_limited' => $this->limited(), 'opening_difference' => $diff, 'restated_vouchers' => RestatedBase::restatedCount(), 'assets' => $assets, 'liabilities' => $liabilities, 'total_assets' => $tA, 'total_liabilities' => $tL, 'balanced' => abs($tA - $tL) < 0.01];
    }

    /** Open bills per party, bucketed by days past due. kind: receivables | payables. */
    public function ageing(string $kind, ?string $asOf = null, ?int $ledgerId = null): array
    {
        $asOf = Carbon::parse($asOf ?? today());
        $bases = $kind === 'payables' ? ['purchase', 'credit_note'] : ['sales', 'debit_note', 'journal'];   // a journal only opens a bill for a bounced-cheque fee
        $bills = DB::table('voucher_bill_refs as b')->join('vouchers as v', 'v.id', '=', 'b.voucher_id')
            ->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->join('ledgers as l', 'l.id', '=', 'b.ledger_id')
            ->where('b.ref_type', 'new')->where('v.status', Voucher::POSTED)->whereIn('t.base_type', $bases)
            ->where('v.date', '<=', $asOf->toDateString())
            ->when($ledgerId, fn ($q) => $q->where('b.ledger_id', $ledgerId))
            ->when(true, fn ($q) => $this->branches()->apply($q, 'v.location_id', 'books', 'ageing'))   // the payments that settle them are counted wherever they were taken
            ->get(['b.voucher_id', 'b.ledger_id', 'l.name as party', 'v.voucher_number', 'v.date', 'b.due_date', 'b.amount', 'v.total_amount', 'v.base_total', 'v.currency_id']);
        $cur = $this->currencyMap();
        $baseCode = (string) (collect($cur)->firstWhere('is_base', 1)->code ?? '');
        $paid = DB::table('voucher_bill_refs as b')->join('vouchers as v', 'v.id', '=', 'b.voucher_id')
            ->where('b.ref_type', 'against')->where('v.status', Voucher::POSTED)->where('v.date', '<=', $asOf->toDateString())
            ->groupBy('b.against_voucher_id')->selectRaw('b.against_voucher_id as id, SUM(b.amount) as paid')->pluck('paid', 'id');

        $parties = [];
        foreach ($bills as $b) {
            $openFc = round((float) $b->amount - (float) ($paid[$b->voucher_id] ?? 0), 2);   // in the bill's own currency
            if ($openFc <= 0.005) {
                continue;
            }
            // every bucket is in the base currency (at the rate on the bill) so bills in different currencies add up; the bill keeps its own figure too
            $c = $b->currency_id !== null ? ($cur[$b->currency_id] ?? null) : null;
            $code = $c->code ?? $baseCode;
            [$billBase] = RestatedBase::amount((float) $b->total_amount, (float) $b->base_total, $b->currency_id, $cur, (float) $b->total_amount, (float) $b->base_total);   // what the whole bill is, in today's base
            $open = (float) $b->total_amount > 0 ? round($openFc * $billBase / (float) $b->total_amount, 2) : $openFc;
            $due = Carbon::parse($b->due_date ?? $b->date);
            $late = max(0, $due->diffInDays($asOf, false));
            $bucket = $late === 0 ? 'current' : ($late <= 30 ? 'd1_30' : ($late <= 60 ? 'd31_60' : ($late <= 90 ? 'd61_90' : 'd90_plus')));
            $p = &$parties[$b->ledger_id];
            $p ??= ['ledger_id' => $b->ledger_id, 'party' => $b->party, 'current' => 0, 'd1_30' => 0, 'd31_60' => 0, 'd61_90' => 0, 'd90_plus' => 0, 'total' => 0, 'bills' => [], 'by_currency' => []];
            $p[$bucket] = round($p[$bucket] + $open, 2);
            $p['total'] = round($p['total'] + $open, 2);
            $p['by_currency'][$code] = round(($p['by_currency'][$code] ?? 0) + $openFc, 2);
            $p['bills'][] = ['voucher_id' => $b->voucher_id, 'voucher_number' => $b->voucher_number, 'date' => $b->date, 'due_date' => $due->toDateString(), 'open' => $open,
                'currency' => $code, 'open_fc' => $openFc, 'foreign' => $code !== $baseCode, 'days_late' => $late];
            unset($p);
        }
        $rows = array_values($parties);
        usort($rows, fn ($a, $b) => $b['total'] <=> $a['total']);
        $tot = ['current' => 0, 'd1_30' => 0, 'd31_60' => 0, 'd61_90' => 0, 'd90_plus' => 0, 'total' => 0];
        foreach ($rows as $r) {
            foreach ($tot as $k => $_) {
                $tot[$k] = round($tot[$k] + $r[$k], 2);
            }
        }

        foreach ($rows as &$row) {
            $row['currencies'] = implode('; ', array_map(fn ($c, $v) => $c . ' ' . number_format($v, 2), array_keys($row['by_currency']), $row['by_currency']));
            $row['has_foreign'] = (bool) array_diff(array_keys($row['by_currency']), [$baseCode]);
        }
        unset($row);

        return ['kind' => $kind, 'as_of' => $asOf->toDateString(), 'base_currency' => $baseCode, 'branch_limited' => $this->limited(), 'rows' => $rows, 'totals' => $tot];
    }
}
