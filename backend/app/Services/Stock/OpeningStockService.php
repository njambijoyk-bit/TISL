<?php

namespace App\Services\Stock;

use App\Models\Books\VoucherType;
use App\Models\Location;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use Illuminate\Http\Request;

/**
 * Stock typed in when an item is created arrives the proper way: as an Opening stock voucher, so the quantity, its movement,
 * its batch and the books all agree from the first day. After that the quantity is not typed any more — it moves with
 * vouchers (purchase, goods received, sale…), a stock count, a write-off or a transfer.
 */
class OpeningStockService
{
    /** Refuse early (before anything is saved) when a quantity is entered without what it cost, or without batch details it needs. */
    public function assertEntered(Request $request, bool $tracksExpiry): void
    {
        $qty = (float) ($request->input('stock_quantity') ?? 0);
        if ($qty <= 0) {
            return;
        }
        if (! $request->filled('opening_cost') || (float) $request->input('opening_cost') < 0) {
            throw new BooksException('Enter what each unit cost, so the opening stock can be valued (0 is allowed if it was free).');
        }
        if ($tracksExpiry && (! $request->filled('opening_batch_no') || ! $request->filled('opening_expiry_date'))) {
            throw new BooksException('This item expires: enter the batch number and expiry date of the stock you are starting with.');
        }
    }

    /** Is there a quantity in the request to start the item with? */
    public function wants(Request $request): bool
    {
        return (float) ($request->input('stock_quantity') ?? 0) > 0;
    }

    /**
     * Write one Opening stock voucher for a variant at the main branch (or the given one).
     *
     * @param  array{quantity:float,cost:float,batch_no?:?string,expiry_date?:?string,mfg_date?:?string,location_id?:?int,date?:?string}  $o
     */
    public function post(ProductVariant $variant, array $o, ?User $user = null)
    {
        $type = VoucherType::byBase(VoucherType::OPENING_STOCK)
            ?? throw new BooksException('The Opening stock voucher type is not set up yet — run script 24_purchase_batches_and_opening_stock.sql.');
        $location = $o['location_id'] ?? Location::default()?->id;

        return app(VoucherService::class)->create([
            'voucher_type_id' => $type->id, 'date' => $o['date'] ?? today()->toDateString(), 'location_id' => $location,
            'narration' => 'Opening stock entered when the item was created',
            'lines' => [[
                'type' => 'product', 'variant_id' => $variant->id, 'quantity' => (float) $o['quantity'], 'rate' => (float) $o['cost'], 'discount' => 0,
                'batch_no' => $o['batch_no'] ?? null, 'mfg_date' => $o['mfg_date'] ?? null, 'expiry_date' => $o['expiry_date'] ?? null,
            ]],
        ], $user);
    }

    /** Same, reading the fields the product and variant forms send. */
    public function postFromRequest(ProductVariant $variant, Request $request, ?User $user = null)
    {
        return $this->post($variant, [
            'quantity' => (float) $request->input('stock_quantity'), 'cost' => (float) $request->input('opening_cost'),
            'batch_no' => $request->input('opening_batch_no'), 'expiry_date' => $request->input('opening_expiry_date'), 'mfg_date' => $request->input('opening_mfg_date'),
        ], $user);
    }
}
