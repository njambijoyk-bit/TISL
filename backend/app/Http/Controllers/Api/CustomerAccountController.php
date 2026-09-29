<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\AccountingSetting;
use App\Models\Books\Ledger;
use App\Models\Books\VoucherType;
use App\Models\Customer;
use App\Services\Books\BooksException;
use App\Services\Books\BooksReportService;
use App\Services\Books\LedgerService;
use App\Services\Books\VoucherService;
use App\Services\CurrencyConversionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A customer's account IS their ledger. This is the credit screen: terms and limit on the
 * customer, balance / open bills / statement from the books, adjustments as journals.
 */
class CustomerAccountController extends Controller
{
    public function __construct(private LedgerService $ledgers, private BooksReportService $reports, private VoucherService $vouchers, private CurrencyConversionService $money) {}

    private function guard(callable $fn)
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function limitBase(Customer $c): float
    {
        if (! (float) $c->credit_limit) {
            return 0.0;
        }

        return $this->money->convert((float) $c->credit_limit, $this->money->currencyFrom($c->credit_currency_id ?? $c->currency_id), $this->money->getBaseCurrency());
    }

    public function show($customerId): JsonResponse
    {
        return $this->guard(function () use ($customerId) {
            $c = Customer::findOrFail($customerId);
            $ledger = $this->ledgers->customerLedger($c);
            $owed = $this->ledgers->balance($ledger->id);
            $limit = $this->limitBase($c);
            $ageing = $this->reports->ageing('receivables', null, $ledger->id);
            $bills = $ageing['rows'][0]['bills'] ?? [];
            $statement = $this->reports->ledgerStatement($ledger->id, today()->subDays(90)->toDateString(), today()->toDateString());

            return response()->json([
                'customer' => $c->only(['id', 'first_name', 'last_name', 'email', 'currency_id']),
                'ledger' => ['id' => $ledger->id, 'name' => $ledger->name],
                'terms' => $c->only(['has_credit_account', 'credit_limit', 'credit_currency_id', 'credit_terms_days', 'credit_interest_rate']),
                'base_currency' => $this->money->getBaseCurrency()->only(['code', 'symbol']),
                'owed' => round($owed, 2), 'limit_base' => round($limit, 2), 'available' => round(max(0, $limit - max(0, $owed)), 2),
                'ageing' => $ageing['totals'], 'open_bills' => $bills, 'statement' => $statement,
            ]);
        });
    }

    public function terms(Request $request, $customerId): JsonResponse
    {
        $d = $request->validate([
            'has_credit_account' => 'required|boolean', 'credit_limit' => 'nullable|numeric|min:0', 'credit_currency_id' => 'nullable|integer|exists:currencies,id',
            'credit_terms_days' => 'nullable|integer|min:0|max:365', 'credit_interest_rate' => 'nullable|numeric|min:0|max:100',
        ]);
        $c = Customer::findOrFail($customerId);
        $c->update($d + ['credit_terms_days' => $d['credit_terms_days'] ?? 30]);

        return response()->json(['message' => 'Credit terms saved', 'data' => $c->only(['has_credit_account', 'credit_limit', 'credit_currency_id', 'credit_terms_days', 'credit_interest_rate'])]);
    }

    /** Move the account by hand: a journal against the customer's ledger. */
    public function adjust(Request $request, $customerId): JsonResponse
    {
        $d = $request->validate(['direction' => 'required|in:debit,credit', 'amount' => 'required|numeric|min:0.01', 'counter_ledger_id' => 'required|integer|exists:ledgers,id', 'note' => 'required|string|max:255']);

        return $this->guard(function () use ($d, $request, $customerId) {
            $ledger = $this->ledgers->customerLedger(Customer::findOrFail($customerId));
            $journal = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');
            $debit = $d['direction'] === 'debit';
            $v = $this->vouchers->create([
                'voucher_type_id' => $journal->id, 'date' => today()->toDateString(), 'narration' => $d['note'],
                'entries' => [
                    ['ledger_id' => $debit ? $ledger->id : $d['counter_ledger_id'], 'side' => 'D', 'amount' => $d['amount']],
                    ['ledger_id' => $debit ? $d['counter_ledger_id'] : $ledger->id, 'side' => 'C', 'amount' => $d['amount']],
                ],
            ], $request->user());

            return response()->json(['message' => "{$v->voucher_number} posted", 'voucher_id' => $v->id], 201);
        });
    }

    /** Late-payment interest: Dr the customer, Cr Interest Income. */
    public function interest(Request $request, $customerId): JsonResponse
    {
        $d = $request->validate(['amount' => 'required|numeric|min:0.01', 'note' => 'nullable|string|max:255']);

        return $this->guard(function () use ($d, $request, $customerId) {
            $income = AccountingSetting::current()->interest_income_ledger_id ?: Ledger::where('name', 'Interest Income')->value('id')
                ?: throw new BooksException('Set the Interest Income ledger under Books settings (default ledgers).');
            $request->merge(['direction' => 'debit', 'counter_ledger_id' => $income, 'note' => $d['note'] ?: 'Interest on overdue balance', 'amount' => $d['amount']]);

            return $this->adjust($request, $customerId);
        });
    }

    /** Everyone who has a credit account, with what they owe against their limit. */
    public function overview(Request $request): JsonResponse
    {
        $rows = Customer::where('has_credit_account', true)->orderBy('first_name')->get()->map(function (Customer $c) {
            $ledger = Ledger::where('customer_id', $c->id)->first();
            $owed = $ledger ? $this->ledgers->balance($ledger->id) : 0.0;
            $limit = $this->limitBase($c);
            $overdue = 0.0;
            if ($ledger) {
                $a = $this->reports->ageing('receivables', null, $ledger->id)['totals'];
                $overdue = $a['d1_30'] + $a['d31_60'] + $a['d61_90'] + $a['d90_plus'];
            }

            return ['id' => $c->id, 'name' => trim(($c->first_name ?? '') . ' ' . ($c->last_name ?? '')) ?: $c->email, 'limit' => round($limit, 2), 'owed' => round($owed, 2),
                'available' => round(max(0, $limit - max(0, $owed)), 2), 'overdue' => round($overdue, 2), 'terms_days' => (int) $c->credit_terms_days];
        });
        $ageing = $this->reports->ageing('receivables');

        return response()->json(['base_currency' => $this->money->getBaseCurrency()->only(['code', 'symbol']), 'customers' => $rows->values(),
            'totals' => ['limit' => $rows->sum('limit'), 'owed' => $rows->sum('owed'), 'overdue' => $rows->sum('overdue')], 'ageing' => $ageing['totals']]);
    }
}
