<?php

namespace App\Services\Books;

use App\Models\Books\AccountingSetting;
use App\Models\Books\GiftVoucher;
use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Books\Voucher;
use App\Models\Customer;
use App\Models\TaxRate;
use App\Models\TaxType;
use App\Services\CurrencyConversionService;
use Illuminate\Support\Facades\DB;

/**
 * Tax returns, the withholding certificate register and the reconciliations that prove the books
 * agree with the sub-registers (gift vouchers, points, withholding credits, receivables, payables).
 * Balances are signed debit-positive in the base currency, from posted vouchers only.
 */
class ComplianceReportService
{
    public function __construct(private LedgerService $ledgers, private CurrencyConversionService $money) {}

    /** Debit / credit movement of some ledgers inside a period. */
    private function movement(array $ledgerIds, ?string $from, ?string $to): array
    {
        if (! $ledgerIds) {
            return [];
        }
        $q = DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id')
            ->where('v.status', Voucher::POSTED)->whereIn('e.ledger_id', $ledgerIds)
            ->selectRaw("e.ledger_id, SUM(CASE WHEN e.side='D' THEN e.base_amount ELSE 0 END) AS dr, SUM(CASE WHEN e.side='C' THEN e.base_amount ELSE 0 END) AS cr")
            ->groupBy('e.ledger_id');
        $from && $q->where('v.date', '>=', $from);
        $to && $q->where('v.date', '<=', $to);

        return $q->get()->keyBy('ledger_id')->map(fn ($r) => ['dr' => (float) $r->dr, 'cr' => (float) $r->cr])->all();
    }

    /** Taxable value per tax ledger, by side, from the voucher lines (credit / debit notes reduce it). */
    private function bases(array $ledgerIds, ?string $from, ?string $to): array
    {
        if (! $ledgerIds) {
            return [];
        }
        $rows = DB::table('voucher_item_taxes as t')->join('voucher_items as i', 'i.id', '=', 't.item_id')
            ->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->join('voucher_types as vt', 'vt.id', '=', 'v.voucher_type_id')
            ->where('v.status', Voucher::POSTED)->whereIn('t.ledger_id', $ledgerIds)
            ->whereIn('vt.base_type', ['sales', 'cash_sale', 'credit_note', 'purchase', 'debit_note'])
            ->when($from, fn ($q) => $q->where('v.date', '>=', $from))->when($to, fn ($q) => $q->where('v.date', '<=', $to))
            ->groupBy('t.ledger_id', 'vt.base_type')
            ->selectRaw('t.ledger_id, vt.base_type, SUM(t.base_amount * v.exchange_rate) AS base')->get();
        $out = [];
        foreach ($rows as $r) {
            $side = in_array($r->base_type, ['sales', 'cash_sale', 'credit_note'], true) ? 'sales' : 'purchases';
            $sign = in_array($r->base_type, ['credit_note', 'debit_note'], true) ? -1 : 1;
            $out[$r->ledger_id][$side] = ($out[$r->ledger_id][$side] ?? 0) + $sign * (float) $r->base;
        }

        return $out;
    }

    /**
     * The tax return: per tax type and rate, what we charged (output), what we can reclaim (input),
     * the balance brought forward and what is owed at the end. Withheld types show what customers held
     * back from us and what we held back from suppliers.
     */
    public function taxReturn(?string $from, ?string $to): array
    {
        $types = [];
        $totals = ['output' => 0.0, 'input' => 0.0, 'net' => 0.0, 'owed' => 0.0];
        foreach (TaxType::active()->orderBy('name')->get() as $type) {
            if ($type->application_mode === TaxType::MODE_WITHHELD) {
                $mv = $this->movement(array_filter([$type->receivable_ledger_id, $type->payable_ledger_id]), $from, $to);
                $held = $mv[$type->receivable_ledger_id]['dr'] ?? 0;   // customers held back from us
                $withheld = $mv[$type->payable_ledger_id]['cr'] ?? 0;   // we held back from suppliers
                $types[] = ['id' => $type->id, 'code' => $type->code, 'name' => $type->name, 'mode' => 'withheld', 'rows' => [
                    ['label' => 'Withheld from us by customers (receivable)', 'sales_base' => null, 'output' => round($held, 2), 'purchases_base' => null, 'input' => 0.0, 'net' => round($held, 2)],
                    ['label' => 'Withheld by us from suppliers (payable)', 'sales_base' => null, 'output' => 0.0, 'purchases_base' => null, 'input' => round($withheld, 2), 'net' => round(-$withheld, 2)],
                ], 'brought_forward' => 0.0, 'closing_owed' => round($this->position($type), 2)];

                continue;
            }
            $rates = TaxRate::where('group_id', $type->id)->orderBy('valid_from')->orderBy('name')->get();
            $ids = $rates->pluck('id')->all();
            $mv = $this->movement($ids, $from, $to);
            $bases = $this->bases($ids, $from, $to);
            $rows = [];
            foreach ($rates as $r) {
                $out = $mv[$r->id]['cr'] ?? 0;   // tax charged on sales
                $in = $mv[$r->id]['dr'] ?? 0;    // tax paid on purchases
                if ($out < 0.005 && $in < 0.005 && empty($bases[$r->id])) {
                    continue;
                }
                $rows[] = ['label' => $r->name, 'sales_base' => round($bases[$r->id]['sales'] ?? 0, 2), 'output' => round($out, 2),
                    'purchases_base' => round($bases[$r->id]['purchases'] ?? 0, 2), 'input' => round($in, 2), 'net' => round($out - $in, 2)];
            }
            $bf = $type->control_ledger_id ? -$this->ledgers->balance($type->control_ledger_id, $from ? date('Y-m-d', strtotime($from . ' -1 day')) : null) : 0.0;
            $owed = $this->position($type);
            $types[] = ['id' => $type->id, 'code' => $type->code, 'name' => $type->name, 'mode' => 'additive', 'rows' => $rows, 'brought_forward' => round($bf, 2), 'closing_owed' => round($owed, 2)];
            $totals['output'] += array_sum(array_column($rows, 'output'));
            $totals['input'] += array_sum(array_column($rows, 'input'));
            $totals['owed'] += $owed;
        }
        $totals['net'] = $totals['output'] - $totals['input'];

        return ['from' => $from, 'to' => $to, 'types' => $types, 'totals' => array_map(fn ($v) => round($v, 2), $totals)];
    }

    /** Owed to the authority (positive) at the end of the period, everything the books hold for this type. */
    private function position(TaxType $type): float
    {
        return (float) (app(TaxLedgerService::class)->position($type)['net_owed'] ?? 0);
    }

    /** Every withholding certificate raised by a receipt / payment in the period. */
    public function withholdingRegister(?string $from, ?string $to): array
    {
        $rows = DB::table('withholding_certificates as c')->join('vouchers as v', 'v.id', '=', 'c.voucher_id')
            ->leftJoin('ledgers as p', 'p.id', '=', 'c.party_ledger_id')->leftJoin('ledgers as r', 'r.id', '=', 'c.tax_rate_id')
            ->leftJoin('ledger_groups as g', 'g.id', '=', 'r.group_id')
            ->where('c.status', '<>', 'void')
            ->when($from, fn ($q) => $q->where('v.date', '>=', $from))->when($to, fn ($q) => $q->where('v.date', '<=', $to))
            ->orderBy('v.date')->orderBy('c.id')
            ->get(['c.id', 'v.date', 'v.voucher_number', 'v.id as voucher_id', 'c.certificate_number', 'c.direction', 'p.name as party', 'g.name as tax', 'r.name as rate',
                'c.gross_amount', 'c.withheld_amount', 'c.net_amount', 'c.status', 'c.credit_status', 'c.cleared_amount', 'c.exchange_rate'])
            ->map(function ($x) {
                $x->withheld_base = round((float) $x->withheld_amount * (float) ($x->exchange_rate ?: 1), 2);

                return (array) $x;
            })->all();
        $sum = fn (string $dir) => round(array_sum(array_map(fn ($r) => $r['direction'] === $dir ? $r['withheld_base'] : 0, $rows)), 2);
        $awaiting = count(array_filter($rows, fn ($r) => $r['status'] === 'pending'));

        return ['from' => $from, 'to' => $to, 'rows' => $rows, 'totals' => ['receivable' => $sum('receivable'), 'payable' => $sum('payable'), 'awaiting_certificate' => $awaiting]];
    }

    /** Each control ledger against the register that explains it. `difference` should be nil, or fully explained by opening balances / rate changes. */
    public function reconciliation(?string $asOf): array
    {
        $asOf = $asOf ?: today()->toDateString();
        $s = AccountingSetting::current();
        $checks = [];
        $add = function (string $key, string $title, float $book, float $register, ?string $note, float $explained = 0.0) use (&$checks) {
            $diff = round($book - $register, 2);
            $checks[] = ['key' => $key, 'title' => $title, 'book' => round($book, 2), 'register' => round($register, 2), 'difference' => $diff,
                'explained' => round($explained, 2), 'ok' => abs($diff - $explained) < 0.01, 'note' => $note];
        };

        // trial balance
        $tb = app(BooksReportService::class)->trialBalance(null, $asOf);
        $add('trial-balance', 'Trial balance (debits = credits)', $tb['total_debit'], $tb['total_credit'], 'Every voucher balances, so this only differs when an opening balance is one-sided.');

        // gift vouchers
        if ($s->gift_voucher_ledger_id) {
            $book = -$this->ledgers->balance((int) $s->gift_voucher_ledger_id, $asOf);
            $reg = 0.0;
            foreach (GiftVoucher::whereIn('status', ['active', 'partially_used'])->get() as $gv) {
                $reg += (float) $gv->balance * $this->money->rateOn($gv->currency_id, $asOf);
            }
            $add('gift-vouchers', 'Gift vouchers outstanding', $book, $reg, 'Register value uses today\'s exchange rates, so a foreign-currency voucher can differ by exchange movement.');
        }
        // loyalty points
        if ($s->loyalty_liability_ledger_id) {
            $book = -$this->ledgers->balance((int) $s->loyalty_liability_ledger_id, $asOf);
            $points = (int) Customer::sum('loyalty_points');
            $reg = $points * app(RewardService::class)->pointValue();
            $add('loyalty-points', 'Loyalty points liability', $book, $reg, "{$points} points at the current value per point.");
        }
        // withholding credits
        $recv = TaxType::withheld()->pluck('receivable_ledger_id')->filter()->unique()->all();
        if ($recv) {
            $book = array_sum(array_map(fn ($id) => $this->ledgers->balance((int) $id, $asOf), $recv));
            $opening = array_sum(array_map(fn ($id) => (float) Ledger::whereKey($id)->value('opening_balance') * (Ledger::whereKey($id)->value('opening_side') === 'C' ? -1 : 1), $recv));
            $reg = (float) DB::table('withholding_certificates')->where('direction', 'receivable')->whereIn('credit_status', ['held', 'partially_cleared'])
                ->sum(DB::raw('(withheld_amount - cleared_amount) * COALESCE(exchange_rate, 1)'));
            $add('withholding-credits', 'Withholding tax receivable', $book, $reg, 'The register holds credits raised by receipts; an opening balance carried in is not in it.', $opening);
        }
        // receivables / payables
        $debtors = $this->groupBalance('Sundry Debtors', $asOf);
        $ageR = app(BooksReportService::class)->ageing('receivables', $asOf)['totals']['total'];
        $add('receivables', 'Receivables (customer ledgers vs open bills)', $debtors, $ageR, 'Differs by advances, on-account receipts and balances not tracked bill by bill.');
        $creditors = -$this->groupBalance('Sundry Creditors', $asOf);
        $ageP = app(BooksReportService::class)->ageing('payables', $asOf)['totals']['total'];
        $add('payables', 'Payables (supplier ledgers vs open bills)', $creditors, $ageP, 'Differs by advances, on-account payments and balances not tracked bill by bill.');

        return ['as_of' => $asOf, 'checks' => $checks, 'all_ok' => ! in_array(false, array_column($checks, 'ok'), true)];
    }

    private function groupBalance(string $groupName, string $asOf): float
    {
        $group = LedgerGroup::where('name', $groupName)->first();
        if (! $group) {
            return 0.0;
        }

        return round(Ledger::whereIn('group_id', $group->selfAndDescendantIds())->pluck('id')->sum(fn ($id) => $this->ledgers->balance((int) $id, $asOf)), 2);
    }
}
