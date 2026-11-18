<?php

namespace App\Services\Projects\Links;

use App\Services\Projects\ProjectLinkTypes;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Books says what of its own can be attached to a project: a voucher (a quotation, a sales order, an invoice, a purchase...). This is how a
 * project carries its agreed value without holding a number: the quotation or sales order is linked, and its total is read from the books
 * every time it is shown.
 */
class BooksLinks
{
    public static function register(ProjectLinkTypes $types): void
    {
        $types->register('books.voucher', [
            'module' => null, 'label' => 'Voucher', 'plural' => 'Vouchers', 'permission' => 'books.view', 'value' => true,
            'states' => ['draft' => ['Draft', null], 'posted' => ['Posted', 'good'], 'approved' => ['Approved', 'good'], 'accepted' => ['Accepted', 'good'], 'declined' => ['Declined', 'problem'],
                'cancelled' => ['Cancelled', 'problem'], 'completed' => ['Completed', 'good'], 'delivered' => ['Delivered', 'good'], 'awaiting_payment' => ['Waiting for payment', 'warning']],
            // a quotation or a sales order is the agreed value of the work; a purchase or its order is from a supplier
            'role' => function (int $id): ?string {
                $base = Schema::hasColumn('voucher_types', 'base_type') ? DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->where('v.id', $id)->value('t.base_type') : null;

                return match ($base) { 'quotation', 'sales_order' => 'agreed_value', 'purchase', 'purchase_order' => 'supplier', default => null };
            },
            'search' => function (string $q): array {
                if (! Schema::hasTable('vouchers')) {
                    return [];
                }
                $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], trim($q)) . '%';

                return self::rows(DB::table('vouchers as v')->when(trim($q) !== '', fn ($w) => $w->where(fn ($x) => $x->where('v.voucher_number', 'like', $like)->orWhere('v.party_name', 'like', $like)->orWhere('v.reference_no', 'like', $like)))
                    ->orderByDesc('v.date')->orderByDesc('v.id')->limit(20))->map(fn ($r) => ['id' => $r['id'], 'title' => $r['title'], 'detail' => $r['detail']])->values()->all();
            },
            'describe' => fn (array $ids): array => Schema::hasTable('vouchers') ? self::rows(DB::table('vouchers as v')->whereIn('v.id', $ids))->keyBy('id')->all() : [],
        ]);
    }

    private static function rows($query)
    {
        $types = Schema::hasTable('voucher_types');
        $currencies = Schema::hasTable('currencies');

        return $query->when($types, fn ($q) => $q->leftJoin('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->addSelect('t.name as type_name'))
            ->when($currencies, fn ($q) => $q->leftJoin('currencies as c', 'c.id', '=', 'v.currency_id')->addSelect('c.code as currency_code'))
            ->addSelect('v.id', 'v.voucher_number', 'v.party_name', 'v.date', 'v.status', 'v.total_amount')->get()
            ->map(fn ($v) => ['id' => (int) $v->id, 'title' => trim(($v->type_name ?? 'Voucher') . ' ' . $v->voucher_number),
                'detail' => implode(' · ', array_filter([$v->party_name, $v->date ? substr((string) $v->date, 0, 10) : null, $v->status === 'cancelled' ? 'Cancelled' : null])) ?: null,
                'url' => '/admin/books/vouchers/' . $v->id, 'amount' => $v->total_amount === null ? null : (float) $v->total_amount, 'currency' => $v->currency_code ?? null, 'state' => $v->status ?: null]);
    }
}
