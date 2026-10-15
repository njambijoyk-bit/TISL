<?php

namespace App\Services\Books;

use App\Models\Books\PaymentMethod;

/** What was handed over at a till, checked against what is owed. Cash may be more (the change is given back); the other ways must not be. */
class TenderCheck
{
    /** @return array{tenders: array, tendered: float, change: float, record: array} */
    public function check(array $given, float $total): array
    {
        $given = array_values(array_filter($given, fn ($t) => (float) ($t['amount'] ?? 0) > 0));
        if (! $given) {
            throw new BooksException('Enter how it was paid.');
        }
        $methods = PaymentMethod::where('is_active', true)->whereIn('id', array_map(fn ($t) => (int) ($t['payment_method_id'] ?? 0), $given))->get()->keyBy('id');
        $rows = [];
        $handed = 0.0;
        $cash = 0.0;
        foreach ($given as $t) {
            $m = $methods[(int) $t['payment_method_id']] ?? throw new BooksException('That way of paying is not available.');
            $amount = round((float) $t['amount'], 2);
            $handed += $amount;
            $cash += $m->kind === 'cash' ? $amount : 0;
            $rows[] = ['payment_method_id' => $m->id, 'amount' => $amount, 'reference' => ($t['reference'] ?? null) ?: null, 'name' => $m->name, 'cash' => $m->kind === 'cash', 'gift' => $m->kind === 'gift_voucher' ? trim((string) ($t['gift_voucher_code'] ?? '')) : null];
        }
        $handed = round($handed, 2);
        if ($handed + 0.004 < $total) {
            throw new BooksException('The payment is short by '.number_format($total - $handed, 2).'.');
        }
        $change = round($handed - $total, 2);
        if ($change > $cash + 0.004) {
            throw new BooksException('Only cash can be over what is owed (the change is given from it).');
        }
        for ($i = count($rows) - 1; $i >= 0 && $change > 0; $i--) {   // the change comes off the cash that was handed over
            if ($rows[$i]['cash']) {
                $take = min($change, $rows[$i]['amount']);
                $rows[$i]['amount'] = round($rows[$i]['amount'] - $take, 2);
                $change = round($change - $take, 2);
            }
        }
        $kept = array_values(array_filter($rows, fn ($r) => $r['amount'] > 0));

        return ['tenders' => array_map(fn ($r) => ['payment_method_id' => $r['payment_method_id'], 'amount' => $r['amount'], 'reference' => $r['reference']] + ($r['gift'] ? ['gift_voucher_code' => $r['gift']] : []), $kept),
            'tendered' => $handed, 'change' => round($handed - $total, 2), 'record' => array_map(fn ($r) => ['method' => $r['name'], 'amount' => $r['amount'], 'reference' => $r['reference'] ?: ($r['gift'] ?: null)], $kept)];
    }
}
