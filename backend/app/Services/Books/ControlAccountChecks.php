<?php

namespace App\Services\Books;

use App\Models\Books\AccountingSetting;
use App\Models\Books\Ledger;
use App\Models\TaxType;
use Illuminate\Support\Facades\DB;

/**
 * The control-account checks (docs/BOOKS_REPORTS_PLAN.md, step 9): each control ledger against the register that explains it (trial balance, gift vouchers, loyalty
 * points, withholding credits, stock and stock units, receivables, payables). Shown by the `control-accounts` report. Balances are signed debit-positive in the base
 * currency, from posted vouchers only. A check that needs a group the Reports settings have not chosen says so instead of guessing from a name.
 */
class ControlAccountChecks
{
    public function __construct(private LedgerService $ledgers) {}

    /** Each control ledger against the register that explains it. `difference` should be nil, or fully explained by opening balances / rate changes. */
    public function checks(?string $asOf): array
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
        $tb = app(Engine\Figures::class)->trialBalance(null, $asOf);
        $add('trial-balance', 'Trial balance (debits = credits)', $tb['total_debit'], $tb['total_credit'], 'Every voucher balances, so this only differs when an opening balance is one-sided.');

        // gift vouchers
        if ($s->gift_voucher_ledger_id) {
            $book = -$this->ledgers->balance((int) $s->gift_voucher_ledger_id, $asOf, true);
            $reg = app(GiftVoucherService::class)->registerValue();
            $add('gift-vouchers', 'Gift vouchers outstanding', $book, $reg, 'Each voucher at the value actually booked; an exchange difference on a spent foreign-currency voucher is journalled when it closes.');
        }
        // loyalty points
        if ($s->loyalty_liability_ledger_id) {
            $book = -$this->ledgers->balance((int) $s->loyalty_liability_ledger_id, $asOf, true);
            $liab = app(PointLotService::class)->liability();
            $add('loyalty-points', 'Loyalty points liability', $book, $liab['value'], "{$liab['points']} points held, each lot at the value of a point on the day it was earned.");
        }
        // withholding credits
        $recv = TaxType::withheld()->pluck('receivable_ledger_id')->filter()->unique()->all();
        if ($recv) {
            $book = array_sum(array_map(fn ($id) => $this->ledgers->balance((int) $id, $asOf), $recv));
            $opening = array_sum(array_map(fn ($id) => (float) Ledger::whereKey($id)->value('opening_balance') * (Ledger::whereKey($id)->value('opening_side') === 'C' ? -1 : 1), $recv));
            $reg = (float) RestatedBase::join(DB::table('withholding_certificates as c')->join('vouchers as v', 'v.id', '=', 'c.voucher_id'))
                ->where('c.direction', 'receivable')->whereIn('c.credit_status', ['held', 'partially_cleared'])
                ->sum(DB::raw('(c.withheld_amount - c.cleared_amount) * ' . RestatedBase::rate()));
            $add('withholding-credits', 'Withholding tax receivable', $book, $reg, 'The register holds credits raised by receipts; an opening balance carried in is not in it.', $opening);
        }
        // stock: what is on the shelves, at cost, against the Stock ledger — and the shop's numbers against the batches
        if ($s->stock_ledger_id && $asOf >= today()->toDateString()) {   // batches show today's stock, so only today can be proved
            $rec = app(\App\Services\Stock\StockReconciliationService::class);
            $sv = $rec->valueCheck($this->ledgers->balance((int) $s->stock_ledger_id, $asOf, true));
            $add('stock', 'Stock (Stock ledger vs batches at cost)', $sv['book'], $sv['register'], $sv['note'], $sv['explained']);

            $bad = $rec->unitMismatches();
            $shop = round((float) DB::table('variant_location_stock')->sum('quantity'), 4);
            $add('stock-units', 'Stock units (what the shop shows vs the batches)', $shop, round($shop - array_sum(array_map(fn ($m) => $m['shop'] - $m['batches'], $bad)), 4),
                $bad ? count($bad) . ' product / branch numbers differ from their batches — “Refresh” sets them from the batches.' : 'Every product and branch shows what its in-date batches hold.');
            $checks[count($checks) - 1]['ok'] = ! $bad;
            $checks[count($checks) - 1]['details'] = array_map(fn ($m) => "{$m['product']}" . ($m['variant'] && $m['variant'] !== 'Standard' ? " — {$m['variant']}" : '') . " at {$m['location']}: shows {$m['shop']}, batches hold {$m['batches']}", array_slice($bad, 0, 10));
        }
        // receivables / payables: the groups chosen in the Reports settings (Ratio analysis inputs); none is found by name
        $notSetUp = [];
        $figures = app(Engine\Figures::class);
        foreach (['receivables' => ['debtors', 'Receivables (customer ledgers vs open bills)', 1, 'Differs by advances, on-account receipts and balances not tracked bill by bill.', 'Debtors'],
            'payables' => ['creditors', 'Payables (supplier ledgers vs open bills)', -1, 'Differs by advances, on-account payments and balances not tracked bill by bill.', 'Creditors']] as $kind => [$input, $title, $sign, $note, $label]) {
            $ids = ReportSettings::ready() ? app(ReportSettings::class)->ratioLedgerIds($input) : null;
            if ($ids === null) {
                $notSetUp[] = ['key' => $kind, 'title' => $title, 'message' => "Choose the {$label} groups in Reports settings → Ratio analysis inputs to check this."];
                continue;
            }
            $book = $sign * round(array_sum(array_map(fn ($id) => $this->ledgers->balance((int) $id, $asOf), $ids)), 2);
            $add($kind, $title, $book, $figures->ageing($kind, $asOf)['totals']['total'], $note);
        }

        return ['as_of' => $asOf, 'checks' => $checks, 'not_set_up' => $notSetUp, 'all_ok' => ! in_array(false, array_column($checks, 'ok'), true), 'restated_vouchers' => RestatedBase::restatedCount()];
    }
}
