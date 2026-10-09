<?php

namespace App\Services\Preorders;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Customer;
use App\Models\Location;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use Illuminate\Support\Facades\DB;

/** A preorder taken by staff in the shop: the same PRE- Sales Order as online, then optionally the Cash Sale (paid in full) or an Invoice on account. */
class CounterPreorder
{
    public function __construct(private PreorderService $preorders, private VoucherService $vouchers) {}

    /** @return array{order: Voucher, sale: ?Voucher} */
    public function take(array $d, ?User $staff): array
    {
        $locationId = (int) $d['location_id'];
        if (! Location::query()->sellsToCustomers()->whereKey($locationId)->exists()) {
            throw new BooksException('That branch does not take orders from customers.');
        }
        $customer = ! empty($d['customer_id']) ? Customer::findOrFail((int) $d['customer_id']) : null;
        if (($d['pay'] ?? 'none') === 'invoice' && (! $customer || ! $customer->has_credit_account)) {
            throw new BooksException('An invoice on account needs a customer who has a credit account.');
        }
        if (! $customer && empty($d['party_name'])) {
            throw new BooksException('Choose the customer, or type a name for a walk-in.');
        }
        $type = VoucherType::byBase(VoucherType::SALES_ORDER) ?? throw new BooksException('The Sales Order voucher type is switched off.');

        return DB::transaction(function () use ($d, $staff, $locationId, $customer, $type) {
            $lines = array_map(fn ($i) => ['variant_id' => (int) $i['variant_id'], 'quantity' => (float) $i['quantity']], $d['items']);
            $placeable = $this->preorders->assertPlaceable($lines, $locationId, $staff, true);

            $data = ['voucher_type_id' => $type->id, 'series_id' => $this->preorders->seriesId(), 'date' => today()->toDateString(), 'location_id' => $locationId, 'channel' => 'admin',
                'customer_id' => $customer?->id, 'party_name' => $customer ? null : ($d['party_name'] ?? null), 'party_phone' => $d['party_phone'] ?? null, 'narration' => $d['narration'] ?? null,
                'lines' => array_map(function ($l) {
                    $v = \App\Models\ProductVariant::findOrFail($l['variant_id']);

                    return ['type' => 'product', 'product_id' => $v->product_id, 'variant_id' => $v->id, 'quantity' => $l['quantity'], 'location_id' => null];
                }, $lines),
                'meta' => $this->preorders->orderMeta($placeable)];
            foreach ($data['lines'] as &$l) {
                $l['location_id'] = $locationId;
            }
            unset($l);
            $order = $this->vouchers->create($data, $staff);
            $this->preorders->record($order, $placeable, $locationId);

            $sale = null;
            if (($d['pay'] ?? 'none') === 'sale') {
                $sale = $this->vouchers->convert($order, VoucherType::CASH_SALE, ['tenders' => [['payment_method_id' => (int) $d['payment_method_id'], 'amount' => round((float) $order->total_amount, 2)]],
                    'reference_no' => $order->voucher_number], $staff);
            } elseif (($d['pay'] ?? 'none') === 'invoice') {
                $sale = $this->vouchers->convert($order, VoucherType::SALES, ['due_date' => today()->addDays((int) ($customer->credit_terms_days ?: 30))->toDateString(), 'reference_no' => $order->voucher_number], $staff);
            }
            $this->preorders->refresh(\App\Services\Preorders\PreorderService::variantsOf($placeable));

            return ['order' => $order, 'sale' => $sale];
        });
    }
}
