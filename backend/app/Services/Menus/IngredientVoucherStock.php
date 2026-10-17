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

        /**
     * What a voucher that was just saved does to the shelf, inside the books' transaction (a refused line refuses the voucher). A Purchase, Goods received or Opening stock voucher puts a lot on
     * the shelf for each ingredient line; a Debit Note takes the quantity sent back out of the lots of the delivery it is against. `$moves` says how much of each line (voucher_item_id => base
     * units) really moves stock (a purchase made from a delivery moves none, a debit note that only corrects a price moves none); without it every line moves its whole quantity.
     * `$family` is the vouchers in the same chain as the one a debit note is against, whose lots it may take from.
     *
     * @param array<int, float>|null $moves
     * @param array<int, int> $family
     */
    public function apply(Voucher $v, ?User $by, ?array $moves = null, array $family = []): void
    {
        if (! self::installed()) {
            return;
        }
        $v->loadMissing('type');
        $base = $v->type?->base_type;
        $items = $v->items()->where('item_type', 'ingredient')->whereNotNull('ingredient_item_id')->where('is_header', false)->get();
        if ($items->isEmpty()) {
            return;
        }
        $loc = (int) ($v->location_id ?: \App\Models\Location::default()?->id);
        $date = $v->date instanceof Carbon ? $v->date->toDateString() : (string) $v->date;
        if ($base === VoucherType::DEBIT_NOTE) {
            foreach ($items as $it) {
                $qty = round((float) ($moves[$it->id] ?? 0), 4);
                if ($qty > 0 && (bool) $v->moves_stock) {
                    $item = IngredientItem::find($it->ingredient_item_id);
                    $this->stock->returnToSupplier($item ?? throw new BooksException('That ingredient does not exist any more.'), $loc, $qty, $family, (int) $v->id, $date, $by?->id, trim("{$v->voucher_number}"));
                }
            }

            return;
        }
        if (! in_array($base, [VoucherType::PURCHASE, VoucherType::RECEIPT_NOTE, VoucherType::OPENING_STOCK], true) || (bool) $v->moves_stock === false) {
            return;
        }
        $opening = $base === VoucherType::OPENING_STOCK;
        foreach ($items as $it) {
            $item = IngredientItem::find($it->ingredient_item_id);
            $all = round((float) $it->base_quantity, 4);
            $qty = $moves === null ? $all : round((float) ($moves[$it->id] ?? 0), 4);
            if (! $item || $all <= 0 || $qty <= 0) {
                continue;
            }
            $cost = round((float) $it->amount * ((float) ($v->exchange_rate ?? 1) ?: 1.0) / $all, 6);   // after discount, before tax, in the base currency
            $this->stock->receive($item, $loc, $qty, $cost, [
                'batch_no' => $it->batch_no, 'expiry_date' => $it->expiry_date ? Carbon::parse($it->expiry_date)->toDateString() : null, 'date' => $date, 'source' => $opening ? 'opening' : 'purchase',
                'voucher_id' => (int) $v->id, 'voucher_item_id' => (int) $it->id, 'by' => $by?->id, 'note' => $opening ? null : trim("{$v->voucher_number}"),
            ]);
        }
    }

    /** The voucher is being changed or cancelled: what it brought in leaves the shelf, what it sent back returns (the books apply it again afterwards if it is only changed). */
    public function undo(Voucher $v, ?User $by): void
    {
        if (! self::installed()) {
            return;
        }
        $this->stock->reverseVoucher((int) $v->id, $by?->id);
        $this->stock->reverseSupplierReturn((int) $v->id, $by?->id);
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
