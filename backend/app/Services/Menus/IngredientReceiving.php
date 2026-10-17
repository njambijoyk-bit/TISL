<?php

namespace App\Services\Menus;

use App\Models\Books\AccountingSetting;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Location;
use App\Models\Menus\Ingredient;
use App\Models\Menus\IngredientItem;
use App\Models\Menus\Receipt;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use App\Services\CurrencyConversionService;
use Illuminate\Support\Facades\DB;

/**
 * Receiving ingredients: the supplier's goods in, as a Purchase voucher whose lines are the ingredient variants (item = the ingredient, variant = the variant, quantity in packs, the bigger
 * unit or the base unit, the rate the price of one of those). The books' own hooks put the lots on the kitchen's shelf (IngredientVoucherStock) and book the stock to Food Ingredients
 * Inventory, so a delivery made here and one typed on the Purchases screen are the same voucher. Opening stock is one Opening stock voucher for each ingredient variant, balanced
 * against the opening balance account like a product's. Cancelling a voucher takes its lots back, refused when some has been used.
 */
class IngredientReceiving
{
    public function __construct(private VoucherService $vouchers, private IngredientStock $stock, private CurrencyConversionService $money)
    {
    }

    /**
     * @param array{location_id?: ?int, date?: ?string, supplier_ledger_id?: ?int, paid_ledger_id?: ?int, payment_method_id?: ?int, supplier_invoice_no?: ?string, due_date?: ?string, narration?: ?string,
     *              lines: array<int, array{item_id: int, quantity: float, unit?: string, rate: float, batch_no?: ?string, expiry_date?: ?string}>} $d
     */
    public function receive(array $d, ?User $by): Voucher
    {
        $type = VoucherType::byBase(VoucherType::PURCHASE) ?? throw new BooksException('The Purchase voucher type is switched off.');
        $location = $this->location($d);
        $lines = $this->lines($d['lines'] ?? []);
        if (empty($d['supplier_ledger_id']) && empty($d['paid_ledger_id']) && empty($d['payment_method_id'])) {
            throw new BooksException('Choose the supplier, or the cash or bank account it was paid from.');
        }

        return DB::transaction(fn () => $this->vouchers->create(array_filter([
            'voucher_type_id' => $type->id, 'date' => $d['date'] ?? today()->toDateString(), 'location_id' => $location, 'party_ledger_id' => $d['supplier_ledger_id'] ?? null,
            'paid_ledger_id' => $d['paid_ledger_id'] ?? null, 'payment_method_id' => $d['payment_method_id'] ?? null, 'supplier_invoice_no' => $d['supplier_invoice_no'] ?? null,
            'due_date' => $d['due_date'] ?? null, 'narration' => $d['narration'] ?? 'Ingredients received',
            'lines' => array_map(fn ($l) => $this->voucherLine($l), $lines),
        ], fn ($v) => $v !== null), $by));
    }

    /**
     * Stock a kitchen starts with: one Opening stock voucher for each ingredient variant, balanced against the opening balance account, as products have. All of them or none.
     *
     * @param array{location_id?: ?int, date?: ?string, narration?: ?string, lines: array<int, array{item_id: int, quantity: float, unit?: string, rate: float, batch_no?: ?string, expiry_date?: ?string}>} $d
     * @return array<int, Voucher>
     */
    public function opening(array $d, ?User $by): array
    {
        $type = VoucherType::byBase(VoucherType::OPENING_STOCK) ?? throw new BooksException('The Opening stock voucher type is not set up yet: run script 24_purchase_batches_and_opening_stock.sql.');
        $location = $this->location($d);
        $lines = $this->lines($d['lines'] ?? []);
        $seen = [];
        foreach ($lines as $l) {
            if (isset($seen[$l['item']->id])) {
                throw new BooksException("{$l['item']->name} is listed twice. Add the two together: each variant gets one opening stock voucher.");
            }
            $seen[$l['item']->id] = true;
        }
        AccountingSetting::current()->opening_balance_ledger_id ?? throw new BooksException('Choose the opening balance account under Books, Settings, Default ledgers first: opening stock is balanced against it.');

        return DB::transaction(function () use ($d, $by, $type, $location, $lines) {
            $date = $d['date'] ?? today()->toDateString();

            return array_map(fn ($l) => $this->vouchers->create([
                'voucher_type_id' => $type->id, 'date' => $date, 'location_id' => $location, 'narration' => $d['narration'] ?? 'Opening stock of ingredients', 'lines' => [$this->voucherLine($l)],
            ], $by), $lines);
        });
    }

    /** One line as the books take it. */
    private function voucherLine(array $l): array
    {
        return array_filter([
            'type' => 'ingredient', 'ingredient_item_id' => $l['item']->id, 'quantity' => $l['input_qty'], 'unit' => $l['unit'], 'rate' => $l['rate'],
            'batch_no' => $l['batch_no'], 'expiry_date' => $l['expiry_date'],
        ], fn ($v) => $v !== null);
    }

    /** The books are cancelling the receipt's voucher: take its stock off the shelf first (refused when some has been used), and mark the receipt. Call inside the cancel's transaction. */
    public function beforeVoucherCancelled(Voucher $voucher, ?User $by): void
    {
        $receipt = Receipt::whereKey((int) ($voucher->meta['menus_receipt_id'] ?? 0))->lockForUpdate()->first();
        if (! $receipt || $receipt->status === 'cancelled') {
            return;
        }
        $this->stock->reverseReceipt($receipt, $by?->id);
        $receipt->update(['status' => 'cancelled', 'cancelled_at' => now()]);
    }

    /** Cancel a voucher that received ingredients: the books cancel it, which takes the lots back off the shelf (refused when some has been used). */
    public function cancelVoucher(Voucher $voucher, ?string $reason, ?User $by): Voucher
    {
        DB::transaction(fn () => $this->vouchers->cancel($voucher, $reason ?: 'Cancelled in Menus', $by));

        return $voucher->fresh();
    }

    /** Cancel an older receipt (made before ingredients had their own voucher lines): the voucher is cancelled in the books, which takes the stock back. */
    public function cancel(Receipt $receipt, ?string $reason, ?User $by): Receipt
    {
        if ($receipt->status === 'cancelled') {
            throw new BooksException('That receipt is already cancelled.');
        }
        $voucher = Voucher::findOrFail($receipt->voucher_id);
        DB::transaction(fn () => $this->vouchers->cancel($voucher, $reason ?: 'Receipt cancelled in Menus', $by));

        return $receipt->fresh('lines');
    }

    // ── lines ───────────────────────────────────────────────────────────

    private function location(array $d): int
    {
        $id = (int) ($d['location_id'] ?? 0) ?: (int) Location::default()?->id;
        if (! $id || ! DB::table('locations')->where('id', $id)->exists()) {
            throw new BooksException('Choose the branch the ingredients arrive at.');
        }

        return $id;
    }

    /**
     * Work out every line before anything is saved: the base quantity, the cost of one base unit, the label for the voucher.
     *
     * @return array<int, array{item: IngredientItem, input_qty: float, unit: string, qty_base: float, rate: float, amount: float, cost_base: float, label: string, batch_no: ?string, expiry_date: ?string}>
     */
    private function lines(array $in): array
    {
        if (! $in) {
            throw new BooksException('Add at least one ingredient to receive.');
        }
        $out = [];
        foreach (array_values($in) as $n => $l) {
            $row = $n + 1;
            $item = IngredientItem::with('ingredient.baseUnit', 'ingredient.altUnit')->find((int) ($l['item_id'] ?? 0));
            if (! $item || ! $item->ingredient) {
                throw new BooksException("Line {$row}: choose an ingredient variant.");
            }
            if (! $item->is_active || ! $item->ingredient->is_active) {
                throw new BooksException("Line {$row}: {$item->name} is switched off.");
            }
            $qty = round((float) ($l['quantity'] ?? 0), 4);
            $rate = round((float) ($l['rate'] ?? -1), 4);
            if ($qty <= 0) {
                throw new BooksException("Line {$row}: enter how much of {$item->name} arrived.");
            }
            if ($rate < 0) {
                throw new BooksException("Line {$row}: enter what one ".$this->unitWord($item, (string) ($l['unit'] ?? 'base'))." of {$item->name} cost (0 if it was free).");
            }
            $unit = (string) ($l['unit'] ?? 'base');
            $base = $this->toBase($item, $unit, $qty);
            $amount = round($qty * $rate, 2);
            $out[] = [
                'item' => $item, 'input_qty' => $qty, 'unit' => $unit, 'qty_base' => $base, 'rate' => $rate, 'amount' => $amount, 'cost_base' => $base > 0 ? $amount / $base : 0.0,
                'label' => trim($item->ingredient->name.' – '.$item->name.': '.rtrim(rtrim(number_format($qty, 4, '.', ''), '0'), '.').' '.$this->unitWord($item, $unit, $qty)),
                'batch_no' => isset($l['batch_no']) && trim((string) $l['batch_no']) !== '' ? mb_substr(trim((string) $l['batch_no']), 0, 60) : null,
                'expiry_date' => ! empty($l['expiry_date']) ? (string) $l['expiry_date'] : null,
            ];
            if ($item->track_expiry && ! $out[$n]['expiry_date']) {
                throw new BooksException("Line {$row}: {$item->name} expires, so enter the expiry date of what arrived.");
            }
        }

        return $out;
    }

    /** Packs, the alternate unit or the base unit, as typed, in the base unit. */
    public function toBase(IngredientItem $item, string $unit, float $qty): float
    {
        $item->loadMissing('ingredient.baseUnit', 'ingredient.altUnit');

        return $item->toBase($unit, $qty);
    }

    private function unitWord(IngredientItem $item, string $unit, float $qty = 1): string
    {
        $ing = $item->ingredient;

        return match ($unit) { 'pack' => $qty == 1.0 ? 'pack' : 'packs', 'alt' => $ing->altUnit?->code ?? '', default => $ing->baseUnit?->code ?? '' };
    }
}
