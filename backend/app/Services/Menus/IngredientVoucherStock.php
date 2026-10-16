<?php

namespace App\Services\Menus;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Menus\IngredientItem;
use App\Models\User;
use App\Services\Books\BooksException;
use Carbon\Carbon;
use Illuminate\Support\Facades\Schema;

/**
 * What a voucher's ingredient lines do to the kitchen's shelf, as the books save and cancel it: a Purchase, Goods received or Opening stock voucher puts a lot on the shelf for each
 * ingredient line (base unit quantity, cost of one base unit before tax, batch and expiry from the line); cancelling the voucher takes them off again, refused when some has been used.
 * Same hooks as products have, so the stock journal and the reports see ingredients arrive the same way.
 */
class IngredientVoucherStock
{
    public function __construct(private IngredientStock $stock)
    {
    }

    public static function installed(): bool
    {
        return IngredientStock::installed() && Schema::hasColumn('voucher_items', 'ingredient_item_id') && Schema::hasColumn('menus_stock_batches', 'voucher_id');
    }

    /** Does this voucher bring stock in? A purchase order and a quotation only plan it. */
    private function brings(Voucher $v): bool
    {
        $v->loadMissing('type');

        return (bool) $v->moves_stock !== false && in_array($v->type?->base_type, [VoucherType::PURCHASE, VoucherType::RECEIPT_NOTE, VoucherType::OPENING_STOCK], true);
    }

    /** Put the lots of a voucher that was just saved on the shelf. Inside the books' transaction: a refused line refuses the voucher. */
    public function apply(Voucher $v, ?User $by): void
    {
        if (! self::installed() || ! $this->brings($v)) {
            return;
        }
        $items = $v->items()->where('item_type', 'ingredient')->whereNotNull('ingredient_item_id')->where('is_header', false)->get();
        if ($items->isEmpty()) {
            return;
        }
        $loc = (int) ($v->location_id ?: \App\Models\Location::default()?->id);
        $date = $v->date instanceof Carbon ? $v->date->toDateString() : (string) $v->date;
        $opening = $v->type->base_type === VoucherType::OPENING_STOCK;
        foreach ($items as $it) {
            $item = IngredientItem::find($it->ingredient_item_id);
            $base = round((float) $it->base_quantity, 4);
            if (! $item || $base <= 0) {
                continue;
            }
            $cost = round((float) $it->amount * ((float) ($v->exchange_rate ?? 1) ?: 1.0) / $base, 6);   // after discount, before tax, in the base currency
            $this->stock->receive($item, $loc, $base, $cost, [
                'batch_no' => $it->batch_no, 'expiry_date' => $it->expiry_date ? Carbon::parse($it->expiry_date)->toDateString() : null, 'date' => $date, 'source' => $opening ? 'opening' : 'purchase',
                'voucher_id' => (int) $v->id, 'voucher_item_id' => (int) $it->id, 'by' => $by?->id, 'note' => $opening ? null : trim("{$v->voucher_number}"),
            ]);
        }
    }

    /** The voucher is being changed or cancelled: what it brought in leaves the shelf (the books apply it again afterwards if it is only changed). */
    public function undo(Voucher $v, ?User $by): void
    {
        if (! self::installed()) {
            return;
        }
        $this->stock->reverseVoucher((int) $v->id, $by?->id);
    }

    /** Has an ingredient line? (a voucher that has one cannot be returned to the supplier from here.) */
    public static function hasLines(Voucher $v): bool
    {
        return self::installed() && $v->items()->where('item_type', 'ingredient')->exists();
    }

    /** @throws BooksException */
    public function assertCanApply(): void
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 187_menus_core_stock.sql first: ingredients on vouchers need it.');
        }
    }
}
