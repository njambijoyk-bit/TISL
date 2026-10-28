<?php

namespace App\Services\Books\Engine;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The numbers that identify a transaction, gathered for a list of vouchers in a handful of queries: the voucher's own number and references,
 * how it was paid (cheque number and dates, transfer reference, M-Pesa code) and the gateway's receipt. Reports show them on every row, and
 * reconciliation matches on them.
 *
 * For each voucher id:
 *   voucher_number, reference_no, supplier_invoice_no,
 *   instruments: [{type, number, instrument_date, bank_name, reference, status, deposited_on, cleared_on, ledger_id}],
 *   tenders:     [{method, kind, reference}],
 *   receipts:    [receipt numbers confirmed by a payment gateway, e.g. M-Pesa],
 *   codes:       every number above in one flat list, for searching and matching.
 */
final class Identifiers
{
    /**
     * @param  int[]  $voucherIds
     * @return array<int, array>
     */
    public function forVouchers(array $voucherIds): array
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $voucherIds))));
        if (! $ids) {
            return [];
        }
        $out = [];
        foreach (DB::table('vouchers')->whereIn('id', $ids)->get(['id', 'voucher_number', 'reference_no', 'supplier_invoice_no']) as $v) {
            $out[(int) $v->id] = [
                'voucher_number' => $v->voucher_number, 'reference_no' => $v->reference_no, 'supplier_invoice_no' => $v->supplier_invoice_no,
                'instruments' => [], 'tenders' => [], 'receipts' => [], 'codes' => [],
            ];
        }

        if (Schema::hasTable('voucher_instruments')) {
            foreach (DB::table('voucher_instruments')->whereIn('voucher_id', $ids)->orderBy('id')
                ->get(['voucher_id', 'ledger_id', 'type', 'number', 'instrument_date', 'bank_name', 'reference', 'status', 'deposited_on', 'cleared_on']) as $i) {
                if (isset($out[$i->voucher_id])) {
                    $out[$i->voucher_id]['instruments'][] = [
                        'type' => $i->type, 'number' => $i->number, 'instrument_date' => $i->instrument_date ? substr((string) $i->instrument_date, 0, 10) : null, 'bank_name' => $i->bank_name,
                        'reference' => $i->reference, 'status' => $i->status, 'deposited_on' => $i->deposited_on ? substr((string) $i->deposited_on, 0, 10) : null,
                        'cleared_on' => $i->cleared_on ? substr((string) $i->cleared_on, 0, 10) : null, 'ledger_id' => $i->ledger_id ? (int) $i->ledger_id : null,
                    ];
                }
            }
        }

        if (Schema::hasTable('voucher_tenders')) {
            $hasMethods = Schema::hasTable('payment_methods');
            $q = DB::table('voucher_tenders as t')->whereIn('t.voucher_id', $ids)->orderBy('t.id');
            $rows = $hasMethods
                ? $q->leftJoin('payment_methods as m', 'm.id', '=', 't.payment_method_id')->get(['t.voucher_id', 't.reference', 'm.name as method', 'm.kind'])
                : $q->get(['t.voucher_id', 't.reference']);
            foreach ($rows as $t) {
                if (isset($out[$t->voucher_id])) {
                    $out[$t->voucher_id]['tenders'][] = ['method' => $t->method ?? null, 'kind' => $t->kind ?? null, 'reference' => $t->reference];
                }
            }
        }

        if (Schema::hasTable('payment_attempts')) {
            foreach (DB::table('payment_attempts')->where('status', 'confirmed')->whereNotNull('receipt_number')
                ->where(fn ($w) => $w->whereIn('voucher_id', $ids)->orWhereIn('settled_voucher_id', $ids))->get(['voucher_id', 'settled_voucher_id', 'receipt_number']) as $a) {
                foreach (array_unique(array_filter([(int) $a->voucher_id, (int) $a->settled_voucher_id])) as $vid) {
                    if (isset($out[$vid])) {
                        $out[$vid]['receipts'][] = $a->receipt_number;
                    }
                }
            }
        }

        foreach ($out as &$v) {
            $codes = [$v['voucher_number'], $v['reference_no'], $v['supplier_invoice_no']];
            foreach ($v['instruments'] as $i) {
                array_push($codes, $i['number'], $i['reference']);
            }
            foreach ($v['tenders'] as $t) {
                $codes[] = $t['reference'];
            }
            $v['receipts'] = array_values(array_unique($v['receipts']));
            $v['codes'] = array_values(array_unique(array_filter(array_merge($codes, $v['receipts']), fn ($c) => $c !== null && $c !== '')));
        }
        unset($v);

        return $out;
    }
}
