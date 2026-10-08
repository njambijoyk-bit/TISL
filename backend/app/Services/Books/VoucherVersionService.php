<?php

namespace App\Services\Books;

use App\Models\Books\Voucher;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The edit log. Every time a voucher is created, altered or deleted a snapshot of it is kept as the next version, so two
 * versions can be compared side by side. A voucher that predates the log gets its first version (the state it was in
 * just before) the first time it is altered or cancelled.
 */
class VoucherVersionService
{
    /** Keep the current state of a voucher as its next version. */
    public function record(Voucher $v, string $activity, ?User $user = null): void
    {
        if (! $this->ready()) {
            return;
        }
        $next = ((int) DB::table('voucher_versions')->where('voucher_id', $v->id)->max('version')) + 1;
        DB::table('voucher_versions')->insert([
            'voucher_id' => $v->id, 'version' => $next, 'activity' => $activity, 'user_id' => $user?->id,
            'snapshot' => json_encode($this->snapshot($v), JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION), 'created_at' => now(),
        ]);
    }

    /** Before the first change to a voucher that has no versions yet: keep what it looks like now as version 1. */
    public function baseline(Voucher $v): void
    {
        if ($this->ready() && ! DB::table('voucher_versions')->where('voucher_id', $v->id)->exists()) {
            $who = DB::table('voucher_audit_logs')->where('voucher_id', $v->id)->where('action', 'created')->value('user_id');
            $this->record($v, 'created', $who ? User::find($who) : null);
        }
    }

    /** Vouchers that have been altered or deleted, with how many versions each has. */
    public function log(array $f): array
    {
        if (! $this->ready()) {
            return [];
        }
        $q = DB::table('voucher_versions as ver')->join('vouchers as v', 'v.id', '=', 'ver.voucher_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->leftJoin('ledgers as pl', 'pl.id', '=', 'v.party_ledger_id')
            ->when(! empty($f['from']), fn ($s) => $s->where('v.date', '>=', $f['from']))->when(! empty($f['to']), fn ($s) => $s->where('v.date', '<=', $f['to']))
            ->when(! empty($f['type']), fn ($s) => $s->where(fn ($w) => $w->where('t.base_type', $f['type'])->orWhere('t.id', is_numeric($f['type']) ? $f['type'] : 0)))
            ->when(! empty($f['search']), fn ($s) => $s->where(fn ($w) => $w->where('v.voucher_number', 'like', "%{$f['search']}%")->orWhere('pl.name', 'like', "%{$f['search']}%")->orWhere('v.party_name', 'like', "%{$f['search']}%")))
            ->when(true, fn ($s) => app(\App\Services\Access\BranchFilter::class)->apply($s, 'v.location_id', 'books', 'edit_log'))
            ->groupBy('v.id', 'v.voucher_number', 'v.date', 't.name', 'pl.name', 'v.party_name', 'v.status')
            ->havingRaw("SUM(ver.activity IN ('altered','deleted')) > 0")
            ->orderByDesc('v.date')->orderByDesc('v.id');

        return $q->selectRaw("v.id, v.voucher_number, v.date, t.name as type, COALESCE(pl.name, v.party_name) as particulars, v.status, COUNT(*) as versions, MAX(ver.created_at) as last_at, SUM(ver.activity = 'deleted') as deleted")
            ->limit(500)->get()->map(fn ($r) => [
                'id' => (int) $r->id, 'voucher_number' => $r->voucher_number, 'date' => (string) $r->date, 'type' => $r->type, 'particulars' => $r->particulars, 'versions' => (int) $r->versions,
                'deleted' => (int) $r->deleted > 0, 'last_at' => (string) $r->last_at,
            ])->all();
    }

    /** All versions of one voucher, oldest first. */
    public function versions(int $voucherId): array
    {
        if (! $this->ready()) {
            return [];
        }

        return DB::table('voucher_versions as ver')->leftJoin('users as u', 'u.id', '=', 'ver.user_id')->where('ver.voucher_id', $voucherId)->orderBy('ver.version')
            ->get(['ver.version', 'ver.activity', 'ver.created_at', 'ver.snapshot', 'u.name as user', 'u.email'])
            ->map(fn ($r) => ['version' => (int) $r->version, 'activity' => $r->activity, 'user' => $r->user ?: $r->email, 'at' => (string) $r->created_at, 'snapshot' => json_decode($r->snapshot, true)])->all();
    }

    /** The voucher as a plain, comparable array: header, items, ledger entries, payments, bills. */
    public function snapshot(Voucher $v): array
    {
        $v->loadMissing('type', 'partyLedger', 'location', 'currency', 'paymentMethod');
        $n = fn ($x) => $x === null ? null : (float) $x;
        $promo = ! empty($v->meta['promo_code_id']) ? DB::table('referral_codes')->where('id', $v->meta['promo_code_id'])->value('code') : null;

        $items = DB::table('voucher_items as i')->leftJoin('ledgers as l', 'l.id', '=', 'i.ledger_id')->where('i.voucher_id', $v->id)->orderBy('i.id')
            ->get(['i.id', 'i.description', 'i.variant_label', 'i.quantity', 'i.unit_code', 'i.rate', 'i.discount_amount', 'i.amount', 'i.tax_amount', 'i.tax_rate_percent', 'i.batch_no', 'i.expiry_date', 'i.parent_item_id', 'l.name as ledger'])
            ->map(fn ($i) => array_filter([
                'Item' => trim($i->description . ($i->variant_label && $i->variant_label !== 'Standard' ? ' — ' . $i->variant_label : '') . ($i->parent_item_id ? ' (part of a service)' : '')),
                'Quantity' => rtrim(rtrim(number_format((float) $i->quantity, 4, '.', ''), '0'), '.') . ($i->unit_code ? ' ' . $i->unit_code : ''),
                'Rate' => $n($i->rate), 'Discount' => $n($i->discount_amount) ?: null, 'Amount' => $n($i->amount),
                'Tax' => $n($i->tax_amount) ? number_format((float) $i->tax_amount, 2) . ($i->tax_rate_percent ? " ({$i->tax_rate_percent}%)" : '') : null,
                'Batch' => $i->batch_no, 'Expiry' => $i->expiry_date, 'Ledger' => $i->ledger,
            ], fn ($x) => $x !== null && $x !== ''))->values()->all();

        $entries = DB::table('voucher_entries as e')->leftJoin('ledgers as l', 'l.id', '=', 'e.ledger_id')->where('e.voucher_id', $v->id)->orderBy('e.id')
            ->get(['l.name', 'e.side', 'e.amount'])
            ->map(fn ($e) => ['Ledger' => $e->name, 'Amount' => number_format((float) $e->amount, 2) . ($e->side === 'D' ? ' Dr' : ' Cr')])->values()->all();

        $tenders = DB::table('voucher_tenders as t')->leftJoin('payment_methods as m', 'm.id', '=', 't.payment_method_id')->where('t.voucher_id', $v->id)->orderBy('t.id')
            ->get(['m.name', 't.amount', 't.reference'])
            ->map(fn ($t) => array_filter(['Method' => $t->name, 'Amount' => (float) $t->amount, 'Reference' => $t->reference], fn ($x) => $x !== null && $x !== ''))->values()->all();

        $bills = DB::table('voucher_bill_refs')->where('voucher_id', $v->id)->orderBy('id')->get(['ref_type', 'amount', 'against_voucher_id'])
            ->map(fn ($b) => ['Bill' => ucfirst($b->ref_type) . ($b->against_voucher_id ? ' against ' . DB::table('vouchers')->where('id', $b->against_voucher_id)->value('voucher_number') : ''), 'Amount' => number_format((float) $b->amount, 2)])->values()->all();

        return [
            'header' => array_filter([
                'Voucher type' => $v->type?->name, 'Voucher no.' => $v->voucher_number, 'Date' => $v->date?->toDateString(), 'Due date' => $v->due_date?->toDateString(),
                'Party' => $v->partyLedger?->name, 'Sold to / bought from' => $v->party_name, 'Phone' => $v->party_phone, 'Address' => $v->party_address, 'Tax ID' => $v->party_tax_id,
                'Branch' => $v->location?->name, 'Currency' => $v->currency?->code, 'Payment method' => $v->paymentMethod?->name,
                'Reference' => $v->reference_no, 'Supplier invoice no.' => $v->supplier_invoice_no, 'Promo code' => $promo, 'Rounding' => $v->meta['rounding'] ?? null,
                'Gift vouchers meant' => ! empty($v->meta['gift_codes']) ? implode(', ', $v->meta['gift_codes']) : null,
                'Narration' => $v->narration, 'Subtotal' => $n($v->subtotal), 'Tax' => $n($v->tax_total), 'Total' => $n($v->total_amount), 'Status' => $v->status,
            ], fn ($x) => $x !== null && $x !== ''),
            'items' => $items, 'entries' => $entries, 'payments' => $tenders, 'bills' => $bills,
        ];
    }

    private function ready(): bool
    {
        static $ok = null;

        return $ok ??= Schema::hasTable('voucher_versions');
    }
}
