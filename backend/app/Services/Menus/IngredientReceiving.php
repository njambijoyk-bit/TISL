<?php

namespace App\Services\Menus;

use App\Models\Books\AccountingSetting;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Location;
use App\Models\Menus\Ingredient;
use App\Models\Menus\IngredientItem;
use App\Models\Menus\Receipt;
use App\Models\Menus\ReceiptLine;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use App\Services\CurrencyConversionService;
use Illuminate\Support\Facades\DB;

/**
 * Receiving ingredients: the supplier's goods in, as a Purchase voucher in the books and batches on Menus' own shelf.
 *   The books:  Dr Food Ingredients Inventory (and input tax)   Cr the supplier (a ledger under Sundry Creditors), or the cash or bank account when paid at once.
 *   The shelf:  one batch per line, in the ingredient's base unit, costed per base unit (before tax).
 * The Purchase voucher carries plain lines posted to the inventory account, so it is an ordinary supplier bill for payments, ageing and tax; it names its receipt, so it can only be
 * cancelled (which takes the stock back, if none of it has been used) and not edited. Opening stock is the same shelf with a Journal against the opening balance account.
 */
class IngredientReceiving
{
    public function __construct(private VoucherService $vouchers, private IngredientStock $stock, private CurrencyConversionService $money)
    {
    }

    /**
     * @param array{location_id?: ?int, date?: ?string, supplier_ledger_id?: ?int, paid_ledger_id?: ?int, payment_method_id?: ?int, supplier_invoice_no?: ?string, due_date?: ?string, narration?: ?string,
     *              lines: array<int, array{item_id: int, quantity: float, unit?: string, rate: float, tax_rate_id?: ?int, batch_no?: ?string, expiry_date?: ?string}>} $d
     */
    public function receive(array $d, ?User $by): Receipt
    {
        $type = VoucherType::byBase(VoucherType::PURCHASE) ?? throw new BooksException('The Purchase voucher type is switched off.');
        $location = $this->location($d);
        $lines = $this->lines($d['lines'] ?? []);
        if (empty($d['supplier_ledger_id']) && empty($d['paid_ledger_id']) && empty($d['payment_method_id'])) {
            throw new BooksException('Choose the supplier, or the cash or bank account it was paid from.');
        }
        $inventory = FoodLedgers::inventory();

        return DB::transaction(function () use ($d, $by, $type, $location, $lines, $inventory) {
            $date = $d['date'] ?? today()->toDateString();
            $voucher = $this->vouchers->create(array_filter([
                'voucher_type_id' => $type->id, 'date' => $date, 'location_id' => $location, 'party_ledger_id' => $d['supplier_ledger_id'] ?? null,
                'paid_ledger_id' => $d['paid_ledger_id'] ?? null, 'payment_method_id' => $d['payment_method_id'] ?? null, 'supplier_invoice_no' => $d['supplier_invoice_no'] ?? null,
                'due_date' => $d['due_date'] ?? null, 'narration' => $d['narration'] ?? 'Ingredients received', 'moves_stock' => false,   // the kitchen's own shelf holds this stock, not the product stock
                'lines' => array_map(fn ($l) => array_filter([
                    'type' => 'custom', 'description' => $l['label'], 'quantity' => $l['input_qty'], 'rate' => $l['rate'], 'ledger_id' => $inventory, 'tax_rate_id' => $l['tax_rate_id'],
                ], fn ($v) => $v !== null), $lines),
            ], fn ($v) => $v !== null), $by);

            $receipt = Receipt::create([
                'kind' => 'purchase', 'location_id' => $location, 'supplier_ledger_id' => $d['supplier_ledger_id'] ?? null, 'supplier_invoice_no' => $d['supplier_invoice_no'] ?? null, 'receipt_date' => $date,
                'voucher_id' => $voucher->id, 'status' => 'posted', 'narration' => $d['narration'] ?? null, 'subtotal' => (float) $voucher->subtotal, 'tax_total' => (float) $voucher->tax_total,
                'total' => (float) $voucher->total_amount, 'created_by' => $by?->id,
            ]);
            $this->shelve($receipt, $lines, $date, 'purchase', $by, $voucher);
            $voucher->update(['meta' => array_merge($voucher->meta ?? [], ['menus_receipt_id' => $receipt->id])]);

            return $receipt->load('lines');
        });
    }

    /**
     * Stock a kitchen starts with: the same shelf, and a Journal Dr Food Ingredients Inventory, Cr the opening balance account.
     *
     * @param array{location_id?: ?int, date?: ?string, narration?: ?string, lines: array<int, array{item_id: int, quantity: float, unit?: string, rate: float, batch_no?: ?string, expiry_date?: ?string}>} $d
     */
    public function opening(array $d, ?User $by): Receipt
    {
        $type = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');
        $location = $this->location($d);
        $lines = $this->lines($d['lines'] ?? [], false);
        $against = AccountingSetting::current()->opening_balance_ledger_id ?? throw new BooksException('Choose the opening balance account under Books, Settings, Default ledgers first: opening stock is booked against it.');
        $inventory = FoodLedgers::inventory();

        return DB::transaction(function () use ($d, $by, $type, $location, $lines, $against, $inventory) {
            $date = $d['date'] ?? today()->toDateString();
            $total = round(array_sum(array_column($lines, 'amount')), 2);
            $voucher = $this->vouchers->create([
                'voucher_type_id' => $type->id, 'date' => $date, 'currency_id' => $this->money->getBaseCurrency()->id, 'location_id' => $location,
                'narration' => $d['narration'] ?? 'Opening stock of ingredients',
                'entries' => [['ledger_id' => $inventory, 'side' => 'D', 'amount' => $total], ['ledger_id' => $against, 'side' => 'C', 'amount' => $total]],
            ], $by);
            $receipt = Receipt::create([
                'kind' => 'opening', 'location_id' => $location, 'receipt_date' => $date, 'voucher_id' => $voucher->id, 'status' => 'posted', 'narration' => $d['narration'] ?? null,
                'subtotal' => $total, 'tax_total' => 0, 'total' => $total, 'created_by' => $by?->id,
            ]);
            $this->shelve($receipt, $lines, $date, 'opening', $by);
            $voucher->update(['meta' => array_merge($voucher->meta ?? [], ['menus_receipt_id' => $receipt->id])]);

            return $receipt->load('lines');
        });
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

    /** Cancel a receipt from Menus: the voucher is cancelled in the books, which takes the stock back. */
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
     * @return array<int, array{item: IngredientItem, input_qty: float, unit: string, qty_base: float, rate: float, amount: float, cost_base: float, label: string, tax_rate_id: ?int, batch_no: ?string, expiry_date: ?string}>
     */
    private function lines(array $in, bool $withTax = true): array
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
                'tax_rate_id' => $withTax && ! empty($l['tax_rate_id']) ? (int) $l['tax_rate_id'] : null,
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

    /** Make the batches and the receipt lines. */
    private function shelve(Receipt $receipt, array $lines, string $date, string $source, ?User $by, ?Voucher $voucher = null): void
    {
        $taxes = $voucher ? $voucher->items()->orderBy('line_no')->pluck('tax_amount')->map(fn ($t) => (float) $t)->values()->all() : [];
        foreach (array_values($lines) as $i => $l) {
            $batch = $this->stock->receive($l['item'], (int) $receipt->location_id, $l['qty_base'], $l['cost_base'], [
                'batch_no' => $l['batch_no'], 'expiry_date' => $l['expiry_date'], 'date' => $date, 'source' => $source, 'receipt_id' => $receipt->id, 'voucher_id' => $receipt->voucher_id, 'by' => $by?->id,
            ]);
            ReceiptLine::create([
                'receipt_id' => $receipt->id, 'item_id' => $l['item']->id, 'input_qty' => $l['input_qty'], 'input_unit' => $l['unit'], 'qty_base' => $l['qty_base'], 'rate' => $l['rate'],
                'amount' => $l['amount'], 'tax_rate_id' => $l['tax_rate_id'], 'tax_amount' => $taxes[$i] ?? 0, 'batch_id' => $batch->id,
            ]);
        }
    }
}
