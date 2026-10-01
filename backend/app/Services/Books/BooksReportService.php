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
    /** Per-ledger movement inside a period (posted vouchers only). */
    private function movement(?string $from, ?string $to, ?string $before = null): array
    {
        $q = DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id')
            ->where('v.status', Voucher::POSTED)
            ->selectRaw("e.ledger_id, SUM(CASE WHEN e.side='D' THEN e.base_amount ELSE 0 END) AS dr, SUM(CASE WHEN e.side='C' THEN e.base_amount ELSE 0 END) AS cr")
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
            ->orderBy('date')->orderBy('id')->get();

        return [
            'from' => $from, 'to' => $to,
            'rows' => $rows->map(fn ($v) => [
                'id' => $v->id, 'date' => $v->date?->toDateString(), 'voucher_number' => $v->voucher_number,
                'type' => $v->type?->name, 'base_type' => $v->type?->base_type, 'party' => $v->partyLedger?->name,
                'status' => $v->status, 'narration' => $v->narration, 'total' => (float) $v->base_total,
            ])->all(),
            'total' => round($rows->where('status', Voucher::POSTED)->sum('base_total'), 2),
        ];
    }

    /** @return array<int, object{id:int, code:string, is_base:int, conversion_rate:float}> currencies by id */
    private function currencyMap(): array
    {
        return DB::table('currencies')->get(['id', 'code', 'is_base', 'conversion_rate'])->keyBy('id')->all();
    }

    /**
     * An amount in a voucher's own currency, as the base currency of today. The books keep each voucher's base figure as it
     * was posted; when the base currency has been changed since, that figure is in the OLD base and must not be added to new-base
     * amounts, so it is restated at today's rate. A stored figure within a factor of two of today's rate is trusted as it was
     * posted (rates drift); one far from it was made under another base.
     *
     * @return array{0: float, 1: bool}  [amount in today's base, restated?]
     */
    private function inBase(float $amount, float $storedBase, $currencyId, array $cur): array
    {
        $c = $currencyId !== null ? ($cur[$currencyId] ?? null) : null;
        if (! $c || (int) $c->is_base === 1) {
            return [$amount, $c !== null && abs($amount - $storedBase) > 0.01];   // in the base currency: the amount IS the base figure
        }
        $now = $amount * (float) $c->conversion_rate;
        if ($now <= 0.0 || $storedBase <= 0.0) {
            return [$storedBase, false];
        }
        $ratio = $storedBase / $now;

        return ($ratio < 0.5 || $ratio > 2.0) ? [round($now, 2), true] : [$storedBase, false];
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
            ->orderBy('v.date')->orderBy('v.id')->orderBy('e.line_no')
            ->get(['v.id as voucher_id', 'v.date', 'v.voucher_number', 't.name as type', 'e.side', 'e.amount', 'e.base_amount', 'e.narration', 'v.narration as voucher_narration',
                'v.currency_id']);
        $open = $this->opening($ledger);
        $bal = null;
        $out = [];
        $dr = $cr = 0.0;
        $byCur = [];   // what each currency moved, in that currency (the running balance below is in the base currency)
        $restated = false;
        foreach ($rows as $r) {
            [$amt, $re] = $this->inBase((float) $r->amount, (float) $r->base_amount, $r->currency_id, $cur);
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

        return ['ledger' => ['id' => $ledger->id, 'name' => $ledger->name], 'from' => $from, 'to' => $to, 'base_currency' => $baseCode,
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

        return ['from' => $from, 'to' => $to, 'rows' => $rows, 'total_debit' => round($tDr, 2), 'total_credit' => round($tCr, 2),
            'balanced' => abs($tDr - $tCr) < 0.01];
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

        return ['from' => $from, 'to' => $to, 'sections' => $sec,
            'totals' => ['direct_income' => $sum('income_direct'), 'direct_expense' => $sum('expense_direct'), 'gross_profit' => $gross,
                'indirect_income' => $sum('income_indirect'), 'indirect_expense' => $sum('expense_indirect'), 'net_profit' => $net]];
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
        $tA = round(array_sum(array_column($assets, 'amount')), 2);
        $tL = round(array_sum(array_column($liabilities, 'amount')), 2);

        return ['as_of' => $asOf, 'assets' => $assets, 'liabilities' => $liabilities, 'total_assets' => $tA, 'total_liabilities' => $tL, 'balanced' => abs($tA - $tL) < 0.01];
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
            [$billBase] = $this->inBase((float) $b->total_amount, (float) $b->base_total, $b->currency_id, $cur);   // what the whole bill is, in today's base
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

        return ['kind' => $kind, 'as_of' => $asOf->toDateString(), 'base_currency' => $baseCode, 'rows' => $rows, 'totals' => $tot];
    }
}
