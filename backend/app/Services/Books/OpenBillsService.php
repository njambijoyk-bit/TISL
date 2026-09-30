<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\Voucher;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Bill by bill: what one party ledger owes us and what we owe it, from the bill references of posted vouchers.
 * A sale / purchase opens a *new* bill; a receipt / payment / note settles it (*against*); an amount not matched to
 * any bill is an *advance* — credit on account. One query, used by the receipt and payment form, the customer's account
 * page and the ageing so they always agree.
 */
class OpenBillsService
{
    /** Voucher kinds whose advance is credit we hold for a customer, and those that are money we prepaid to a supplier. */
    private const CREDIT_BASES = ['receipt', 'credit_note'];
    private const PREPAID_BASES = ['payment', 'debit_note'];

    /**
     * @param  ?int  $exceptVoucherId  a receipt/payment being edited: what it settles counts as still open, so the form can show it again
     * @return array{ledger: array, bills: array, credits: array, totals: array}
     */
    public function forLedger(int $ledgerId, ?int $exceptVoucherId = null, ?string $asOf = null): array
    {
        $ledger = Ledger::findOrFail($ledgerId);
        $asOf = Carbon::parse($asOf ?? today());

        $rows = DB::table('voucher_bill_refs as b')->join('vouchers as v', 'v.id', '=', 'b.voucher_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->where('b.ledger_id', $ledgerId)->where('b.ref_type', 'new')->where('v.status', Voucher::POSTED)->where('v.date', '<=', $asOf->toDateString())
            ->whereIn('t.base_type', ['sales', 'purchase'])
            ->get(['b.voucher_id', 'b.amount', 'b.due_date', 'v.voucher_number', 'v.date', 'v.narration', 'v.reference_no', 'v.supplier_invoice_no', 't.base_type', 't.name as type_name']);

        $settled = DB::table('voucher_bill_refs as b')->join('vouchers as v', 'v.id', '=', 'b.voucher_id')
            ->where('b.ref_type', 'against')->where('v.status', Voucher::POSTED)->where('v.date', '<=', $asOf->toDateString())
            ->whereIn('b.against_voucher_id', $rows->pluck('voucher_id'))
            ->when($exceptVoucherId, fn ($q) => $q->where('b.voucher_id', '!=', $exceptVoucherId))
            ->groupBy('b.against_voucher_id')->selectRaw('b.against_voucher_id as id, SUM(b.amount) as paid')->pluck('paid', 'id');

        // what the voucher being edited already settles, so its form starts as it was saved
        $mine = $exceptVoucherId
            ? DB::table('voucher_bill_refs')->where('voucher_id', $exceptVoucherId)->where('ref_type', 'against')->groupBy('against_voucher_id')
                ->selectRaw('against_voucher_id as id, SUM(amount) as amt')->pluck('amt', 'id')
            : collect();

        $bills = [];
        foreach ($rows as $r) {
            $open = round((float) $r->amount - (float) ($settled[$r->voucher_id] ?? 0), 2);
            if ($open <= 0.005) {
                continue;
            }
            $due = Carbon::parse($r->due_date ?? $r->date);
            $bills[] = [
                'voucher_id' => (int) $r->voucher_id, 'voucher_number' => $r->voucher_number, 'type' => $r->base_type, 'type_name' => $r->type_name,
                'side' => $r->base_type === 'sales' ? 'receivable' : 'payable', 'date' => (string) $r->date, 'due_date' => $due->toDateString(),
                'days_late' => max(0, (int) $due->diffInDays($asOf, false)), 'original' => round((float) $r->amount, 2), 'outstanding' => $open,
                'reference' => $r->supplier_invoice_no ?: $r->reference_no, 'this_voucher' => round((float) ($mine[$r->voucher_id] ?? 0), 2),
            ];
        }
        usort($bills, fn ($a, $b) => [$a['due_date'], $a['voucher_id']] <=> [$b['due_date'], $b['voucher_id']]);   // oldest due first

        // what has been handed back by a refund payment (a payment whose settlement points at the receipt itself)
        $refunded = DB::table('voucher_bill_refs as b')->join('vouchers as v', 'v.id', '=', 'b.voucher_id')
            ->where('b.ref_type', 'against')->where('v.status', Voucher::POSTED)
            ->when($exceptVoucherId, fn ($q) => $q->where('b.voucher_id', '!=', $exceptVoucherId))
            ->groupBy('b.against_voucher_id')->selectRaw('b.against_voucher_id as id, SUM(b.amount) as amt')->pluck('amt', 'id');

        $credits = DB::table('voucher_bill_refs as b')->join('vouchers as v', 'v.id', '=', 'b.voucher_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->where('b.ledger_id', $ledgerId)->where('b.ref_type', 'advance')->where('v.status', Voucher::POSTED)->where('v.date', '<=', $asOf->toDateString())
            ->when($exceptVoucherId, fn ($q) => $q->where('v.id', '!=', $exceptVoucherId))
            ->orderBy('v.date')->orderBy('v.id')
            ->get(['b.voucher_id', 'b.amount', 'v.voucher_number', 'v.date', 'v.meta', 't.base_type', 't.name as type_name'])
            ->map(function ($c) use ($refunded) {
                $meta = is_string($c->meta) ? (json_decode($c->meta, true) ?: []) : (array) $c->meta;
                $isAdvance = array_key_exists('advance', $meta);

                return [
                    'voucher_id' => (int) $c->voucher_id, 'voucher_number' => $c->voucher_number, 'type' => $c->base_type, 'type_name' => $c->type_name, 'date' => (string) $c->date,
                    'kind' => in_array($c->base_type, self::CREDIT_BASES, true) ? 'credit' : (in_array($c->base_type, self::PREPAID_BASES, true) ? 'prepaid' : 'credit'),
                    // paid on purpose for something not yet supplied, or an accidental overpayment
                    'nature' => $isAdvance ? 'advance' : 'overpayment', 'for' => $meta['advance']['for'] ?? null,
                    'amount' => round((float) $c->amount - (float) ($refunded[$c->voucher_id] ?? 0), 2),
                ];
            })->filter(fn ($c) => $c['amount'] > 0.004)->values()->all();

        $sum = fn (array $xs, string $k) => round(array_sum(array_column($xs, $k)), 2);
        $receivable = array_filter($bills, fn ($b) => $b['side'] === 'receivable');
        $payable = array_filter($bills, fn ($b) => $b['side'] === 'payable');
        $creditHeld = round(array_sum(array_map(fn ($c) => $c['kind'] === 'credit' ? $c['amount'] : 0, $credits)), 2);
        $prepaid = round(array_sum(array_map(fn ($c) => $c['kind'] === 'prepaid' ? $c['amount'] : 0, $credits)), 2);
        $owedToUs = $sum($receivable, 'outstanding');
        $weOwe = $sum($payable, 'outstanding');

        return [
            'ledger' => ['id' => $ledger->id, 'name' => $ledger->name],
            'bills' => array_values($bills), 'credits' => $credits,
            'totals' => [
                'owed_to_us' => $owedToUs, 'we_owe' => $weOwe, 'credit_held' => $creditHeld, 'prepaid' => $prepaid,
                'overdue' => round(array_sum(array_map(fn ($b) => $b['days_late'] > 0 ? $b['outstanding'] : 0, $receivable)), 2),
                // what they really owe us after the credit we hold for them, and what we really owe after what we prepaid
                'net_owed_to_us' => round($owedToUs - $creditHeld, 2), 'net_we_owe' => round($weOwe - $prepaid, 2),
            ],
        ];
    }

    /** What is left of one receipt's / note's credit after credit applied to bills and refunds (for the refund form). */
    public function creditLeft(int $voucherId, ?int $exceptVoucherId = null): float
    {
        $adv = (float) DB::table('voucher_bill_refs')->where('voucher_id', $voucherId)->where('ref_type', 'advance')->sum('amount');
        $refunded = (float) DB::table('voucher_bill_refs as b')->join('vouchers as v', 'v.id', '=', 'b.voucher_id')
            ->where('b.against_voucher_id', $voucherId)->where('b.ref_type', 'against')->where('v.status', Voucher::POSTED)
            ->when($exceptVoucherId, fn ($q) => $q->where('b.voucher_id', '!=', $exceptVoucherId))->sum('b.amount');

        return round($adv - $refunded, 2);
    }

    /** The overpayments and advances a storefront customer holds (their own ledger). */
    public function forCustomer(int $customerId): array
    {
        $ledger = Ledger::where('customer_id', $customerId)->first();
        if (! $ledger) {
            return [];
        }

        return array_values(array_filter($this->forLedger($ledger->id)['credits'], fn ($c) => $c['kind'] === 'credit'));
    }
}
