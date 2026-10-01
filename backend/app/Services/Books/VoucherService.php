<?php

namespace App\Services\Books;

use App\Services\PromoCodeService;
use App\Models\Books\AccountingSetting;
use App\Models\Books\Ledger;
use App\Models\Books\PaymentMethod;
use App\Models\Books\StockMovement;
use App\Models\StockBatch;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherAuditLog;
use App\Models\Books\VoucherBillRef;
use App\Models\Books\VoucherEntry;
use App\Models\Books\VoucherItem;
use App\Models\Books\VoucherItemTax;
use App\Models\Books\GiftVoucher;
use App\Models\Books\VoucherTender;
use App\Models\Books\VoucherType;
use App\Models\ShippingOption;
use App\Models\Currency;
use App\Models\Customer;
use App\Models\Hamper;
use App\Models\Location;
use App\Models\ProductVariant;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\User;
use App\Services\CurrencyConversionService;
use App\Services\Location\VariantStockService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The voucher engine. One place that turns "what was sold / paid / journalled"
 * into a numbered, balanced, period-checked voucher: item lines (products, services,
 * hampers with their components, charges), per-line tax onto the right tax ledgers,
 * the ledger entries, bill-by-bill references, stock movements, and the order →
 * delivery → invoice / cash sale → receipt chain.
 */
class VoucherService
{
    /** Marks the automatic rounding line so an edit form can leave it out and work it out again. */
    public const ROUNDING_NOTE = '__rounding';

    public function __construct(
        private NumberingService $numbering,
        private PeriodGuard $guard,
        private LedgerService $ledgers,
        private TaxLineService $taxes,
        private VariantStockService $stock,
        private CurrencyConversionService $money,
    ) {}

    // =====================================================================
    // PUBLIC API
    // =====================================================================

    /** Everything a save would produce — lines, tax, entries, totals — without saving. */
    public function preview(array $data, ?User $user = null): array
    {
        $type = $this->typeFrom($data);
        $plan = $this->plan($data, $type, null, $user);
        $this->guard->assert('create', $plan['date'], $user, $type->id);
        if ($plan['moves_stock']) {
            $est = $this->estimateAllocations($plan['stock']);
            $plan['entries'] = array_merge($plan['entries'], $this->cogsEntries($plan, $est));   // what the batches would cost
            if ($type->isSalesSide()) {
                $plan['warnings'] = $this->expiredWarnings($est);
            }
        }

        return $this->describe($plan);
    }

    public function create(array $data, ?User $user = null): Voucher
    {
        $type = $this->typeFrom($data);

        return DB::transaction(function () use ($data, $type, $user) {
            $plan = $this->plan($data, $type, null, $user);
            $this->guard->assert('create', $plan['date'], $user, $type->id);

            $voucher = $this->persist($plan, $data, $user, null);
            $this->audit($voucher, 'created', $user);
            $this->versionHook($voucher, 'created', $user);
            $this->rewardHook($voucher);
            $this->promoHook($voucher);
            app(WithholdingRegisterService::class)->sync($voucher);
            app(GiftVoucherService::class)->activateFromSale($voucher, $user);
            app(InstrumentService::class)->sync($voucher, $data);   // the cheque / transfer reference or the slip
            if (! empty($data['apply_credit'])) {   // the customer's / supplier's overpayment or advance, ticked on the form or remembered on the order
                app(CreditService::class)->applyIfAny($voucher, is_array($data['apply_credit']) ? array_map('intval', $data['apply_credit']) : null, $user);
            }

            return $voucher->load($this->relations());
        });
    }

    public function alter(Voucher $voucher, array $data, ?User $user): Voucher
    {
        return DB::transaction(function () use ($voucher, $data, $user) {
            $voucher = Voucher::whereKey($voucher->id)->lockForUpdate()->firstOrFail();
            if ($voucher->status === Voucher::CANCELLED) {
                throw new BooksException('A cancelled voucher can not be edited.');
            }
            $this->guard->assertVoucher('edit', $voucher, $user);
            app(InstrumentService::class)->assertEditable($voucher, 'edit');
            if (! empty($voucher->meta['cash_count'])) {
                throw new BooksException('A cash-count adjustment can not be edited. Cancel it and count again.');
            }
            if (! empty($voucher->meta['bounce'])) {
                throw new BooksException('A bounced-cheque entry can not be edited. Cancel it in the cheque register (the cheque goes back to how it was) and bounce it again.');
            }
            if (! empty($voucher->meta['returned_from'])) {
                throw new BooksException('A note made from an invoice keeps that invoice\'s prices and taxes, so it can not be edited. Cancel it and write it again with the right lines.');
            }
            if (! empty($voucher->meta['writeoff'])) {
                throw new BooksException('A write-off can not be edited. Cancel it (the invoice opens again) and write off the right amount.');
            }
            app(CreditService::class)->releaseForBill($voucher);   // credit applied to it goes back to the party's account; apply again after the edit
            $this->assertNoLiveChildren($voucher, 'edit');
            if (! $voucher->type->has_items && StockMovement::where('voucher_id', $voucher->id)->exists()) {
                throw new BooksException('This voucher wrote stock off, so it can not be edited. Cancel it (the stock comes back) and write the stock off again.');
            }

            $type = $voucher->type;
            $data['voucher_type_id'] = $type->id;
            $data['source_voucher_id'] = $data['source_voucher_id'] ?? $voucher->source_voucher_id;
            $plan = $this->plan($data, $type, $voucher, $user);
            $this->guard->assert('edit', $plan['date'], $user, $type->id);

            $this->versionHook($voucher, null, $user);   // keep what it looks like now as version 1 if it has no history yet
            $this->undoRewards($voucher);   // its points, spend, order count and promo use are worked out again from the new figures
            $this->reverseEffects($voucher);
            $voucher->items()->delete();
            $voucher->entries()->delete();
            $voucher->billRefs()->delete();

            $before = $voucher->only(['date', 'total_amount', 'party_ledger_id', 'narration']);
            $voucher = $this->persist($plan, $data, $user, $voucher);
            $this->audit($voucher, 'altered', $user, ['before' => $before]);
            $this->versionHook($voucher, 'altered', $user);
            $this->rewardHook($voucher);
            $this->promoHook($voucher);
            app(WithholdingRegisterService::class)->sync($voucher);
            app(GiftVoucherService::class)->activateFromSale($voucher, $user);
            app(InstrumentService::class)->sync($voucher, $data);

            return $voucher->load($this->relations());
        });
    }

    public function cancel(Voucher $voucher, ?string $reason, ?User $user): Voucher
    {
        return DB::transaction(function () use ($voucher, $reason, $user) {
            $voucher = Voucher::whereKey($voucher->id)->lockForUpdate()->firstOrFail();
            if ($voucher->status === Voucher::CANCELLED) {
                throw new BooksException('That voucher is already cancelled.');
            }
            $this->guard->assertVoucher('cancel', $voucher, $user);
            app(InstrumentService::class)->assertEditable($voucher, 'cancel');
            app(CreditService::class)->releaseForBill($voucher);   // credit applied to it goes back to the party's account
            $this->assertNoLiveChildren($voucher, 'cancel');
            if ((float) ($voucher->meta['gift_refunded'] ?? 0) > 0.005) {
                throw new BooksException('Part of this credit note was refunded as a gift voucher (' . implode(', ', $voucher->meta['gift_vouchers'] ?? []) . '). Cancel those gift vouchers first.');
            }

            $this->versionHook($voucher, null, $user);
            app(WithholdingRegisterService::class)->void($voucher);   // refuses when part of its credit was already cleared
            $this->reverseEffects($voucher);
            $voucher->update([
                'status' => Voucher::CANCELLED, 'cancelled_at' => now(), 'cancelled_by' => $user?->id,
                'cancel_reason' => $reason, 'fulfilment_status' => $voucher->fulfilment_status ? 'closed' : null,
            ]);
            $this->audit($voucher, 'cancelled', $user, ['reason' => $reason]);
            app(InstrumentService::class)->void($voucher);
            if (! empty($voucher->meta['bounce'])) {
                app(ChequeService::class)->onBounceCancelled($voucher);   // the cheque goes back to how it was
            }
            if (! empty($voucher->meta['cash_count'])) {
                app(CashCountService::class)->onAdjustmentCancelled($voucher);   // the count stays; its difference is open again
            }
            $this->versionHook($voucher, 'deleted', $user);
            $this->undoRewards($voucher);

            return $voucher->load($this->relations());
        });
    }

    // ── returns: credit note / debit note against an invoice ─────────────

    /** The note a document is reversed with: a sales invoice by a credit note, a purchase by a debit note. */
    private function returnBase(Voucher $source): string
    {
        $source->loadMissing('type');
        $base = $source->type->base_type;
        if (! in_array($base, [VoucherType::SALES, VoucherType::PURCHASE], true)) {
            throw new BooksException('A credit note is made against a sales invoice and a debit note against a purchase. (For a cash sale or a cash purchase, write a credit / debit note without an invoice for now.)');
        }
        if ($source->status !== Voucher::POSTED) {
            throw new BooksException('Only a live invoice can be credited.');
        }
        // A written-off invoice is one we gave up collecting: a credit note on top would leave the customer with a credit for money they never paid.
        $writtenOff = DB::table('voucher_bill_refs as b')->join('vouchers as j', 'j.id', '=', 'b.voucher_id')
            ->where('b.against_voucher_id', $source->id)->where('b.ref_type', 'against')->where('j.status', Voucher::POSTED)->pluck('j.meta', 'j.voucher_number')
            ->filter(fn ($m) => ! empty(json_decode((string) $m, true)['writeoff'] ?? null))->keys()->first();
        if ($writtenOff) {
            throw new BooksException("{$source->voucher_number} was written off ({$writtenOff}). Cancel the write-off first, then write the credit note; whatever is still unpaid can be written off again.");
        }
        if (! $source->party_ledger_id) {
            throw new BooksException("{$source->voucher_number} has no customer or supplier account, so a note can not be written against it.");
        }

        return $base === VoucherType::SALES ? VoucherType::CREDIT_NOTE : VoucherType::DEBIT_NOTE;
    }

    /** How much (net amount) of each top line of the document earlier live notes already reversed. @return array<int, float> */
    private function reversedAmounts(Voucher $source): array
    {
        return DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')
            ->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->where('v.source_voucher_id', $source->id)->where('v.status', Voucher::POSTED)
            ->whereIn('t.base_type', [VoucherType::CREDIT_NOTE, VoucherType::DEBIT_NOTE])
            ->whereNotNull('i.source_item_id')->whereNull('i.parent_item_id')
            ->groupBy('i.source_item_id')->selectRaw('i.source_item_id as id, SUM(ABS(i.amount)) as amt')
            ->pluck('amt', 'id')->map(fn ($v) => (float) $v)->all();
    }

    /**
     * What can still be reversed on an invoice, line by line: the quantity and amount sold, what earlier notes
     * took back, and what is left. Charges (delivery, discounts) are lines too.
     */
    public function returnable(Voucher $source): array
    {
        $noteBase = $this->returnBase($source);
        $items = $source->items()->with('taxes')->get();
        $done = $this->reversedAmounts($source);
        $lines = [];
        foreach ($items->whereNull('parent_item_id') as $it) {
            if ($it->notes === self::ROUNDING_NOTE) {
                continue;
            }
            $kids = $items->where('parent_item_id', $it->id);
            $amount = round(abs((float) ($it->is_header ? $kids->sum('amount') : $it->amount)), 2);
            $tax = round((float) ($it->is_header ? $kids->sum('tax_amount') : $it->tax_amount), 2);
            $reversed = round($done[$it->id] ?? 0.0, 2);
            $left = max(0.0, round($amount - $reversed, 2));
            $share = $amount > 0 ? $left / $amount : ($reversed > 0 ? 0.0 : 1.0);
            $qty = (float) $it->quantity;
            $isCharge = $it->item_type === 'charge';
            $lines[] = [
                'id' => $it->id, 'item_type' => $it->item_type, 'description' => $it->description, 'variant_label' => $it->variant_label, 'unit_code' => $it->unit_code,
                'is_header' => (bool) $it->is_header, 'is_charge' => $isCharge, 'negative' => (float) ($it->is_header ? $kids->sum('amount') : $it->amount) < 0,
                'quantity' => $qty, 'rate' => (float) $it->rate, 'amount' => $amount, 'tax_amount' => $tax, 'tax_percent' => $it->tax_rate_percent !== null ? (float) $it->tax_rate_percent : null,
                'reversed_amount' => $reversed, 'available_amount' => $left, 'available_quantity' => round($qty * $share, 4),
                'reversed_quantity' => round($qty - $qty * $share, 4),
                'can_return_stock' => ! $isCharge && ! $it->is_header && (bool) $it->variant_id && $it->item_type === 'product',
            ];
        }

        return ['source' => ['id' => $source->id, 'voucher_number' => $source->voucher_number, 'date' => $source->date?->toDateString(), 'party' => $source->partyLedger?->name, 'total' => (float) $source->total_amount],
            'note_base' => $noteBase, 'lines' => $lines];
    }

    /**
     * Write the credit / debit note against an invoice. The lines come from the invoice — its prices, discounts and taxes at
     * the original rates — and only what is picked is reversed.
     *
     * @param  array  $opts  lines: [{item_id, mode: return|adjust|writeoff, quantity?, amount?}], date, narration, reference_no, reason
     */
    public function createReturn(Voucher $source, array $opts, ?User $user = null): Voucher
    {
        $noteBase = $this->returnBase($source);
        $type = VoucherType::byBase($noteBase) ?? throw new BooksException('That voucher type is switched off.');
        $picked = collect($opts['lines'] ?? [])->keyBy(fn ($l) => (int) ($l['item_id'] ?? 0));
        if ($picked->isEmpty()) {
            throw new BooksException('Pick at least one line to reverse.');
        }

        return DB::transaction(function () use ($source, $type, $noteBase, $picked, $opts, $user) {
            $source = Voucher::whereKey($source->id)->lockForUpdate()->firstOrFail();
            $items = $source->items()->with('taxes')->get();
            $done = $this->reversedAmounts($source);
            $sale = $noteBase === VoucherType::CREDIT_NOTE;
            $lines = [];
            $written = [];
            $stockLines = false;

            foreach ($items->whereNull('parent_item_id') as $it) {
                $p = $picked->get($it->id);
                if (! $p) {
                    continue;
                }
                $mode = in_array(($p['mode'] ?? 'return'), ['return', 'adjust', 'writeoff'], true) ? ($p['mode'] ?? 'return') : 'return';
                if ($it->item_type === 'charge' || $it->is_header) {
                    $mode = $mode === 'writeoff' ? 'return' : $mode;
                }
                $kids = $items->where('parent_item_id', $it->id);
                $amount = round(abs((float) ($it->is_header ? $kids->sum('amount') : $it->amount)), 2);
                $left = max(0.0, round($amount - ($done[$it->id] ?? 0.0), 2));
                $q0 = (float) $it->quantity;
                if ($mode === 'adjust' || $it->item_type === 'charge') {
                    $take = round((float) ($p['amount'] ?? $left), 2);
                    if ($take <= 0 || $take - $left > 0.005) {
                        throw new BooksException("{$it->description}: you can reverse at most " . number_format($left, 2) . '.');
                    }
                    $ratio = $amount > 0 ? min(1.0, $take / $amount) : 1.0;
                } else {
                    $qty = round((float) ($p['quantity'] ?? 0), 4);
                    $maxQty = $amount > 0 ? round($q0 * $left / $amount, 4) : $q0;
                    if ($qty <= 0 || $qty - $maxQty > 0.00005) {
                        throw new BooksException("{$it->description}: you can take back at most " . rtrim(rtrim(number_format($maxQty, 4, '.', ''), '0'), '.') . '.');
                    }
                    $ratio = $q0 > 0 ? $qty / $q0 : 1.0;
                }
                $cq = round($q0 * $ratio, 4);
                $goods = $mode === 'return' && ! $it->is_header && $it->item_type === 'product' && $it->variant_id;

                if ($it->is_header) {
                    $child = [];
                    foreach ($kids as $c) {
                        $child[] = $this->cloneLine($c, round((float) $c->quantity * $ratio, 4), $ratio, 0.0);
                    }
                    $line = $this->cloneLine($it, $cq, $ratio, 0.0);
                    $line['children'] = $child;
                    $line['amount'] = round(array_sum(array_column($child, 'amount')), 2);
                    $line['tax_amount'] = round(array_sum(array_column($child, 'tax_amount')), 2);
                    $line['taxes'] = [];
                    $lines[] = $line;
                    continue;
                }
                $line = $this->cloneLine($it, $cq, $ratio, $goods ? $cq : 0.0);
                if ($goods) {
                    $stockLines = true;
                    if (! $sale) {
                        // goods going back to the supplier leave from the batch they arrived in
                        $batch = StockMovement::where('voucher_item_id', $it->id)->where('quantity', '>', 0)->whereNotNull('batch_id')->value('batch_id');
                        if ($batch) {
                            $line['pick_batch_id'] = (int) $batch;
                        }
                    }
                }
                if ($mode === 'writeoff') {
                    $line['notes'] = trim(($line['notes'] ? $line['notes'] . ' · ' : '') . 'Returned damaged — written off, not back in stock');
                    $written[] = ['description' => $it->description, 'quantity' => $cq];
                } elseif ($mode === 'adjust' && $it->item_type !== 'charge') {
                    $line['notes'] = trim(($line['notes'] ? $line['notes'] . ' · ' : '') . 'Price adjustment — no goods returned');
                }
                $lines[] = $line;
                foreach ($kids as $c) {   // a service's materials go with it: no stock back
                    $m = $this->cloneLine($c, round((float) $c->quantity * $ratio, 4), $ratio, 0.0);
                    $m['under_service'] = true;
                    $lines[] = $m;
                }
            }
            if (! $lines) {
                throw new BooksException('Nothing to reverse on those lines.');
            }

            $reason = trim((string) ($opts['reason'] ?? ''));
            $data = [
                'voucher_type_id' => $type->id, 'date' => $opts['date'] ?? Carbon::today()->toDateString(),
                'location_id' => $source->location_id, 'customer_id' => $source->customer_id, 'party_ledger_id' => $source->party_ledger_id,
                'currency_id' => $source->currency_id, 'exchange_rate' => $source->exchange_rate,
                'reference_no' => $opts['reference_no'] ?? $source->voucher_number, 'supplier_invoice_no' => null,
                'party_name' => $source->party_name, 'party_phone' => $source->party_phone, 'party_address' => $source->party_address, 'party_tax_id' => $source->party_tax_id,
                'narration' => $opts['narration'] ?? (($sale ? 'Credit' : 'Debit') . " note against {$source->voucher_number}" . ($reason !== '' ? " — {$reason}" : '')),
                'channel' => 'admin', 'source_voucher_id' => $source->id, 'lines_resolved' => $lines, 'moves_stock' => $stockLines,
                'meta' => array_filter(['returned_from' => $source->voucher_number, 'return_reason' => $reason ?: null, 'written_off_goods' => $written ?: null]),
            ];
            $note = $this->create($data, $user);
            $this->audit($source, $sale ? 'credited' : 'debited', $user, ['note' => $note->voucher_number]);

            return $note->load($this->relations());
        });
    }

    /**
     * Sales Order → Delivery Note | Sales | Cash Sale, or Delivery Note → Sales | Cash Sale.
     * Stock moves once: a delivery note moves it; documents made from a delivery don't;
     * an invoice/cash sale from an order moves only what wasn't delivered.
     *
     * @param  array  $opts  date, payment_method_id, lines: {sourceItemId: quantity}, narration, reference_no
     */
    public function convert(Voucher $source, string $targetBase, array $opts = [], ?User $user = null): Voucher
    {
        $allowed = [
            VoucherType::QUOTATION     => [VoucherType::SALES_ORDER, VoucherType::SALES],
            VoucherType::SALES_ORDER   => [VoucherType::DELIVERY_NOTE, VoucherType::SALES, VoucherType::CASH_SALE],
            VoucherType::DELIVERY_NOTE => [VoucherType::SALES, VoucherType::CASH_SALE],
            VoucherType::PURCHASE_ORDER => [VoucherType::RECEIPT_NOTE, VoucherType::PURCHASE],
            VoucherType::RECEIPT_NOTE  => [VoucherType::PURCHASE],
        ];
        $sourceBase = $source->type->base_type;
        if (! in_array($targetBase, $allowed[$sourceBase] ?? [], true)) {
            throw new BooksException("A {$source->type->name} can't be converted to that.");
        }
        if ($source->status !== Voucher::POSTED) {
            throw new BooksException('Only a live voucher can be converted.');
        }
        $target = VoucherType::byBase($targetBase) ?? throw new BooksException('That voucher type is switched off.');

        return DB::transaction(function () use ($source, $target, $targetBase, $sourceBase, $opts, $user) {
            $source = Voucher::whereKey($source->id)->lockForUpdate()->firstOrFail();
            $items = $source->items()->with('taxes')->get();
            $top = $items->whereNull('parent_item_id');
            $pick = $opts['lines'] ?? null;
            // a quotation is simply taken up in full; otherwise track what has gone out / been invoiced
            $field = $sourceBase === VoucherType::QUOTATION ? null
                : (in_array($targetBase, [VoucherType::DELIVERY_NOTE, VoucherType::RECEIPT_NOTE], true) ? 'delivered_quantity' : 'invoiced_quantity');

            $lines = [];
            $moves = false;
            foreach ($top as $it) {
                $remaining = max(0.0, (float) $it->quantity - ($field ? (float) $it->{$field} : 0.0));
                $qty = $pick !== null ? min($remaining, (float) ($pick[$it->id] ?? 0)) : $remaining;
                if ($qty <= 0) {
                    continue;
                }
                $ratio = (float) $it->quantity > 0 ? $qty / (float) $it->quantity : 1.0;
                $children = $it->is_header ? $items->where('parent_item_id', $it->id) : collect();

                if ($it->is_header) {
                    $child = [];
                    foreach ($children as $c) {
                        $cq = round((float) $c->quantity * $ratio, 4);
                        $child[] = $this->cloneLine($c, $cq, $ratio, $this->stockQtyFor($c, $cq, $sourceBase, $targetBase));
                    }
                    $line = $this->cloneLine($it, $qty, $ratio, 0.0);
                    $line['children'] = $child;
                    $line['amount'] = round(array_sum(array_column($child, 'amount')), 2);
                    $line['tax_amount'] = round(array_sum(array_column($child, 'tax_amount')), 2);
                    $line['taxes'] = [];
                    $lines[] = $line;
                } else {
                    $lines[] = $this->cloneLine($it, $qty, $ratio, $this->stockQtyFor($it, $qty, $sourceBase, $targetBase));
                    foreach ($items->where('parent_item_id', $it->id) as $c) {   // a service's materials go with it
                        $cq = round((float) $c->quantity * $ratio, 4);
                        $m = $this->cloneLine($c, $cq, $ratio, $this->stockQtyFor($c, $cq, $sourceBase, $targetBase));
                        $m['under_service'] = true;
                        $lines[] = $m;
                    }
                }
            }
            if (! $lines) {
                throw new BooksException('Nothing left to convert — every line is already ' . ($field === 'delivered_quantity' ? 'delivered' : 'invoiced') . '.');
            }

            // Stock moves for a delivery note; for an invoice/cash sale only when made straight from an order (and only the undelivered part).
            $moves = in_array($targetBase, [VoucherType::DELIVERY_NOTE, VoucherType::RECEIPT_NOTE], true)
                || (in_array($sourceBase, [VoucherType::SALES_ORDER, VoucherType::PURCHASE_ORDER], true) && $target->stock_effect !== 'none');

            $data = [
                'voucher_type_id'   => $target->id,
                'date'              => $opts['date'] ?? Carbon::today()->toDateString(),
                'due_date'          => $opts['due_date'] ?? null,
                'location_id'       => $source->location_id,
                'customer_id'       => $source->customer_id,
                'party_ledger_id'   => $source->party_ledger_id,
                'currency_id'       => $source->currency_id,
                'exchange_rate'     => $source->exchange_rate,
                'payment_method_id' => $opts['payment_method_id'] ?? $source->payment_method_id,
                'tenders'           => $opts['tenders'] ?? ($targetBase === VoucherType::CASH_SALE ? $this->rememberedGiftTenders($source, $lines, $opts) : null),
                'reference_no'      => $opts['reference_no'] ?? $source->reference_no,
                'supplier_invoice_no' => $opts['supplier_invoice_no'] ?? $source->supplier_invoice_no,
                'party_name' => $source->party_name, 'party_phone' => $source->party_phone, 'party_address' => $source->party_address, 'party_tax_id' => $source->party_tax_id,
                'rounding' => $opts['rounding'] ?? null,
                'apply_credit' => $targetBase === VoucherType::SALES && ! empty($source->meta['use_credit']) ? $source->meta['use_credit'] : null,   // the overpayment the customer meant to use
                'narration'         => $opts['narration'] ?? $source->narration,
                'channel'           => $source->channel,
                'source_voucher_id' => $source->id,
                'lines_resolved'    => $lines,
                'moves_stock'       => $opts['moves_stock'] ?? $moves,
                'meta'              => array_merge($source->meta ?? [], ['converted_from' => $source->voucher_number], $opts['meta'] ?? []),
            ];

            $child = $this->create($data, $user);
            $this->bumpSources($child, +1);
            if ($sourceBase === VoucherType::QUOTATION) {
                $source->update(['doc_status' => 'accepted', 'responded_at' => now()]);
            }
            $this->audit($source, 'converted', $user, ['to' => $child->voucher_number, 'type' => $target->name]);

            return $child->load($this->relations());
        });
    }

    /**
     * Record a payment against an invoice: creates a Receipt (Dr the payment method's
     * ledger, Cr the customer) settled against that invoice.
     *
     * @param  array  $opts  payment_method_id (required), amount (default: what's outstanding), date, reference_no, narration
     */
    public function receive(Voucher $invoice, array $opts, ?User $user = null): Voucher
    {
        if (! in_array($invoice->type->base_type, [VoucherType::SALES, VoucherType::DEBIT_NOTE], true) || $invoice->status !== Voucher::POSTED) {
            throw new BooksException('Payments are recorded against a live sales invoice.');
        }
        $outstanding = $this->outstanding($invoice);
        $amount = isset($opts['amount']) ? round((float) $opts['amount'], 2) : $outstanding;
        if ($amount <= 0) {
            throw new BooksException($outstanding <= 0 ? 'That invoice is already fully paid.' : 'Enter an amount to receive.');
        }
        if ($amount - $outstanding > 0.005) {
            throw new BooksException('That is more than the ' . number_format($outstanding, 2) . ' outstanding on ' . $invoice->voucher_number . '.');
        }
        $type = VoucherType::byBase(VoucherType::RECEIPT) ?? throw new BooksException('The Receipt voucher type is switched off.');

        return $this->create([
            'voucher_type_id'   => $type->id,
            'date'              => $opts['date'] ?? Carbon::today()->toDateString(),
            'location_id'       => $invoice->location_id,
            'customer_id'       => $invoice->customer_id,
            'party_ledger_id'   => $invoice->party_ledger_id,
            'currency_id'       => $invoice->currency_id,
            'exchange_rate'     => $opts['exchange_rate'] ?? null,   // blank = the rate in force today; the difference vs the invoice is booked as exchange gain/loss
            'payment_method_id' => $opts['payment_method_id'] ?? null,
            'tenders'           => $opts['tenders'] ?? null,
            'withholding'       => $opts['withholding'] ?? null,
            'reference_no'      => $opts['reference_no'] ?? null,
            'narration'         => $opts['narration'] ?? "Payment of {$invoice->voucher_number}",
            'amount'            => $amount,
            'allocations'       => [['against_voucher_id' => $invoice->id, 'amount' => $amount]],
            'source_voucher_id' => $invoice->id,
            'channel'           => $opts['channel'] ?? 'admin',
        ], $user);
    }

    /** Checkout: a customer's cart becomes a Sales Order. */
    public function placeOrder(array $data, ?User $user = null): Voucher
    {
        $type = VoucherType::byBase(VoucherType::SALES_ORDER) ?? throw new BooksException('The Sales Order voucher type is switched off.');

        return $this->create(array_merge($data, ['voucher_type_id' => $type->id, 'channel' => $data['channel'] ?? 'storefront']), $user);
    }

    /**
     * A Sales Order only remembers which gift vouchers the customer meant to pay with (meta.gift_codes); nothing is spent
     * until it becomes a Cash Sale. Then those vouchers become payment lines — each covering what is left of the total —
     * and whatever remains is taken by the payment method chosen on the conversion.
     */
    private function rememberedGiftTenders(Voucher $source, array $lines, array $opts): ?array
    {
        $codes = array_values(array_filter((array) ($source->meta['gift_codes'] ?? [])));
        if (! $codes || ! $source->customer_id) {
            return null;
        }
        $method = PaymentMethod::where('kind', 'gift_voucher')->where('is_active', true)->first();
        if (! $method) {
            throw new BooksException('Gift vouchers are not set up yet (payment method missing).');
        }
        [$sub, $tax] = $this->totals($lines);
        $left = round($sub + $tax, 2);
        $currency = $this->money->currencyFrom($source->currency_id);
        $tenders = [];
        foreach ($codes as $code) {
            $gv = \App\Models\Books\GiftVoucher::with('currency')->where('code', $code)->where('customer_id', $source->customer_id)->first();
            if (! $gv || ! $gv->isSpendable() || $left <= 0.004) {
                continue;   // spent elsewhere in the meantime, or nothing left to pay: skipped, the order still converts
            }
            $use = round(min($this->money->convert((float) $gv->balance, $gv->currency, $currency), $left), 2);
            $tenders[] = ['payment_method_id' => $method->id, 'amount' => $use, 'gift_voucher_code' => $gv->code];
            $left = round($left - $use, 2);
        }
        if ($tenders && $left > 0.004 && ! empty($opts['payment_method_id'])) {
            $tenders[] = ['payment_method_id' => (int) $opts['payment_method_id'], 'amount' => $left];
        }

        return $tenders ?: null;
    }

    /** Payment arrives for an order: the order becomes a Cash Sale (full payment). */
    public function settleOrder(Voucher $order, PaymentMethod $method, ?string $reference = null, ?User $user = null): Voucher
    {
        return $this->convert($order, VoucherType::CASH_SALE, ['payment_method_id' => $method->id, 'reference_no' => $reference], $user);
    }

    /** What is still owed on a sales invoice / purchase (new bill minus receipts / payments against it). */
    public function outstanding(Voucher $invoice, ?int $exceptVoucherId = null): float
    {
        $new = (float) VoucherBillRef::where('voucher_id', $invoice->id)->where('ref_type', 'new')->sum('amount');
        $paid = (float) DB::table('voucher_bill_refs as b')
            ->join('vouchers as v', 'v.id', '=', 'b.voucher_id')
            ->where('b.against_voucher_id', $invoice->id)->where('b.ref_type', 'against')->where('v.status', Voucher::POSTED)
            ->when($exceptVoucherId, fn ($q) => $q->where('b.voucher_id', '!=', $exceptVoucherId))   // editing a receipt: its own settlements do not count against it
            ->sum('b.amount');

        return round($new - $paid, 2);
    }

    // =====================================================================
    // PLANNING (nothing is saved here)
    // =====================================================================

    private function typeFrom(array $data): VoucherType
    {
        $type = null;
        if (! empty($data['voucher_type_id'])) {
            $type = VoucherType::find($data['voucher_type_id']);
        } elseif (! empty($data['type'])) {
            $type = VoucherType::where('code', $data['type'])->orWhere('base_type', $data['type'])->orderByDesc('is_system')->first();
        }
        if (! $type || ! $type->is_active) {
            throw new BooksException('Pick a voucher type.');
        }

        return $type;
    }

    private function plan(array $data, VoucherType $type, ?Voucher $existing, ?User $user = null): array
    {
        $base = $type->base_type;
        $baseCurrency = $this->money->getBaseCurrency();
        $currency = ! empty($data['currency_id']) ? $this->money->currencyFrom((int) $data['currency_id']) : $baseCurrency;
        $date = Carbon::parse($data['date'] ?? today());
        // A rate typed on the voucher wins; otherwise the rate in force on the voucher's date.
        $rate = $currency->id === $baseCurrency->id
            ? 1.0
            : (! empty($data['exchange_rate']) ? (float) $data['exchange_rate'] : $this->money->rateOn($currency, $date));
        if ($rate <= 0) {
            throw new BooksException("No exchange rate for {$currency->code}.");
        }
        $locationId = $data['location_id'] ?? Location::default()?->id;

        // ── party ─────────────────────────────────────────────────────
        $customer = ! empty($data['customer_id']) ? Customer::findOrFail($data['customer_id']) : null;
        $party = null;
        if (! empty($data['party_ledger_id'])) {
            $party = Ledger::findOrFail($data['party_ledger_id']);
            $customer ??= $party->customer_id ? Customer::find($party->customer_id) : null;
        } elseif ($customer) {
            $party = $this->ledgers->customerLedger($customer);
        }
        if (! $party && $type->party_kind === 'customer' && $base !== VoucherType::CASH_SALE) {
            $party = $this->ledgers->walkinLedger();
        }
        $method = ! empty($data['payment_method_id']) ? PaymentMethod::with('ledger')->findOrFail($data['payment_method_id']) : null;

        // A purchase paid at once (cash, bank, M-Pesa) is credited to that ledger, not to the supplier: no debt is created.
        // The supplier may still be named (or the seller's details typed in) for the record.
        $paidLedgerId = null;
        if ($base === VoucherType::PURCHASE && ($method?->ledger_id || ! empty($data['paid_ledger_id']))) {
            $paidLedgerId = (int) ($method?->ledger_id ?: $data['paid_ledger_id']);
            $paid = Ledger::find($paidLedgerId);
            if (! $paid || ! ($this->ledgers->isUnderGroup($paid, 'Cash-in-hand') || $this->ledgers->isUnderGroup($paid, 'Bank Accounts'))) {
                throw new BooksException('A purchase paid at once must be paid from a cash or bank ledger.');
            }
        }
        if (! $party && ! $paidLedgerId && $type->party_kind === 'supplier') {
            throw new BooksException("Choose the supplier's ledger for a {$type->name}.");
        }

        $tenders = $this->rawTenders($data);
        $method ??= $tenders[0]['method'] ?? null;
        $ctx = compact('type', 'currency', 'baseCurrency', 'rate', 'customer', 'locationId', 'date');
        $ctx['channel'] = (string) ($data['channel'] ?? 'admin');

        $plan = [
            'source_id' => ! empty($data['source_voucher_id']) ? (int) $data['source_voucher_id'] : null,
            'opening_ledger_id' => ! empty($data['opening_ledger_id']) ? (int) $data['opening_ledger_id'] : null,
            'type' => $type, 'date' => $date, 'due' => ! empty($data['due_date']) ? Carbon::parse($data['due_date']) : null,
            'location_id' => $locationId, 'customer' => $customer, 'party' => $party, 'currency' => $currency, 'rate' => $rate,
            'method' => $method, 'tenders' => $tenders, 'paid_ledger_id' => $paidLedgerId, 'discount_options' => [], 'lines' => [], 'entries' => [], 'bills' => [], 'stock' => [],
            'subtotal' => 0.0, 'tax_total' => 0.0, 'total' => 0.0,
        ];

        // The customer's discounts on a sale (personal / tier / customer type, referral, a promo code): the admin ticks which
        // to apply (discount_choices). Each is taken off BEFORE tax, spread over the lines in proportion, so VAT follows.
        $discountOptions = [];
        if ($type->has_items && $type->isSalesSide() && $customer && ! in_array($type->base_type, [VoucherType::CREDIT_NOTE, VoucherType::DELIVERY_NOTE], true)) {
            $resolved = $data['lines_resolved'] ?? $this->resolveLines($data['lines'] ?? [], $ctx);
            $eligible = [];   // typed line index => what a discount can be taken from
            foreach ($resolved as $rl) {
                if (isset($rl['_src'])) {
                    $eligible[$rl['_src']] = (in_array($rl['item_type'], ['product', 'service', 'custom'], true) && empty($rl['gift_meta'])) ? max(0.0, (float) $rl['amount']) : 0.0;
                }
            }
            $engine = app(DiscountService::class);
            $choices = array_key_exists('discount_choices', $data) ? array_values((array) $data['discount_choices']) : null;
            $discountOptions = $engine->evaluate($customer, array_sum($eligible), $currency, $choices === null ? [] : $choices);   // nothing is taken unless the admin chose it
            foreach ($discountOptions as $o) {
                if ($o['error']) {
                    throw new BooksException($o['error']);
                }
            }
            if ($choices !== null && array_filter($discountOptions, fn ($o) => $o['chosen'])) {
                $sp = $engine->spread($eligible, $discountOptions);
                $lineData = array_values($data['lines'] ?? []);
                foreach ($sp['perLine'] as $i => $parts) {
                    usort($parts, fn ($a, $b) => $b['amount'] <=> $a['amount']);
                    $lineData[$i]['share_discount'] = round(array_sum(array_column($parts, 'amount')), 2);
                    $lineData[$i]['discount_source'] = $parts[0]['source'];
                    $lineData[$i]['discount_ref'] = $parts[0]['ref'];
                }
                $data['lines'] = $lineData;
                // $data is this method's own copy, so what must reach the saved voucher goes on the plan (persist() reads meta_extra)
                $plan['meta_extra'] = array_merge($plan['meta_extra'] ?? [], array_filter([
                    'discounts' => $sp['discounts'],
                    'promo_code_id' => collect($discountOptions)->firstWhere(fn ($o) => $o['chosen'] && $o['kind'] === 'promo')['promo_id'] ?? null,
                    'referral_code_id' => collect($discountOptions)->firstWhere(fn ($o) => $o['chosen'] && $o['kind'] === 'referral')['referral_id'] ?? null,
                ], fn ($v) => $v !== null));
                unset($data['lines_resolved']);
            }
        }

        $plan['discount_options'] = $discountOptions;

        // ...and whether they meant to use an overpayment / advance they hold; applied when the order becomes an invoice
        if ($type->base_type === VoucherType::SALES_ORDER && ! empty($data['use_credit']) && is_array($data['use_credit'])) {
            $plan['meta_extra'] = array_merge($plan['meta_extra'] ?? [], ['use_credit' => array_values(array_unique(array_map('intval', $data['use_credit'])))]);
        }
        // A Sales Order only remembers which gift vouchers the customer meant to pay with; nothing is held or spent on it
        if ($type->base_type === VoucherType::SALES_ORDER && ! empty($data['gift_codes']) && is_array($data['gift_codes'])) {
            $plan['meta_extra'] = array_merge($plan['meta_extra'] ?? [], ['gift_codes' => array_values(array_unique(array_map('strval', $data['gift_codes'])))]);
        }

        // Rounding (Sales and Cash Sales only, and only when the admin chose it): the total the customer pays is rounded to
        // the nearest whole number or the nearest 0.50; the difference is its own line on the Rounding ledger and never
        // changes the tax. Nothing is rounded unless asked for.
        $roundMode = in_array($data['rounding'] ?? 'none', ['whole', 'half'], true) ? $data['rounding'] : 'none';
        $plan['rounding_mode'] = $type->has_items && in_array($type->base_type, [VoucherType::SALES, VoucherType::CASH_SALE], true) ? $roundMode : 'none';
        if ($plan['rounding_mode'] !== 'none') {
            $plan['meta_extra'] = array_merge($plan['meta_extra'] ?? [], ['rounding' => $plan['rounding_mode']]);   // remembered so an edit starts from the same choice
            $pre = $data['lines_resolved'] ?? $this->resolveLines($data['lines'] ?? [], $ctx);
            [$preSub, $preTax] = $this->totals($pre);
            $preTotal = round($preSub + $preTax, 2);
            $rounded = $plan['rounding_mode'] === 'half' ? round($preTotal * 2) / 2 : round($preTotal);
            $diff = round($rounded - $preTotal, 2);
            if (abs($diff) >= 0.005) {
                $roundLine = ['type' => 'charge', 'kind' => 'rounding', 'amount' => $diff, 'description' => 'Rounding', 'notes' => self::ROUNDING_NOTE];
                if (isset($data['lines_resolved'])) {
                    $data['lines_resolved'][] = array_merge($this->chargeLine($roundLine, $ctx), ['notes' => self::ROUNDING_NOTE]);
                } else {
                    $data['lines'] = array_merge($data['lines'] ?? [], [$roundLine]);
                }
            }
        }

        if ($type->has_items) {
            $lines = $data['lines_resolved'] ?? $this->resolveLines($data['lines'] ?? [], $ctx);
            if (! $lines) {
                throw new BooksException('Add at least one line.');
            }
            if ($type->base_type === VoucherType::QUOTATION && ! empty($data['as_request'])) {
                // a customer's request for a quotation: every line waits for the admin's price
                foreach ($lines as &$rl) {
                    $rl['pending_price'] = true;
                    foreach ($rl['children'] ?? [] as $ck => $_) {
                        $rl['children'][$ck]['pending_price'] = true;
                    }
                }
                unset($rl);
            }
            $plan['lines'] = $lines;
            [$plan['subtotal'], $plan['tax_total']] = $this->totals($lines);
            $plan['total'] = round($plan['subtotal'] + $plan['tax_total'], 2);

            if ($type->posts_accounts) {
                $plan['entries'] = $this->itemEntries($plan, $type, $method);   // also settles $plan['tenders']
                $plan['bills'] = array_merge($this->itemBills($plan, $type, $data), $this->outsideBills($plan));
            }

            $moves = array_key_exists('moves_stock', $data) ? (bool) $data['moves_stock'] : $type->stock_effect !== 'none';
            $plan['moves_stock'] = $moves && $type->stock_effect !== 'none';
            if ($plan['moves_stock']) {
                $plan['expired_override'] = $this->expiredOverride($data, $type, $user);
                $plan['stock'] = $this->stockPlan($lines, $type, $locationId, (float) $rate, $date, $plan['source_id'], $existing?->id, $plan['expired_override'], (string) ($data['channel'] ?? 'admin'));
            }
        } else {
            $plan['editing_id'] = $existing?->id;
            [$plan['entries'], $plan['bills'], $plan['total']] = $this->directEntries($data, $type, $plan, $method);   // also settles $plan['tenders']
            $plan['moves_stock'] = false;
        }

        // Every posting voucher balances — in the voucher's currency and in base.
        if ($type->posts_accounts) {
            $this->assertBalanced($plan['entries']);
        }

        return $plan;
    }

    // ── lines ───────────────────────────────────────────────────────────

    private function resolveLines(array $raw, array $ctx): array
    {
        $out = [];
        foreach ($raw as $i => $l) {
            $kind = $l['type'] ?? 'product';
            $row = match ($kind) {
                'product' => $this->productLine($l, $ctx),
                'service' => $this->serviceLine($l, $ctx),
                'hamper'  => $this->hamperLines($l, $ctx),
                'charge'  => $this->chargeLine($l, $ctx),
                'custom'  => $this->customLine($l, $ctx),
                default   => throw new BooksException('Unknown line type on line ' . ($i + 1) . '.'),
            };
            $row['_src'] = $i;   // which line the admin typed this came from (a service's parts have none)
            $out[] = $row;
            if ($kind === 'service') {
                foreach ($this->materialLines($l['materials'] ?? [], $ctx) as $m) {
                    $out[] = $m;   // the parts used for the service sit right under it
                }
            }
        }

        // Shipping charges are worked out last: free-above thresholds depend on the rest of the order.
        $subtotal = 0.0;
        foreach ($out as $line) {
            if (empty($line['_shipping'])) {
                $subtotal += array_sum(array_map(fn ($x) => $x['amount'], $line['is_header'] ? $line['children'] : [$line]));
            }
        }
        foreach ($out as $k => $line) {
            if (! empty($line['_shipping'])) {
                $out[$k] = $this->shippingLine($line['_shipping'], $ctx, $subtotal);
            }
        }

        return $out;
    }

    /** A shipping option becomes a charge line: its cost converted into the voucher's currency, posted to its own income ledger, taxed if it says so. */
    private function shippingLine(array $l, array $ctx, float $subtotal): array
    {
        $opt = ShippingOption::find($l['shipping_option_id']) ?? throw new BooksException('That shipping option no longer exists.');
        if (! $opt->is_active) {
            throw new BooksException("Shipping option \"{$opt->name}\" is switched off.");
        }
        $optCurrency = $this->money->currencyFrom($opt->currency_id);
        $subInOpt = round($subtotal * (float) $ctx['rate'] / max($this->money->rateOn($optCurrency, $ctx['date']), 0.00000001), 2);
        $cost = ! empty($l['waive']) ? 0.0 : $opt->costForSubtotal($subInOpt);
        $amount = $this->convertPrice($cost, $opt->currency_id, $ctx);
        $ledgerId = $opt->income_ledger_id ?: AccountingSetting::current()->shipping_income_ledger_id;
        if (! $ledgerId) {
            throw new BooksException("Shipping option \"{$opt->name}\" has no income ledger.");
        }
        $note = null;
        if ($cost > 0 && $optCurrency->id !== $ctx['currency']->id) {
            $note = "{$optCurrency->code} " . number_format($cost, 2) . " converted to {$ctx['currency']->code} @ " . rtrim(rtrim(number_format($this->money->rateOn($optCurrency, $ctx['date']) / (float) $ctx['rate'], 6, '.', ''), '0'), '.');
        }
        $line = array_merge($this->blank('charge'), [
            'description' => $opt->name . ($cost == 0.0 ? ' (free)' : ''), 'quantity' => 1.0, 'base_quantity' => 1.0,
            'rate' => $amount, 'amount' => $amount, 'ledger_id' => (int) $ledgerId, 'shipping_option_id' => $opt->id, 'notes' => $note,
        ]);
        if ($amount != 0.0 && $opt->tax_rate_id) {
            $line['taxes'] = $this->taxes->manual((int) $opt->tax_rate_id, $amount, $this->side($ctx));
            $this->summariseTaxes($line);
        }

        return $line;
    }

    private function blank(string $itemType): array
    {
        return [
            'item_type' => $itemType, 'is_header' => false, 'product_id' => null, 'variant_id' => null, 'variant_unit_id' => null,
            'service_id' => null, 'service_variant_id' => null, 'hamper_id' => null, 'description' => '', 'variant_label' => null,
            'sku' => null, 'unit_code' => null, 'unit_factor' => 1.0, 'quantity' => 1.0, 'base_quantity' => 1.0, 'rate' => 0.0,
            'discount_amount' => 0.0, 'amount' => 0.0, 'tax_rate_id' => null, 'tax_rate_percent' => null, 'tax_amount' => 0.0,
            'ledger_id' => null, 'location_id' => null, 'source_item_id' => null, 'notes' => null,
            'discount_ledger_id' => null, 'discount_source' => null, 'discount_ref' => null, 'shipping_option_id' => null, 'pending_price' => false,
            'gift_meta' => null, 'batch_no' => null, 'mfg_date' => null, 'expiry_date' => null, 'track_expiry' => false, 'pick_batch_id' => null,
            'material_mode' => null, 'under_service' => false, 'cost_amount' => 0.0, 'paid_ledger_id' => null,
            'taxes' => [], 'children' => [], 'stock_qty' => 0.0,
        ];
    }

    /** Where a line's discount came from (tier, customer type, promo code, manual) and which ledger it posts to. */
    private function discountMeta(array $l): array
    {
        return [
            'discount_ledger_id' => $l['discount_ledger_id'] ?? null,
            'discount_source' => $l['discount_source'] ?? (($l['discount'] ?? 0) > 0 ? 'manual' : null),
            'discount_ref' => $l['discount_ref'] ?? null,
        ];
    }

    private function side(array $ctx): string
    {
        return $ctx['type']->isSalesSide() ? 'output' : 'input';
    }

    private function qty(array $l, string $what): float
    {
        $q = round((float) ($l['quantity'] ?? 1), 4);
        if ($q <= 0) {
            throw new BooksException("Enter a quantity for {$what}.");
        }

        return $q;
    }

    private function convertPrice(float $amount, ?int $fromCurrencyId, array $ctx): float
    {
        $from = $this->money->currencyFrom($fromCurrencyId);
        if ($from->id === $ctx['currency']->id) {
            return round($amount, 2);
        }
        // via base, at the rate in force on the voucher's date (and the voucher's own rate for its currency)
        $inBase = $amount * $this->money->rateOn($from, $ctx['date']);

        return round($inBase / max((float) $ctx['rate'], 0.00000001), 2);
    }

    private function finishAmounts(array &$line, ?\Illuminate\Database\Eloquent\Model $taxable, string $module, ?int $unitId, array $ctx): void
    {
        $gross = round($line['quantity'] * $line['rate'], 2);
        $line['amount'] = round($gross - $line['discount_amount'], 2);
        // the account this line posts to (its own, else the item's, else the voucher type's default) decides the tax
        $account = $this->lineAccount($line, $taxable, $ctx);
        if ($account && empty($line['ledger_id'])) {
            $line['ledger_id'] = $account->id;
        }
        $line['taxes'] = $taxable && $ctx['type']->base_type !== VoucherType::OPENING_STOCK
            ? $this->taxes->forLine($taxable, $module, $gross, $line['amount'], $line['quantity'], $unitId, $this->side($ctx), $ctx['customer'], $ctx['locationId'], $ctx['currency'], $account)
            : [];
        $this->summariseTaxes($line);
    }

    /** The sales / purchase account a line will post to — only used to read its tax nature. */
    private function lineAccount(array $line, ?\Illuminate\Database\Eloquent\Model $taxable, array $ctx): ?Ledger
    {
        $id = $line['ledger_id'] ?? null;
        if (! $id && $taxable) {
            $id = $ctx['type']->isSalesSide() ? ($taxable->sales_ledger_id ?? null) : ($taxable->purchase_ledger_id ?? null);
        }
        if (! $id) {
            $s = AccountingSetting::current();
            $id = $ctx['type']->default_ledger_id ?? ($ctx['type']->isSalesSide() ? $s->default_sales_ledger_id : $s->default_purchase_ledger_id);
        }

        return $id ? Ledger::find($id) : null;
    }

    private function summariseTaxes(array &$line): void
    {
        $line['tax_amount'] = round(array_sum(array_column($line['taxes'], 'tax_amount')), 2);
        $first = $line['taxes'][0] ?? null;
        $line['tax_rate_id'] = $first['tax_rate_id'] ?? null;
        $line['tax_rate_percent'] = $first['percent'] ?? null;
    }

    private function productLine(array $l, array $ctx): array
    {
        $variantId = $l['variant_id'] ?? null;
        if (! $variantId && ! empty($l['product_id'])) {
            $variantId = app(VariantStockService::class)->defaultVariantId((int) $l['product_id']);
        }
        $variant = ProductVariant::with(['product.currency', 'units.unit'])->find($variantId);
        if (! $variant) {
            throw new BooksException('Pick a product variant.');
        }
        $product = $variant->product;
        // A "not for sale" product (material / ingredient) is stocked and bought, never sold on its own line.
        if ($ctx['type']->isSalesSide() && ! $product->is_for_sale && empty($l['as_material'])) {
            throw new BooksException("{$product->name} is not for sale — it is a stock material.");
        }
        $unitRow = ! empty($l['variant_unit_id'])
            ? $variant->units->firstWhere('id', (int) $l['variant_unit_id'])
            : ($variant->units->firstWhere('is_default_sale', true) ?? $variant->units->firstWhere('role', 'base'));
        if (! $unitRow) {
            throw new BooksException("{$product->name}: no selling unit — set one on the variant.");
        }

        $line = $this->blank('product');
        $qty = $this->qty($l, $product->name);
        $factor = (float) $unitRow->base_factor;

        $pending = false;
        if (isset($l['rate']) && $l['rate'] !== '') {
            $rate = (float) $l['rate'];
        } else {
            if (! $ctx['type']->isSalesSide()) {
                throw new BooksException("Enter the purchase rate for {$product->name}.");
            }
            $unitRow->setRelation('variant', $variant);
            $price = $unitRow->effectivePrice();
            if ($price === null) {
                if ($ctx['type']->base_type !== VoucherType::QUOTATION) {
                    throw new BooksException("{$product->name} has no price for that unit.");
                }
                $pending = true;   // a quotation can go out unpriced; the admin prices it before sending
            }
            $rate = $price === null ? 0.0 : $this->convertPrice($price, $product->currency_id, $ctx);
        }

        $line = array_merge($line, [
            'product_id' => $product->id, 'variant_id' => $variant->id, 'variant_unit_id' => $unitRow->id,
            'description' => $product->name, 'variant_label' => $variant->name ?: ($variant->combination_key !== 'default' ? $variant->combination_key : null),
            'sku' => $variant->sku ?: $product->sku, 'unit_code' => $unitRow->unit?->code, 'unit_factor' => $factor,
            'quantity' => $qty, 'base_quantity' => round($qty * $factor, 4), 'rate' => round($rate, 4),
            'discount_amount' => round((float) ($l['discount'] ?? 0) + (float) ($l['share_discount'] ?? 0), 2), 'ledger_id' => $l['ledger_id'] ?? null,
            'location_id' => $l['location_id'] ?? null, 'notes' => $l['notes'] ?? null,
            'batch_no' => filled($l['batch_no'] ?? null) ? trim((string) $l['batch_no']) : null,
            'mfg_date' => filled($l['mfg_date'] ?? null) ? $l['mfg_date'] : null,
            'expiry_date' => filled($l['expiry_date'] ?? null) ? $l['expiry_date'] : null,
            'track_expiry' => (bool) $product->track_expiry,
            'pick_batch_id' => filled($l['batch_id'] ?? null) ? (int) $l['batch_id'] : null,   // a sale may name the batch to take from; otherwise first-expiring goes first
        ] + $this->discountMeta($l));
        $line['stock_qty'] = $line['base_quantity'];
        $line['pending_price'] = $pending;
        $this->applyClearance($line, $l, $variant, $ctx);
        $this->finishAmounts($line, $product, 'product', $unitRow->unit_id, $ctx);

        return $line;
    }

    private function serviceLine(array $l, array $ctx): array
    {
        $pkg = ServiceVariant::with(['service', 'priceUnit'])->find($l['service_variant_id'] ?? null);
        if (! $pkg) {
            throw new BooksException('Pick a service package.');
        }
        $service = $pkg->service;
        $qty = $this->qty($l, $service->name);
        $pending = false;
        if (isset($l['rate']) && $l['rate'] !== '') {
            $rate = (float) $l['rate'];
        } elseif ($pkg->price !== null) {
            $rate = $this->convertPrice((float) $pkg->price, $service->currency_id, $ctx);
        } elseif ($ctx['type']->base_type === VoucherType::QUOTATION) {
            $rate = 0.0;
            $pending = true;
        } else {
            throw new BooksException("{$service->name} — {$pkg->name} has no price.");
        }

        $line = array_merge($this->blank('service'), [
            'service_id' => $service->id, 'service_variant_id' => $pkg->id, 'description' => $service->name,
            'variant_label' => $pkg->name, 'sku' => $service->sku, 'unit_code' => $pkg->priceUnit?->code,
            'quantity' => $qty, 'base_quantity' => $qty, 'rate' => round($rate, 4),
            'discount_amount' => round((float) ($l['discount'] ?? 0) + (float) ($l['share_discount'] ?? 0), 2), 'ledger_id' => $l['ledger_id'] ?? null, 'notes' => $l['notes'] ?? null,
        ] + $this->discountMeta($l));
        $line['pending_price'] = $pending;
        $this->finishAmounts($line, $service, 'service', $pkg->price_unit_id, $ctx);

        return $line;
    }

    /** A hamper: one display header + its components. Item prices must add up to the hamper price. */
    private function hamperLines(array $l, array $ctx): array
    {
        $hamper = Hamper::with(['items.variant', 'items.product.currency'])->find($l['hamper_id'] ?? null);
        if (! $hamper) {
            throw new BooksException('Pick a hamper.');
        }
        if ($hamper->items->isEmpty()) {
            throw new BooksException("{$hamper->name} has no items.");
        }
        $hq = $this->qty($l, $hamper->name);

        $sum = 0.0;
        foreach ($hamper->items as $it) {
            if ($it->sale_price === null) {
                throw new BooksException("{$hamper->name}: set a sale price for every item (Hampers → Products).");
            }
            $sum += (float) $it->sale_price * (int) $it->quantity;
        }
        if (abs(round($sum, 2) - round((float) $hamper->price, 2)) > 0.01) {
            throw new BooksException("{$hamper->name}: the item prices add up to " . number_format($sum, 2) . ' but the hamper price is ' . number_format((float) $hamper->price, 2) . '. Fix it on the hamper.');
        }

        $children = [];
        foreach ($hamper->items as $it) {
            $product = $it->product;
            $variant = $it->variant ?? ProductVariant::find(app(VariantStockService::class)->defaultVariantId($it->product_id));
            $cq = round((float) $it->quantity * $hq, 4);
            $c = array_merge($this->blank('hamper_component'), [
                'product_id' => $product->id, 'variant_id' => $variant?->id, 'hamper_id' => $hamper->id,
                'description' => $product->name, 'variant_label' => $variant?->name, 'sku' => $variant?->sku ?: $product->sku,
                'unit_code' => 'pc', 'quantity' => $cq, 'base_quantity' => $cq,
                'rate' => round($this->convertPrice((float) $it->sale_price, $hamper->currency_id, $ctx), 4),
                'ledger_id' => $l['ledger_id'] ?? $hamper->sales_ledger_id, 'location_id' => $hamper->location_id,
            ]);
            $c['stock_qty'] = $variant ? $cq : 0.0;
            $this->finishAmounts($c, $product, 'product', null, $ctx);
            $children[] = $c;
        }

        $header = array_merge($this->blank('hamper'), [
            'is_header' => true, 'hamper_id' => $hamper->id, 'description' => $hamper->name, 'quantity' => $hq, 'base_quantity' => $hq,
            'notes' => $l['notes'] ?? null,
        ]);
        $header['children'] = $children;
        $header['amount'] = round(array_sum(array_column($children, 'amount')), 2);
        $header['tax_amount'] = round(array_sum(array_column($children, 'tax_amount')), 2);
        $header['rate'] = $hq > 0 ? round($header['amount'] / $hq, 4) : 0.0;

        return $header;
    }

    private function chargeLine(array $l, array $ctx): array
    {
        if (! empty($l['shipping_option_id'])) {
            return array_merge($this->blank('charge'), ['_shipping' => $l]);
        }
        $s = AccountingSetting::current();
        $kind = $l['kind'] ?? 'other';
        if ($kind === 'gift_voucher') {
            // selling a gift voucher: the money is a liability, not sales — and the code is issued when the sale is paid
            $amt = round((float) ($l['amount'] ?? 0), 2);
            if ($amt <= 0) {
                throw new BooksException('Enter the gift voucher amount.');
            }
            $liab = $s->gift_voucher_ledger_id ?: Ledger::where('name', 'Gift Vouchers Liability')->value('id')
                ?: throw new BooksException('Gift vouchers are not set up (Gift Vouchers Liability ledger).');

            return array_merge($this->blank('charge'), [
                'description' => 'Gift voucher' . (! empty($l['recipient_name']) ? ' for ' . $l['recipient_name'] : ''), 'quantity' => 1.0, 'base_quantity' => 1.0,
                'rate' => $amt, 'amount' => $amt, 'ledger_id' => (int) $liab,
                'gift_meta' => array_filter(['recipient_name' => $l['recipient_name'] ?? null, 'recipient_email' => $l['recipient_email'] ?? null, 'message' => $l['message'] ?? null]) ?: ['plain' => true],
            ]);
        }
        $amount = round((float) ($l['amount'] ?? 0), 2);
        if ($amount == 0.0) {
            throw new BooksException('Enter an amount for the ' . $kind . ' line.');
        }
        $ledgerId = $l['ledger_id'] ?? match ($kind) {
            'shipping' => $s->shipping_income_ledger_id,
            'discount' => $s->discount_ledger_id,
            'rounding' => $s->rounding_ledger_id,
            default    => null,
        };
        if (! $ledgerId) {
            throw new BooksException("Choose a ledger for the {$kind} line (or set a default under Books settings).");
        }
        if ($kind === 'discount') {
            $amount = -abs($amount); // a discount reduces what is owed
        }
        $line = array_merge($this->blank('charge'), [
            'description' => $l['description'] ?? ucfirst($kind), 'quantity' => 1.0, 'base_quantity' => 1.0,
            'rate' => $amount, 'amount' => $amount, 'ledger_id' => (int) $ledgerId, 'notes' => $l['notes'] ?? null,
        ]);

        return $line;
    }

    private function customLine(array $l, array $ctx): array
    {
        if (empty($l['description']) || empty($l['ledger_id'])) {
            throw new BooksException('A custom line needs a description and a ledger.');
        }
        $qty = $this->qty($l, $l['description']);
        $line = array_merge($this->blank('custom'), [
            'description' => $l['description'], 'quantity' => $qty, 'base_quantity' => $qty, 'rate' => round((float) ($l['rate'] ?? 0), 4),
            'discount_amount' => round((float) ($l['discount'] ?? 0) + (float) ($l['share_discount'] ?? 0), 2), 'ledger_id' => (int) $l['ledger_id'], 'notes' => $l['notes'] ?? null,
            'pending_price' => ! empty($l['pending_price']) && $ctx['type']->base_type === VoucherType::QUOTATION,
        ] + $this->discountMeta($l));
        $line['amount'] = round($qty * $line['rate'] - $line['discount_amount'], 2);
        if (! empty($l['tax_rate_id'])) {
            $line['taxes'] = $this->taxes->manual((int) $l['tax_rate_id'], $line['amount'], $this->side($ctx));
        } else {
            // normally the account the line posts to decides the tax; a line may name another account to be taxed as (e.g. an auction charge that follows the auction's sales account)
            $account = Ledger::find(! empty($l['tax_account_id']) ? (int) $l['tax_account_id'] : $line['ledger_id']);
            $line['taxes'] = $account?->tax_nature
                ? $this->taxes->fromAccount($account, $line['amount'] + $line['discount_amount'], $line['amount'], $line['quantity'], $this->side($ctx), $ctx['customer'], $ctx['currency'])
                : [];
        }
        $this->summariseTaxes($line);

        return $line;
    }

    private function cloneLine(VoucherItem $it, float $qty, float $ratio, float $stockSellingQty): array
    {
        $line = $this->blank($it->item_type);
        foreach (['item_type', 'is_header', 'product_id', 'variant_id', 'variant_unit_id', 'service_id', 'service_variant_id', 'hamper_id',
                  'description', 'variant_label', 'sku', 'unit_code', 'ledger_id', 'location_id', 'notes', 'tax_rate_id', 'tax_rate_percent',
                  'discount_ledger_id', 'discount_source', 'discount_ref', 'shipping_option_id', 'pending_price', 'gift_meta',
                  'batch_no', 'mfg_date', 'expiry_date', 'material_mode', 'paid_ledger_id'] as $k) {
            $line[$k] = $it->{$k};
        }
        $line['track_expiry'] = $it->product_id ? (bool) \App\Models\Product::whereKey($it->product_id)->value('track_expiry') : false;
        $line['unit_factor'] = (float) $it->unit_factor;
        $line['quantity'] = $qty;
        $line['base_quantity'] = round($qty * (float) $it->unit_factor, 4);
        $line['rate'] = (float) $it->rate;
        $line['discount_amount'] = round((float) $it->discount_amount * $ratio, 2);
        $line['amount'] = round((float) $it->amount * $ratio, 2);
        $line['source_item_id'] = $it->id;
        $line['cost_amount'] = round((float) $it->cost_amount * $ratio, 2);
        $line['taxes'] = $it->taxes->map(fn ($t) => [
            'tax_rate_id' => $t->tax_rate_id, 'ledger_id' => $t->ledger_id, 'label' => $t->label,
            'base_amount' => round((float) $t->base_amount * $ratio, 2), 'tax_amount' => round((float) $t->tax_amount * $ratio, 2),
            'percent' => $it->tax_rate_percent !== null ? (float) $it->tax_rate_percent : null,
        ])->all();
        $line['tax_amount'] = round(array_sum(array_column($line['taxes'], 'tax_amount')), 2);
        $line['stock_qty'] = round($stockSellingQty * (float) $it->unit_factor, 4);

        return $line;
    }

    /** Selling-unit quantity that should move stock when converting (0 = none). */
    private function stockQtyFor(VoucherItem $src, float $qty, string $sourceBase, string $targetBase): float
    {
        if (! $src->variant_id) {
            return 0.0;
        }
        if (in_array($targetBase, [VoucherType::DELIVERY_NOTE, VoucherType::RECEIPT_NOTE], true)) {
            return $qty;
        }
        if (in_array($sourceBase, [VoucherType::SALES_ORDER, VoucherType::PURCHASE_ORDER], true)) {
            $undelivered = max(0.0, (float) $src->quantity - (float) $src->delivered_quantity);

            return min($qty, $undelivered);
        }

        return 0.0; // invoicing a delivery: the delivery already moved the stock
    }

    private function totals(array $lines): array
    {
        $sub = 0.0;
        $tax = 0.0;
        foreach ($lines as $l) {
            foreach ($l['is_header'] ? $l['children'] : [$l] as $x) {
                $sub += $x['amount'];
                $tax += $x['tax_amount'];
            }
        }

        return [round($sub, 2), round($tax, 2)];
    }

    /** Flatten header + children into posting lines. */
    private function postingLines(array $lines): array
    {
        $out = [];
        foreach ($lines as $l) {
            foreach ($l['is_header'] ? $l['children'] : [$l] as $x) {
                $out[] = $x;
            }
        }

        return $out;
    }

    // ── accounting ─────────────────────────────────────────────────────

    private function itemEntries(array &$plan, VoucherType $type, ?PaymentMethod $method): array
    {
        $base = $type->base_type;
        $settings = AccountingSetting::current();
        // Lines go on the primary side; the party (or cash) takes the opposite side.
        $lineSide = in_array($base, [VoucherType::SALES, VoucherType::CASH_SALE, VoucherType::DEBIT_NOTE], true) ? 'C' : 'D';
        $partySide = $lineSide === 'C' ? 'D' : 'C';

        $byLedger = [];
        $taxByLedger = [];
        $discByLedger = [];
        // Valued stock: stock bought (or returned to the supplier) posts to the Stock ledger, not the purchase account.
        // The purchase account still decides the line's tax; and when no Stock ledger is set, purchases post as before.
        $stockLedgerId = in_array($base, [VoucherType::PURCHASE, VoucherType::DEBIT_NOTE, VoucherType::OPENING_STOCK], true) ? $settings->stock_ledger_id : null;
        if ($base === VoucherType::OPENING_STOCK && ! $stockLedgerId) {
            throw new BooksException('Choose the Stock ledger under Books → Settings → Default ledgers first.');
        }
        foreach ($this->postingLines($plan['lines']) as $l) {
            if (in_array($l['material_mode'] ?? null, ['included', 'customer_supplied'], true)) {
                continue;   // no charge: included materials are costed to Cost of Services, the customer's own part is only noted
            }
            $ledgerId = $l['ledger_id'] ?? $type->default_ledger_id ?? ($lineSide === 'C' ? $settings->default_sales_ledger_id : $settings->default_purchase_ledger_id);
            if ($stockLedgerId && $l['item_type'] === 'product' && ! empty($l['variant_id'])) {
                $ledgerId = $stockLedgerId;
            }
            if (! $ledgerId) {
                throw new BooksException('Choose a ledger for "' . $l['description'] . '" (or set a default under Books settings).');
            }
            // Sales-side discounts post gross + contra: the sale at list price, the discount to its own ledger.
            $disc = (float) ($l['discount_amount'] ?? 0);
            $discLedger = $l['discount_ledger_id'] ?? $settings->discount_ledger_id;
            if ($disc > 0 && $type->isSalesSide() && $discLedger && $l['item_type'] !== 'charge') {
                $byLedger[$ledgerId] = ($byLedger[$ledgerId] ?? 0) + $l['amount'] + $disc;
                $discByLedger[$discLedger] = ($discByLedger[$discLedger] ?? 0) + $disc;
            } else {
                $byLedger[$ledgerId] = ($byLedger[$ledgerId] ?? 0) + $l['amount'];
            }
            foreach ($l['taxes'] as $t) {
                $taxByLedger[$t['ledger_id']] = ($taxByLedger[$t['ledger_id']] ?? 0) + $t['tax_amount'];
            }
        }

        $entries = [];
        $add = function (int $ledgerId, string $side, float $amount, array $extra = []) use (&$entries, $plan) {
            if (round($amount, 2) == 0.0) {
                return;
            }
            $entries[] = array_merge([
                'ledger_id' => $ledgerId, 'side' => $side, 'amount' => round($amount, 2),
                'base_amount' => round($amount * $plan['rate'], 2), 'is_party' => false, 'is_tax' => false, 'narration' => null,
            ], $extra);
        };
        $flip = fn (string $s) => $s === 'C' ? 'D' : 'C';

        $total = 0.0;
        foreach ($byLedger as $ledgerId => $amt) {
            $side = $amt >= 0 ? $lineSide : $flip($lineSide);
            $add((int) $ledgerId, $side, abs($amt));
            $total += $amt;
        }
        foreach ($discByLedger as $ledgerId => $amt) {
            $add((int) $ledgerId, $flip($lineSide), abs($amt), ['narration' => 'Discount allowed']);
            $total -= $amt;
        }
        foreach ($taxByLedger as $ledgerId => $amt) {
            $side = $amt >= 0 ? $lineSide : $flip($lineSide);
            $add((int) $ledgerId, $side, abs($amt), ['is_tax' => true]);
            $total += $amt;
        }

        // Parts bought elsewhere for the job: what they cost us — Dr Job Materials Cost, Cr the supplier / cash / bank it was paid from.
        foreach ($this->postingLines($plan['lines']) as $l) {
            if (($l['material_mode'] ?? null) === 'bought_outside' && ($l['cost_amount'] ?? 0) > 0) {
                $jobCost = $settings->job_materials_ledger_id
                    ?? throw new BooksException('Choose the Job Materials Cost ledger under Books → Settings → Default ledgers first.');
                $add((int) $jobCost, 'D', (float) $l['cost_amount'], ['narration' => 'Bought for the job: ' . $l['description']]);
                $add((int) $l['paid_ledger_id'], 'C', (float) $l['cost_amount'], ['narration' => 'Paid for: ' . $l['description']]);
            }
        }

        // The other side: customer / supplier ledger, or cash for a cash sale.
        if ($base === VoucherType::OPENING_STOCK) {
            $opening = $plan['opening_ledger_id'] ?? $settings->opening_balance_ledger_id
                ?? throw new BooksException('Choose the ledger the opening stock is balanced against.');
            $add((int) $opening, $total >= 0 ? $partySide : $flip($partySide), abs($total), ['is_party' => true]);

            return $entries;
        }
        if ($base === VoucherType::CASH_SALE) {
            if (! $plan['tenders']) {
                $method ??= AccountingSetting::current()->default_payment_method_id
                    ? PaymentMethod::with('ledger')->find(AccountingSetting::current()->default_payment_method_id) : null;
                if (! $method) {
                    throw new BooksException('Choose how the cash sale was paid.');
                }
                $plan['tenders'] = [['method' => $method, 'amount' => null, 'reference' => null, 'gift' => null]];
            }
            $plan['tenders'] = $this->finalizeTenders($plan['tenders'], round(abs($total), 2), $plan);
            foreach ($plan['tenders'] as $t) {
                $add((int) $t['method']->ledger_id, $total >= 0 ? $partySide : $flip($partySide), $t['amount'], ['is_party' => true]);
            }

            return $entries;
        } elseif (! empty($plan['paid_ledger_id'])) {
            $partyLedgerId = (int) $plan['paid_ledger_id'];   // paid at once: the cash / bank ledger, no supplier debt
        } else {
            $partyLedgerId = $plan['party']?->id ?? throw new BooksException('Choose the party.');
        }
        $add($partyLedgerId, $total >= 0 ? $partySide : $flip($partySide), abs($total), ['is_party' => true]);

        return $entries;
    }

    private function itemBills(array $plan, VoucherType $type, array $data): array
    {
        $base = $type->base_type;
        if (! $plan['party'] || $base === VoucherType::CASH_SALE || ! empty($plan['paid_ledger_id'])) {
            return [];
        }
        if (in_array($base, [VoucherType::SALES, VoucherType::PURCHASE], true)) {
            return [['type' => 'new', 'ledger_id' => $plan['party']->id, 'amount' => $plan['total'], 'due' => $plan['due'], 'against' => null]];
        }
        if (in_array($base, [VoucherType::CREDIT_NOTE, VoucherType::DEBIT_NOTE], true)) {
            $src = ! empty($data['source_voucher_id']) ? Voucher::find($data['source_voucher_id']) : null;
            if ($src && in_array($src->type->base_type, [VoucherType::SALES, VoucherType::PURCHASE], true)) {
                return [['type' => 'against', 'ledger_id' => $plan['party']->id, 'amount' => $plan['total'], 'due' => null, 'against' => $src->id]];
            }

            return [['type' => 'advance', 'ledger_id' => $plan['party']->id, 'amount' => $plan['total'], 'due' => null, 'against' => null]];
        }

        return [];
    }

    /** Receipt / Payment / Journal / Contra. @return array{0: array, 1: array, 2: float} */
    private function directEntries(array $data, VoucherType $type, array &$plan, ?PaymentMethod $method): array
    {
        $rate = $plan['rate'];
        $mk = fn (int $ledgerId, string $side, float $amt, array $extra = []) => array_merge([
            'ledger_id' => $ledgerId, 'side' => $side, 'amount' => round($amt, 2), 'base_amount' => round($amt * $rate, 2),
            'is_party' => false, 'is_tax' => false, 'narration' => null,
        ], $extra);
        $base = $type->base_type;

        if (in_array($base, [VoucherType::RECEIPT, VoucherType::PAYMENT], true)) {
            $amount = round((float) ($data['amount'] ?? 0), 2);
            if ($amount <= 0) {
                throw new BooksException('Enter the amount.');
            }
            $cashLedgerId = $method?->ledger_id ?? ($data['ledger_id'] ?? null);
            if (! $cashLedgerId && ! $plan['tenders']) {
                throw new BooksException('Choose how it was ' . ($base === VoucherType::RECEIPT ? 'received' : 'paid') . ' (payment method or cash/bank ledger).');
            }
            // Payments may go to any expense / supplier ledger; receipts come from the party.
            $otherLedgerId = $plan['party']?->id ?? ($data['counter_ledger_id'] ?? null) ?? throw new BooksException('Choose the party ledger.');
            $cashSide = $base === VoucherType::RECEIPT ? 'D' : 'C';
            $partySide = $base === VoucherType::RECEIPT ? 'C' : 'D';

            // Withholding: the payer keeps back part of the gross. The party is cleared for the gross; the
            // cash side is the net; the difference is the tax receivable (they withheld from us) or payable (we withheld).
            $withheld = 0.0;
            $withLedger = null;
            if (! empty($data['withholding'])) {
                [$withheld, $withLedger] = $this->withholding($data['withholding'], $amount, $base);
                $plan['meta_extra'] = array_merge($plan['meta_extra'] ?? [], ['withholding' => ['amount' => $withheld, 'tax_rate_id' => $data['withholding']['tax_rate_id'] ?? null, 'certificate_no' => $data['withholding']['certificate_no'] ?? null]]);
            }
            $net = round($amount - $withheld, 2);
            if ($plan['tenders']) {
                $plan['tenders'] = $this->finalizeTenders($plan['tenders'], $net, $plan);
                $cash = array_map(fn ($t) => $mk((int) $t['method']->ledger_id, $cashSide, $t['amount']), $plan['tenders']);
            } elseif ($net > 0) {
                $cash = [$mk($cashLedgerId, $cashSide, $net)];
            } else {
                $cash = [];
            }
            $taxEntry = $withheld > 0 ? [$mk((int) $withLedger, $cashSide, $withheld, ['is_tax' => true, 'narration' => 'Tax withheld'])] : [];
            $entries = array_merge($cash, $taxEntry, [$mk($otherLedgerId, $partySide, $amount, ['is_party' => true])]);

            $bills = [];
            $allocated = 0.0;

            // A refund: a Payment that gives a customer's overpayment / advance back. It settles that receipt's credit
            // (no bill, no new credit) and cancelling it puts the credit back.
            if ($base === VoucherType::PAYMENT && ! empty($data['refund_of'])) {
                $src = Voucher::with('type')->find($data['refund_of']);
                if (! $src || $src->status !== Voucher::POSTED || ! in_array($src->type->base_type, [VoucherType::RECEIPT, VoucherType::CREDIT_NOTE], true)) {
                    throw new BooksException('That voucher has no overpayment to refund.');
                }
                if ($src->party_ledger_id !== $otherLedgerId) {
                    throw new BooksException("{$src->voucher_number} belongs to a different party.");
                }
                $held = app(OpenBillsService::class)->creditLeft($src->id, $plan['editing_id'] ?? null);
                if ($amount - $held > 0.005) {
                    throw new BooksException("Only " . number_format($held, 2) . " of {$src->voucher_number} is left to refund.");
                }
                $plan['meta_extra'] = array_merge($plan['meta_extra'] ?? [], ['refund_of' => $src->voucher_number]);
                $bills[] = ['type' => 'against', 'ledger_id' => $otherLedgerId, 'amount' => $amount, 'due' => null, 'against' => $src->id];

                return [$entries, $bills, $amount];
            }

            // one row per bill even if the form sent it twice
            $asked = [];
            foreach ($data['allocations'] ?? [] as $a) {
                $key = (int) ($a['against_voucher_id'] ?? 0);
                $asked[$key] = round(($asked[$key] ?? 0) + (float) ($a['amount'] ?? 0), 2);
            }
            foreach ($asked as $invId => $amt) {
                $inv = Voucher::with('type')->find($invId);
                if (! $inv || $inv->status !== Voucher::POSTED || $amt <= 0) {
                    throw new BooksException('One of the bills being settled is not valid.');
                }
                if ($inv->party_ledger_id !== $otherLedgerId) {
                    throw new BooksException("{$inv->voucher_number} belongs to a different party.");
                }
                $wantBase = $base === VoucherType::RECEIPT ? VoucherType::SALES : VoucherType::PURCHASE;
                $isFeeBill = $base === VoucherType::RECEIPT && $inv->type->base_type === VoucherType::JOURNAL && ! empty($inv->meta['bounce']);   // the fee billed after a bounced cheque
                if ($inv->type->base_type !== $wantBase && ! $isFeeBill) {
                    throw new BooksException("A " . ($base === VoucherType::RECEIPT ? 'receipt' : 'payment') . " settles " . ($base === VoucherType::RECEIPT ? 'sales invoices' : 'purchase invoices') . ", not {$inv->voucher_number}.");
                }
                $left = $this->outstanding($inv, $plan['editing_id'] ?? null);
                if ($amt - $left > 0.005) {
                    throw new BooksException("{$inv->voucher_number} has only " . number_format($left, 2) . ' outstanding.');
                }
                $bills[] = ['type' => 'against', 'ledger_id' => $otherLedgerId, 'amount' => $amt, 'due' => null, 'against' => $inv->id];
                $allocated += $amt;
            }
            if ($allocated - $amount > 0.005) {
                throw new BooksException('The bills add up to ' . number_format($allocated, 2) . ' but the amount is ' . number_format($amount, 2) . '.');
            }
            if ($amount - $allocated > 0.005) {
                // paid on purpose for something not yet supplied, rather than an accidental overpayment
                if (! empty($data['is_advance'])) {
                    $plan['meta_extra'] = array_merge($plan['meta_extra'] ?? [], ['advance' => ['for' => trim((string) ($data['advance_for'] ?? '')) ?: null]]);
                }
                $bills[] = ['type' => 'advance', 'ledger_id' => $otherLedgerId, 'amount' => round($amount - $allocated, 2), 'due' => null, 'against' => null];
            }

            // Foreign currency: the party is cleared at the rate the invoice was booked at; cash moves at today's
            // rate. The difference is a realised exchange gain / loss.
            if ($rate != 1.0) {
                $partyBase = 0.0;
                foreach ($bills as $b) {
                    $partyBase += $b['type'] === 'against'
                        ? $b['amount'] * (float) Voucher::whereKey($b['against'])->value('exchange_rate')
                        : $b['amount'] * $rate;
                }
                foreach ($entries as &$e) {
                    if ($e['is_party']) {
                        $e['base_amount'] = round($partyBase, 2);
                    }
                }
                unset($e);
                $entries = $this->withExchangeDifference($entries);
            }

            return [$entries, $bills, $amount];
        }

        // Journal / Contra: the entries are given.
        $entries = [];
        $debit = 0.0;
        foreach ($data['entries'] ?? [] as $e) {
            $amt = round((float) ($e['amount'] ?? 0), 2);
            $side = strtoupper((string) ($e['side'] ?? ''));
            if (! in_array($side, ['D', 'C'], true) || $amt <= 0 || empty($e['ledger_id'])) {
                throw new BooksException('Every entry needs a ledger, a debit/credit side and an amount.');
            }
            $entries[] = $mk((int) $e['ledger_id'], $side, $amt, ['narration' => $e['narration'] ?? null, 'is_party' => ! empty($e['is_party'])]);
            $debit += $side === 'D' ? $amt : 0;
        }
        if (count($entries) < 2) {
            throw new BooksException('A ' . $type->name . ' needs at least two entries.');
        }
        if ($base === VoucherType::CONTRA) {
            foreach ($entries as $e) {
                $l = Ledger::find($e['ledger_id']);
                if (! $l || ! ($this->ledgers->isUnderGroup($l, 'Cash-in-hand') || $this->ledgers->isUnderGroup($l, 'Bank Accounts'))) {
                    throw new BooksException('A Contra moves money between cash and bank ledgers only.');
                }
            }
        }

        // A journal may settle bills (a write-off): each one must be the party's own open sales bill, and the journal must
        // credit that party for at least what it settles.
        $bills = [];
        if ($base === VoucherType::JOURNAL && ! empty($data['settles'])) {
            $credited = [];
            foreach ($entries as $e) {
                if ($e['side'] === 'C') {
                    $credited[$e['ledger_id']] = round(($credited[$e['ledger_id']] ?? 0) + $e['amount'], 2);
                }
            }
            $asked = [];
            foreach ($data['settles'] as $a) {
                $k = (int) ($a['against_voucher_id'] ?? 0);
                $asked[$k] = round(($asked[$k] ?? 0) + (float) ($a['amount'] ?? 0), 2);
            }
            foreach ($asked as $billId => $amt) {
                $bill = Voucher::with('type')->find($billId);
                if (! $bill || $bill->status !== Voucher::POSTED || $bill->type->base_type !== VoucherType::SALES || $amt <= 0) {
                    throw new BooksException('Only open sales invoices can be settled by a write-off.');
                }
                $left = $this->outstanding($bill, $plan['editing_id'] ?? null);
                if ($amt - $left > 0.005) {
                    throw new BooksException("{$bill->voucher_number} has only " . number_format($left, 2) . ' outstanding.');
                }
                $credited[$bill->party_ledger_id] = round(($credited[$bill->party_ledger_id] ?? 0) - $amt, 2);
                if ($credited[$bill->party_ledger_id] < -0.005) {
                    throw new BooksException("The write-off must credit the customer of {$bill->voucher_number} for at least {$amt}.");
                }
                $bills[] = ['type' => 'against', 'ledger_id' => $bill->party_ledger_id, 'amount' => $amt, 'due' => null, 'against' => $bill->id];
            }
        }

        // A bounced cheque: the receipt's settlements are taken back (negative settlements, so the invoices are open again),
        // what was left of it on account is used up, and any fee billed to the customer opens its own bill.
        if ($base === VoucherType::JOURNAL && ! empty($data['bounce_instrument_id'])) {
            $inst = \App\Models\Books\VoucherInstrument::find($data['bounce_instrument_id']);
            if (! $inst || $inst->type !== 'cheque' || $inst->direction !== 'in' || ! in_array($inst->status, ['received', 'deposited'], true)) {
                throw new BooksException('That is not a received cheque that can bounce.');
            }
            $partyEntry = collect($entries)->firstWhere('is_party', true) ?? throw new BooksException('A bounce debits the customer.');
            foreach ($data['reopen'] ?? [] as $r) {
                $bill = Voucher::find($r['against_voucher_id'] ?? null);
                if (! $bill || $bill->status !== Voucher::POSTED || (float) ($r['amount'] ?? 0) <= 0) {
                    throw new BooksException('One of the bills to open again is not valid.');
                }
                $bills[] = ['type' => 'against', 'ledger_id' => $partyEntry['ledger_id'], 'amount' => -round((float) $r['amount'], 2), 'due' => null, 'against' => $bill->id];
            }
            if (! empty($data['credit_off']['voucher_id']) && (float) ($data['credit_off']['amount'] ?? 0) > 0) {
                $bills[] = ['type' => 'against', 'ledger_id' => $partyEntry['ledger_id'], 'amount' => round((float) $data['credit_off']['amount'], 2), 'due' => null, 'against' => (int) $data['credit_off']['voucher_id']];
            }
            if ((float) ($data['fee_bill'] ?? 0) > 0) {
                $bills[] = ['type' => 'new', 'ledger_id' => $partyEntry['ledger_id'], 'amount' => round((float) $data['fee_bill'], 2), 'due' => Carbon::today(), 'against' => null];
            }
        }

        return [$entries, $bills, round($debit, 2)];
    }

    /** @return array{0: float, 1: int} the amount withheld and the ledger it sits in */
    private function withholding(array $w, float $gross, string $base): array
    {
        $rate = \App\Models\TaxRate::with('taxType')->find($w['tax_rate_id'] ?? null) ?? throw new BooksException('Choose the withholding tax rate.');
        if ($rate->taxType?->application_mode !== \App\Models\TaxType::MODE_WITHHELD) {
            throw new BooksException('That is not a withholding tax.');
        }
        if (! $rate->ledger_output_id || ! $rate->ledger_input_id) {
            $rate = app(TaxLedgerService::class)->provisionRate($rate);
        }
        $amount = isset($w['amount']) && $w['amount'] !== '' ? round((float) $w['amount'], 2)
            : ($rate->rate_type === \App\Models\TaxRate::TYPE_PERCENTAGE ? round($gross * (float) $rate->rate_value / 100, 2) : round((float) $rate->rate_value, 2));
        if ($amount < 0 || $amount > $gross) {
            throw new BooksException('The withheld tax can not be more than the payment.');
        }

        // receipts: a customer withholds from us (receivable); payments: we withhold from a supplier (payable)
        return [$amount, (int) ($base === VoucherType::RECEIPT ? $rate->ledger_output_id : $rate->ledger_input_id)];
    }

    // ── tenders (paying one voucher several ways) ───────────────────────

    /** @return array<int, array{method: PaymentMethod, amount: ?float, reference: ?string, gift: ?GiftVoucher}> */
    private function rawTenders(array $data): array
    {
        $out = [];
        foreach ($data['tenders'] ?? [] as $t) {
            $method = PaymentMethod::with('ledger')->find($t['payment_method_id'] ?? null)
                ?? throw new BooksException('One of the payment methods is not valid.');
            $gift = null;
            if ($method->kind === 'gift_voucher') {
                $code = trim((string) ($t['gift_voucher_code'] ?? ''));
                $gift = GiftVoucher::where('code', $code)->first() ?? throw new BooksException($code === '' ? 'Enter the gift voucher code.' : "Gift voucher {$code} was not found.");
            }
            $out[] = ['method' => $method, 'amount' => isset($t['amount']) && $t['amount'] !== '' ? round((float) $t['amount'], 2) : null, 'reference' => $t['reference'] ?? null, 'gift' => $gift];
        }

        return $out;
    }

    /** Work out each tender's amount (one may take the remainder), convert gift vouchers to their own currency, check the total. */
    private function finalizeTenders(array $tenders, float $total, array $plan): array
    {
        $open = array_keys(array_filter($tenders, fn ($t) => $t['amount'] === null));
        if (count($open) > 1) {
            throw new BooksException('Only one payment method can take "the rest".');
        }
        $given = array_sum(array_map(fn ($t) => $t['amount'] ?? 0, $tenders));
        if ($open) {
            $tenders[$open[0]]['amount'] = round($total - $given, 2);
        }
        $sum = round(array_sum(array_column($tenders, 'amount')), 2);
        if (abs($sum - $total) > 0.005) {
            throw new BooksException('The payments add up to ' . number_format($sum, 2) . ' but ' . number_format($total, 2) . ' is due.');
        }
        foreach ($tenders as &$t) {
            if ($t['amount'] <= 0) {
                throw new BooksException('Every payment needs an amount above zero.');
            }
            if ($t['gift']) {
                $gv = $t['gift'];
                if ($gv->customer_id && $plan['customer'] && (int) $gv->customer_id !== (int) $plan['customer']->id) {
                    throw new BooksException("Gift voucher {$gv->code} belongs to another customer.");
                }
                $baseAmt = $t['amount'] * $plan['rate'];
                $t['gift_amount'] = round($baseAmt / max($this->money->rateOn($gv->currency_id, $plan['date']), 0.00000001), 2);
                if (! $gv->isSpendable() || $t['gift_amount'] - (float) $gv->balance > 0.005) {
                    throw new BooksException("Gift voucher {$gv->code} can't cover " . number_format($t['amount'], 2) . ' (balance ' . number_format((float) $gv->balance, 2) . ' ' . ($gv->currency?->code ?? '') . ').');
                }
            }
        }
        unset($t);

        return $tenders;
    }

    /** Add the realised exchange gain / loss line that makes the base-currency side balance. */
    private function withExchangeDifference(array $entries): array
    {
        $debit = $credit = 0.0;
        foreach ($entries as $e) {
            $e['side'] === 'D' ? $debit += $e['base_amount'] : $credit += $e['base_amount'];
        }
        $diff = round($debit - $credit, 2);
        if (abs($diff) < 0.005) {
            return $entries;
        }
        $s = AccountingSetting::current();
        $gain = $diff > 0;   // debits exceed credits → we need a credit → gain
        $ledgerId = $gain
            ? ($s->fx_gain_ledger_id ?: Ledger::where('name', 'Exchange Gain')->value('id'))
            : ($s->fx_loss_ledger_id ?: Ledger::where('name', 'Exchange Loss')->value('id'));
        if (! $ledgerId) {
            throw new BooksException('Set the Exchange Gain / Exchange Loss ledgers under Books settings (default ledgers).');
        }
        $entries[] = [
            'ledger_id' => (int) $ledgerId, 'side' => $gain ? 'C' : 'D', 'amount' => 0.0, 'base_amount' => abs($diff),
            'is_party' => false, 'is_tax' => false, 'narration' => 'Realised exchange ' . ($gain ? 'gain' : 'loss'),
        ];

        return $entries;
    }

    private function assertBalanced(array &$entries): void
    {
        $d = $c = $bd = $bc = 0.0;
        foreach ($entries as $e) {
            if ($e['side'] === 'D') { $d += $e['amount']; $bd += $e['base_amount']; } else { $c += $e['amount']; $bc += $e['base_amount']; }
        }
        if (abs($d - $c) > 0.005) {
            throw new BooksException('The voucher does not balance: debits ' . number_format($d, 2) . ' vs credits ' . number_format($c, 2) . '.');
        }
        // Rounding in base currency lands on the party / cash entry so base balances too.
        if (abs($bd - $bc) > 0.0) {
            foreach ($entries as &$e) {
                if ($e['is_party'] || $e === end($entries)) {
                    $e['base_amount'] = round($e['base_amount'] + ($e['side'] === 'D' ? ($bc - $bd) : ($bd - $bc)), 2);
                    break;
                }
            }
            unset($e);
        }
    }

    // ── stock ──────────────────────────────────────────────────────────

    private function stockPlan(array $lines, VoucherType $type, ?int $voucherLocationId, float $rate = 1.0, ?Carbon $date = null, ?int $sourceId = null, ?int $excludeVoucherId = null, ?array $override = null, string $channel = 'admin'): array
    {
        $sign = $type->stock_effect === 'out' ? -1 : 1;
        $moves = [];
        foreach ($this->postingLines($lines) as $l) {
            if (empty($l['variant_id']) || ($l['stock_qty'] ?? 0) <= 0) {
                continue;
            }
            $loc = $l['location_id'] ?? $voucherLocationId;
            if (! $loc) {
                throw new BooksException('Choose the branch stock moves from.');
            }
            // made to order (a recipe that uses its ingredients when sold): the ingredients leave stock, the item itself holds none
            if ($type->isSalesSide() && ($recipe = app(\App\Services\Stock\RecipeService::class)->onSale((int) $l['variant_id']))) {
                if ($sign < 0) {
                    foreach ($recipe['items'] as $ing) {
                        $moves[] = ['variant_id' => $ing['variant_id'], 'location_id' => (int) $loc, 'qty' => -round($ing['quantity'] * (float) $l['stock_qty'] / $recipe['yield'], 4),
                            'product' => $ing['name'], 'purpose' => null, 'window' => $this->sellWindow($ing['product_id'], $channel, $override)];
                    }
                }

                continue;
            }
            $move = ['variant_id' => $l['variant_id'], 'location_id' => (int) $loc, 'qty' => $sign * (float) $l['stock_qty'], 'product' => $l['description']];
            if ($sign > 0 && $type->isSalesSide()) {
                // a customer's return: back into the batch(es) it was sold from, at their cost (never at the selling price)
                $move['unit_cost'] = null;
                $move['hold'] = ! empty($l['track_expiry']) && app(\App\Services\Stock\StockPolicy::class)->global()['returns_to_quarantine'];   // an expiry product a customer brought back is checked before it is shelved
                $move['return_to'] = $sourceId ? $this->returnableBatches($sourceId, (int) $l['variant_id'], (int) $loc, (float) $l['stock_qty'], $excludeVoucherId) : [];
            } elseif ($sign > 0) {
                // what this stock cost: the line's net amount (after discount, before tax) in base currency, per base unit
                $move['unit_cost'] = round((float) ($l['amount'] ?? 0) * $rate / (float) $l['stock_qty'], 4);
                $move['batch'] = $this->batchInfo($l, $date);
            } elseif ($sign < 0) {
                $move['purpose'] = ($l['material_mode'] ?? null) === 'included' ? 'included' : null;   // costed to Cost of Services, not cost of goods sold
                if (! empty($l['pick_batch_id'])) {
                    $move['batch_id'] = (int) $l['pick_batch_id'];   // the seller chose the batch
                }
                if ($type->isSalesSide()) {
                    $move['window'] = $this->sellWindow((int) ($l['product_id'] ?? 0) ?: null, $channel, $override);
                } else {
                    $move['allow_inactive'] = true;   // returning stock to a supplier may take an expired or held batch
                }
            }
            $moves[] = $move;
        }

        return $moves;
    }

    /**
     * Batch number / dates for stock arriving on a line. A product that tracks
     * expiry must have a batch number and an expiry date; any other product may
     * still carry them. Returns null when the line names no batch at all.
     */
    private function batchInfo(array $l, ?Carbon $date): ?array
    {
        $no = $l['batch_no'] ?? null;
        $mfg = $l['mfg_date'] ?? null;
        $exp = $l['expiry_date'] ?? null;
        $name = $l['description'] ?? 'this product';

        if (! empty($l['track_expiry'])) {
            if (! filled($no) || ! filled($exp)) {
                throw new BooksException("{$name} expires — enter its batch number and expiry date. (Stock of expiry products arrives through a Receipt Note or the Purchases page, where the batch can be entered.)");
            }
        }
        if (filled($exp) && filled($mfg) && Carbon::parse($exp)->lt(Carbon::parse($mfg))) {
            throw new BooksException("{$name}: the expiry date is before the manufacture date.");
        }
        if (filled($exp) && $date && Carbon::parse($exp)->startOfDay()->lt($date->copy()->startOfDay())) {
            throw new BooksException("{$name}: batch " . ($no ?: '') . ' had already expired on ' . Carbon::parse($exp)->format('d M Y') . ' — it can not be received.');
        }

        return (filled($no) || filled($mfg) || filled($exp))
            ? ['batch_no' => filled($no) ? $no : null, 'mfg_date' => filled($mfg) ? $mfg : null, 'expiry_date' => filled($exp) ? $exp : null]
            : null;
    }

    // ── clearance pricing ────────────────────────────────────────────────

    /**
     * A batch on clearance sells cheaper: what a sale takes from it is discounted by the batch's percent. The batches
     * are the ones the sale would take (first expiring first, or the one the seller named); a sale that takes from
     * several is discounted by the quantity-weighted percent. A typed price, or a discount the seller entered, stands.
     */
    private function applyClearance(array &$line, array $l, ProductVariant $variant, array $ctx): void
    {
        $type = $ctx['type'];
        if (! $type->isSalesSide() || in_array($type->base_type, [VoucherType::CREDIT_NOTE, VoucherType::DELIVERY_NOTE], true) || ! $variant->product?->track_expiry) {
            return;
        }
        if ((isset($l['rate']) && $l['rate'] !== '') || (float) ($l['discount'] ?? 0) > 0 || (float) $line['rate'] <= 0) {
            return;
        }
        $batches = app(\App\Services\Stock\BatchService::class);
        $loc = (int) ($l['location_id'] ?? $ctx['locationId'] ?? 0);
        $win = $this->sellWindow($variant->product_id, (string) ($ctx['channel'] ?? 'admin'), null);
        $allocs = ! empty($l['batch_id'])
            ? $batches->peek($variant->id, $loc, (float) $line['base_quantity'], ['batch_id' => (int) $l['batch_id']])
            : $batches->peek($variant->id, $loc, (float) $line['base_quantity'], $win);
        $taken = 0.0;
        $weighted = 0.0;
        foreach ($allocs as $a) {
            $taken += abs((float) $a['qty']);
            $weighted += abs((float) $a['qty']) * (float) (StockBatch::whereKey($a['batch_id'])->value('clearance_percent') ?? 0);
        }
        $pct = $taken > 0 ? $weighted / $taken : 0.0;
        if ($pct > 0) {
            $line['discount_amount'] = round(round(round((float) $line['quantity'] * (float) $line['rate'], 2) * $pct / 100, 2) + (float) ($l['share_discount'] ?? 0), 2);   // clearance, plus the customer's own discounts
            $line['discount_source'] = 'clearance';
        }
    }

    // ── materials under a service line ───────────────────────────────────

    /**
     * What a service used, each entered one of four ways:
     *  - charged            a priced line sold from stock (its cost goes to cost of goods sold, as any sale);
     *  - included           no charge to the customer; leaves stock, and its cost is booked to Cost of Services;
     *  - bought_outside     a part bought elsewhere for this job: not in stock; the customer is charged `rate` (may be
     *                       nothing) and what it cost us is booked to Job Materials Cost, paid from a supplier / cash / bank ledger;
     *  - customer_supplied  the customer's own part: noted on the job, no money, no stock.
     * Each is a line of its own that the voucher files under the service line above it.
     */
    private function materialLines(array $materials, array $ctx): array
    {
        $out = [];
        foreach ($materials as $i => $m) {
            $mode = $m['mode'] ?? 'included';
            $line = match ($mode) {
                'charged'           => $this->productLine(array_merge($m, ['as_material' => true]), $ctx),
                'included'          => $this->productLine(array_merge($m, ['rate' => 0, 'discount' => 0, 'as_material' => true]), $ctx),
                'bought_outside'    => $this->outsideLine($m, $ctx),
                'customer_supplied' => $this->ownPartLine($m, $ctx),
                default             => throw new BooksException('Material ' . ($i + 1) . ': choose charged, included, bought outside or customer supplied.'),
            };
            $line['material_mode'] = $mode;
            $line['under_service'] = true;
            $out[] = $line;
        }

        return $out;
    }

    /** A part bought elsewhere for the job. `cost` is what was paid in all; `rate` is what the customer is charged each. */
    private function outsideLine(array $m, array $ctx): array
    {
        $desc = trim((string) ($m['description'] ?? ''));
        if ($desc === '') {
            throw new BooksException('Name the part that was bought elsewhere.');
        }
        $cost = round((float) ($m['cost'] ?? 0), 2);
        if ($cost > 0 && $ctx['type']->posts_accounts && empty($m['paid_ledger_id'])) {
            throw new BooksException("{$desc}: say where the payment came from — the supplier owed, or the cash or bank account.");
        }
        $ledger = $m['ledger_id'] ?? $ctx['type']->default_ledger_id ?? AccountingSetting::current()->default_sales_ledger_id
            ?? throw new BooksException("{$desc}: choose the income ledger the charge posts to (or set a default sales ledger in Books settings).");
        $line = $this->customLine(['description' => $desc, 'quantity' => $m['quantity'] ?? 1, 'rate' => $m['rate'] ?? 0, 'ledger_id' => $ledger, 'discount' => $m['discount'] ?? 0, 'notes' => $m['notes'] ?? null], $ctx);
        $line['cost_amount'] = $cost;
        $line['paid_ledger_id'] = ! empty($m['paid_ledger_id']) ? (int) $m['paid_ledger_id'] : null;

        return $line;
    }

    /** The customer's own part: on the job for the record, no money and no stock. */
    private function ownPartLine(array $m, array $ctx): array
    {
        $desc = trim((string) ($m['description'] ?? ''));
        if ($desc === '') {
            throw new BooksException("Name the part the customer supplied.");
        }
        $qty = $this->qty($m, $desc);

        return array_merge($this->blank('custom'), ['description' => $desc, 'quantity' => $qty, 'base_quantity' => $qty, 'notes' => $m['notes'] ?? null]);
    }

    /** The bought-outside parts of a sale, as bill references when they are owed to a supplier. */
    private function outsideBills(array $plan): array
    {
        $bills = [];
        foreach ($this->postingLines($plan['lines']) as $l) {
            if (($l['material_mode'] ?? null) !== 'bought_outside' || ($l['cost_amount'] ?? 0) <= 0 || empty($l['paid_ledger_id'])) {
                continue;
            }
            $ledger = Ledger::find($l['paid_ledger_id']);
            if ($ledger && $this->ledgers->isUnderGroup($ledger, 'Sundry Creditors')) {
                $bills[] = ['type' => 'new', 'ledger_id' => $ledger->id, 'amount' => (float) $l['cost_amount'], 'due' => null, 'against' => null];
            }
        }

        return $bills;
    }

    // ── selling near-expiry and expired stock ─────────────────────────────

    /**
     * The rules for selling a product's stock, from Settings → Stock & expiry (with the category / product
     * exceptions): how many days of shelf life a batch needs for this channel, and whether an expired batch
     * may be sold (allowed outright, or only with an authorised override on this sale).
     *
     * @return array{sell_after: ?string, allow_expired: bool}
     */
    private function sellWindow(?int $productId, string $channel, ?array $override): array
    {
        $rules = app(\App\Services\Stock\StockPolicy::class)->forProduct($productId);
        $days = (int) ($channel === 'storefront' ? $rules['min_days_online'] : $rules['min_days_till']);

        return [
            'sell_after'    => $days > 0 ? today()->addDays($days)->toDateString() : null,
            'allow_expired' => $rules['sell_expired'] === 'allowed' || ($rules['sell_expired'] === 'override' && $override !== null),
        ];
    }

    /** An override asked for on this sale: needs a reason and a role the settings allow. Null when none was asked for. */
    private function expiredOverride(array $data, VoucherType $type, ?User $user): ?array
    {
        if (empty($data['expired_override']) || ! $type->isSalesSide()) {
            return null;
        }
        $reason = trim((string) ($data['expired_override']['reason'] ?? ''));
        if ($reason === '') {
            throw new BooksException('Give a reason for selling expired stock.');
        }
        $roles = app(\App\Services\Stock\StockPolicy::class)->global()['override_roles'];
        if (! $user || ! in_array($user->role, $roles, true)) {
            throw new BooksException('Your role can not override the expiry rules.');
        }

        return ['reason' => $reason, 'by' => $user->id];
    }

    /** A message for stock a sale will take although it is expired — shown on the preview, and the override reason logged on posting. */
    private function expiredWarnings(array $allocs): array
    {
        $ids = array_values(array_filter(array_unique(array_column($allocs, 'batch_id'))));
        if (! $ids) {
            return [];
        }
        $out = [];
        foreach (StockBatch::with('variant.product:id,name')->whereIn('id', $ids)->get() as $b) {
            if ($b->status === StockBatch::EXPIRED || ($b->expiry_date && $b->expiry_date->lt(today()))) {
                $out[] = ($b->variant?->product?->name ?? 'A product') . ', batch ' . ($b->batch_no ?: '#' . $b->id) . ' expired on ' . ($b->expiry_date?->format('d M Y') ?? '—') . ' — this sale uses it.';
            }
        }

        return $out;
    }

    // ── cost of goods sold ──────────────────────────────────────────────

    /**
     * The Dr Cost of Goods Sold / Cr Stock pair for a sale (and its reverse for a customer's return), at the
     * cost of the batches the goods came from. Only sales, cash sales and credit notes that post accounts;
     * nothing is posted until the Stock and Cost of Goods Sold ledgers are chosen in Books → Settings.
     *
     * A sale invoiced from an order or delivery note did not move the stock itself: its cost is the cost of
     * what the delivery took out (the average of that document family's movements for the product).
     *
     * @param  array  $allocs  what applyStock() did (or estimateAllocations() thinks it will do)
     */
    private function cogsEntries(array $plan, array $allocs): array
    {
        /** @var VoucherType $type */
        $type = $plan['type'];
        $base = $type->base_type;
        if (! $type->posts_accounts || ! in_array($base, [VoucherType::SALES, VoucherType::CASH_SALE, VoucherType::CREDIT_NOTE], true)) {
            return [];
        }
        $settings = AccountingSetting::current();
        if (! $settings->stock_ledger_id || ! $settings->cogs_ledger_id) {
            return [];
        }

        $cost = 0.0;       // goods sold
        $service = 0.0;    // materials a service used but did not charge for
        foreach ($allocs as $a) {
            $c = -(float) $a['qty'] * (float) $a['unit_cost'];   // out is positive cost, a return negative
            if (($a['purpose'] ?? null) === 'included') {
                $service += $c;
            } else {
                $cost += $c;
            }
        }
        if ($base !== VoucherType::CREDIT_NOTE && ! empty($plan['source_id'])) {
            foreach ($this->postingLines($plan['lines']) as $l) {
                if (empty($l['variant_id'])) {
                    continue;
                }
                $delivered = (float) ($l['base_quantity'] ?? 0) - ($plan['moves_stock'] ? (float) ($l['stock_qty'] ?? 0) : 0.0);
                if ($delivered > 0.00005 && ($avg = $this->familyAvgCost($plan['source_id'], (int) $l['variant_id'])) !== null) {
                    if (($l['material_mode'] ?? null) === 'included') {
                        $service += $delivered * $avg;
                    } else {
                        $cost += $delivered * $avg;
                    }
                }
            }
        }
        $cost = round($cost, 2);
        $service = round($service, 2);
        if (abs($cost) < 0.005 && abs($service) < 0.005) {
            return [];
        }

        $mk = fn (int $ledgerId, string $side, float $amount, string $note) => [
            'ledger_id' => $ledgerId, 'side' => $side, 'amount' => round(abs($amount) / (float) $plan['rate'], 2), 'base_amount' => round(abs($amount), 2),
            'is_party' => false, 'is_tax' => false, 'narration' => $note,
        ];
        if ($cost < 0) {   // a return
            return [$mk((int) $settings->stock_ledger_id, 'D', $cost, 'Returned stock at cost'), $mk((int) $settings->cogs_ledger_id, 'C', $cost, 'Cost of goods sold reversed')];
        }
        $serviceLedger = (int) ($settings->cost_of_services_ledger_id ?: $settings->cogs_ledger_id);
        $entries = [];
        if ($cost >= 0.005) {
            $entries[] = $mk((int) $settings->cogs_ledger_id, 'D', $cost, 'Cost of goods sold');
        }
        if ($service >= 0.005) {
            $entries[] = $mk($serviceLedger, 'D', $service, 'Materials used in services');
        }
        $entries[] = $mk((int) $settings->stock_ledger_id, 'C', $cost + $service, 'Stock used at cost');

        return $entries;
    }

    /** What applyStock() would do for these moves, without doing it — so a preview can show the cost. */
    private function estimateAllocations(array $moves): array
    {
        $batches = app(\App\Services\Stock\BatchService::class);
        $needs = [];
        $wins = [];
        $out = [];
        foreach ($moves as $m) {
            if ($m['qty'] < 0 && ! empty($m['batch_id'])) {
                $out = array_merge($out, array_map(fn ($a) => $a + ['variant_id' => $m['variant_id']], $batches->peek((int) $m['variant_id'], (int) $m['location_id'], abs($m['qty']), ['batch_id' => $m['batch_id']])));
            } elseif ($m['qty'] < 0) {
                $base = $m['variant_id'] . ':' . $m['location_id'];
                $key = $base . (($m['purpose'] ?? null) === 'included' ? ':included' : '');
                $needs[$key] = ($needs[$key] ?? 0) + abs($m['qty']);
                if (isset($m['window'])) {
                    $wins[$base] = $m['window'];
                }
            } elseif (array_key_exists('return_to', $m)) {
                $left = (float) $m['qty'];
                foreach ($m['return_to'] as [$batchId, $q]) {
                    $q = min($q, $left);
                    if ($q > 0.00005) {
                        $out[] = ['variant_id' => $m['variant_id'], 'batch_id' => $batchId, 'qty' => $q, 'unit_cost' => (float) StockBatch::whereKey($batchId)->value('unit_cost'), 'created' => false];
                        $left -= $q;
                    }
                }
                if ($left > 0.00005) {
                    $out[] = ['variant_id' => $m['variant_id'], 'batch_id' => null, 'qty' => $left, 'unit_cost' => $batches->lastCost((int) $m['variant_id']), 'created' => true];
                }
            }
        }
        foreach ($needs as $key => $qty) {
            [$variantId, $locId] = array_map('intval', explode(':', $key));
            $purpose = str_ends_with($key, ':included') ? 'included' : null;
            $out = array_merge($out, array_map(fn ($a) => $a + ['variant_id' => $variantId, 'purpose' => $purpose], $batches->peek($variantId, $locId, $qty, $wins[$variantId . ':' . $locId] ?? [])));
        }

        return $out;
    }

    /** Every voucher in the same chain as this one (quotation → order → delivery → invoice → returns), minus `$exclude`. */
    private function documentFamily(int $anyId, ?int $exclude = null): array
    {
        $root = $anyId;
        for ($i = 0; $i < 10 && ($parent = Voucher::whereKey($root)->value('source_voucher_id')); $i++) {
            $root = (int) $parent;
        }
        $ids = [$root];
        $frontier = [$root];
        for ($i = 0; $i < 10 && $frontier; $i++) {
            $kids = array_values(array_diff(Voucher::whereIn('source_voucher_id', $frontier)->pluck('id')->map(fn ($x) => (int) $x)->all(), $ids));
            $ids = array_merge($ids, $kids);
            $frontier = $kids;
        }

        return $exclude ? array_values(array_diff($ids, [$exclude])) : $ids;
    }

    /** Average cost per base unit of what left stock for a product anywhere in this document chain; null if nothing did. */
    private function familyAvgCost(int $sourceId, int $variantId): ?float
    {
        $rows = StockMovement::whereIn('voucher_id', $this->documentFamily($sourceId))->where('variant_id', $variantId)
            ->where('quantity', '<', 0)->whereNotNull('unit_cost')->get(['quantity', 'unit_cost']);
        $qty = $rows->sum(fn ($r) => abs((float) $r->quantity));

        return $qty > 0 ? $rows->sum(fn ($r) => abs((float) $r->quantity) * (float) $r->unit_cost) / $qty : null;
    }

    /**
     * Where a customer's return can go back to: the batches this chain took the product from and that have not
     * already come back, as [batch_id, quantity] pairs (at most `$qty` in all).
     */
    private function returnableBatches(int $sourceId, int $variantId, int $locationId, float $qty, ?int $exclude = null): array
    {
        $net = StockMovement::whereIn('voucher_id', $this->documentFamily($sourceId, $exclude))
            ->where('variant_id', $variantId)->where('location_id', $locationId)->whereNotNull('batch_id')
            ->orderBy('id')->get(['batch_id', 'quantity'])
            ->groupBy('batch_id')->map(fn ($g) => -$g->sum(fn ($r) => (float) $r->quantity));   // sold minus already returned
        $out = [];
        $left = $qty;
        foreach ($net as $batchId => $sold) {
            if ($sold > 0.00005 && $left > 0.00005) {
                $take = min($sold, $left);
                $out[] = [(int) $batchId, round($take, 4)];
                $left -= $take;
            }
        }

        return $out;
    }

    /** Write which batch each sale line came from, for products that track expiry (it prints on the invoice). */
    private function stampBatches(array $made, array $applied, ?int $voucherLocation): void
    {
        $queues = [];
        foreach ($applied as $a) {
            if ($a['qty'] < 0) {
                $queues[$a['variant_id'] . ':' . $a['location_id']][] = [$a['batch_id'], -(float) $a['qty']];
            }
        }
        foreach ($made as [$item, $l]) {
            $key = ($l['variant_id'] ?? 0) . ':' . ($l['location_id'] ?? $voucherLocation);
            if (empty($l['track_expiry']) || empty($l['variant_id']) || (float) ($l['stock_qty'] ?? 0) <= 0 || empty($queues[$key])) {
                continue;
            }
            $need = (float) $l['stock_qty'];
            $used = [];
            while ($need > 0.00005 && ! empty($queues[$key])) {
                $take = min($queues[$key][0][1], $need);
                $used[] = $queues[$key][0][0];
                $queues[$key][0][1] -= $take;
                $need -= $take;
                if ($queues[$key][0][1] <= 0.00005) {
                    array_shift($queues[$key]);
                }
            }
            $batches = StockBatch::whereIn('id', $used)->get();
            $item->update([
                'batch_no'    => $batches->pluck('batch_no')->filter()->unique()->implode(', ') ?: null,
                'expiry_date' => $batches->pluck('expiry_date')->filter()->sort()->first(),
            ]);
        }
    }

    // =====================================================================
    // PERSISTING
    // =====================================================================

    private function persist(array $plan, array $data, ?User $user, ?Voucher $existing): Voucher
    {
        /** @var VoucherType $type */
        $type = $plan['type'];
        $currency = $plan['currency'];

        // stock first — a shortage aborts before anything is written
        $applied = $plan['moves_stock'] ? $this->applyStock($plan['stock'], $plan['location_id'], $plan['date']->toDateString()) : [];

        $fields = [
            'date' => $plan['date']->toDateString(), 'effective_date' => $data['effective_date'] ?? null,
            'due_date' => $plan['due']?->toDateString(), 'location_id' => $plan['location_id'],
            'party_ledger_id' => $plan['party']?->id, 'customer_id' => $plan['customer']?->id,
            'payment_method_id' => $plan['method']?->id, 'currency_id' => $currency->id, 'exchange_rate' => $plan['rate'],
            'reference_no' => $data['reference_no'] ?? null, 'supplier_invoice_no' => $data['supplier_invoice_no'] ?? null,
            'party_name' => $data['party_name'] ?? null, 'party_phone' => $data['party_phone'] ?? null, 'party_address' => $data['party_address'] ?? null, 'party_tax_id' => $data['party_tax_id'] ?? null,
            'narration' => $data['narration'] ?? null,
            'subtotal' => $plan['subtotal'], 'tax_total' => $plan['tax_total'], 'total_amount' => $plan['total'],
            'base_total' => round($plan['total'] * $plan['rate'], 2), 'moves_stock' => $plan['moves_stock'],
            'source_voucher_id' => $data['source_voucher_id'] ?? null, 'channel' => $data['channel'] ?? 'admin',
            'meta' => ($data['meta'] ?? null) || ! empty($plan['meta_extra']) ? array_merge($data['meta'] ?? [], $plan['meta_extra'] ?? []) : null,
        ];

        if ($existing) {
            $existing->update($fields);
            $voucher = $existing;
        } else {
            [$series, $seq, $number] = $this->numbering->allocate($type, $plan['location_id'], $plan['date'], $data['series_id'] ?? null, $data['voucher_number'] ?? null);
            $voucher = Voucher::create($fields + [
                'voucher_type_id' => $type->id, 'series_id' => $series->id, 'voucher_number' => $number, 'sequence_number' => $seq,
                'status' => Voucher::POSTED, 'posted_at' => now(), 'created_by' => $user?->id,
                'fulfilment_status' => in_array($type->base_type, [VoucherType::SALES_ORDER, VoucherType::DELIVERY_NOTE, VoucherType::PURCHASE_ORDER, VoucherType::RECEIPT_NOTE], true) ? 'open' : null,
                'doc_status' => $type->base_type === VoucherType::QUOTATION ? ($data['doc_status'] ?? 'quoted') : null,
                'valid_until' => $data['valid_until'] ?? null,
            ]);
        }

        // items (headers first so children can point at them)
        $n = 0;
        $made = [];
        $service = null;   // the service line the materials that follow it belong to
        foreach ($plan['lines'] as $l) {
            $header = $this->createItem($voucher, $l, ++$n, ! empty($l['under_service']) ? $service : null);
            $service = $l['item_type'] === 'service' ? $header->id : (! empty($l['under_service']) ? $service : null);
            if (! $l['is_header']) {
                $made[] = [$header, $l];
            }
            foreach ($l['is_header'] ? $l['children'] : [] as $c) {
                $made[] = [$this->createItem($voucher, $c, ++$n, $header->id), $c];
            }
        }
        if ($type->isSalesSide() && $applied) {
            if (! empty($plan['expired_override']) && ($used = $this->expiredWarnings($applied))) {
                $this->audit($voucher, 'expired_stock_override', $user, ['reason' => $plan['expired_override']['reason'], 'batches' => $used]);
            }
            $this->stampBatches($made, $applied, $plan['location_id']);   // print which batch each line came from (expiry products only)
        }

        // what the goods sold cost (or, for a return, what comes back) — at the cost of the batches they came from
        $plan['entries'] = array_merge($plan['entries'], $this->cogsEntries($plan, $applied));

        $i = 0;
        foreach ($plan['entries'] as $e) {
            VoucherEntry::create(array_merge($e, ['voucher_id' => $voucher->id, 'line_no' => ++$i, 'created_at' => now()]));
        }
        foreach ($plan['bills'] as $b) {
            VoucherBillRef::create([
                'voucher_id' => $voucher->id, 'ledger_id' => $b['ledger_id'], 'ref_type' => $b['type'],
                'ref_name' => $b['against'] ? (Voucher::whereKey($b['against'])->value('voucher_number') ?? $voucher->voucher_number) : $voucher->voucher_number,
                'against_voucher_id' => $b['against'], 'amount' => $b['amount'], 'due_date' => $b['due']?->toDateString(), 'created_at' => now(),
            ]);
        }

        foreach ($plan['tenders'] ?? [] as $t) {
            if (! isset($t['amount'])) {
                continue;
            }
            VoucherTender::create([
                'voucher_id' => $voucher->id, 'payment_method_id' => $t['method']->id, 'amount' => $t['amount'], 'reference' => $t['reference'] ?? null,
                'gift_voucher_id' => $t['gift']?->id, 'gift_amount' => $t['gift_amount'] ?? null, 'created_at' => now(),
            ]);
            if ($t['gift']) {
                app(GiftVoucherService::class)->redeem($t['gift'], (float) $t['gift_amount'], $voucher, $user, round((float) $t['amount'] * (float) $voucher->exchange_rate, 2));
            }
        }

        // stock movement rows (line ids are known now) — one per batch the stock came from / went into
        foreach ($applied as $m) {
            StockMovement::create([
                'voucher_id' => $voucher->id, 'voucher_item_id' => null, 'variant_id' => $m['variant_id'], 'location_id' => $m['location_id'],
                'quantity' => $m['qty'], 'movement_type' => $type->base_type, 'movement_date' => $voucher->date, 'created_at' => now(),
                'batch_id' => $m['batch_id'] ?? null, 'unit_cost' => $m['unit_cost'] ?? null,
            ]);
            if (! empty($m['created']) && ! empty($m['batch_id'])) {
                StockBatch::whereKey($m['batch_id'])->update(['received_voucher_id' => $voucher->id]);
            }
        }

        return $voucher;
    }

    private function createItem(Voucher $voucher, array $l, int $lineNo, ?int $parentId): VoucherItem
    {
        $item = VoucherItem::create([
            'voucher_id' => $voucher->id, 'parent_item_id' => $parentId, 'line_no' => $lineNo, 'item_type' => $l['item_type'],
            'is_header' => $l['is_header'], 'product_id' => $l['product_id'], 'variant_id' => $l['variant_id'],
            'variant_unit_id' => $l['variant_unit_id'], 'service_id' => $l['service_id'], 'service_variant_id' => $l['service_variant_id'],
            'hamper_id' => $l['hamper_id'], 'description' => $l['description'], 'variant_label' => $l['variant_label'], 'sku' => $l['sku'],
            'unit_code' => $l['unit_code'], 'unit_factor' => $l['unit_factor'], 'quantity' => $l['quantity'], 'base_quantity' => $l['base_quantity'],
            'rate' => $l['rate'], 'discount_amount' => $l['discount_amount'], 'amount' => $l['amount'], 'tax_rate_id' => $l['tax_rate_id'],
            'tax_rate_percent' => $l['tax_rate_percent'], 'tax_amount' => $l['tax_amount'], 'ledger_id' => $l['ledger_id'],
            'location_id' => $l['location_id'] ?? $voucher->location_id, 'source_item_id' => $l['source_item_id'], 'notes' => $l['notes'],
            'discount_ledger_id' => $l['discount_ledger_id'] ?? null, 'discount_source' => $l['discount_source'] ?? null,
            'discount_ref' => $l['discount_ref'] ?? null, 'shipping_option_id' => $l['shipping_option_id'] ?? null,
            'pending_price' => ! empty($l['pending_price']), 'gift_meta' => $l['gift_meta'] ?? null,
            'batch_no' => $l['batch_no'] ?? null, 'mfg_date' => $l['mfg_date'] ?? null, 'expiry_date' => $l['expiry_date'] ?? null,
            'material_mode' => $l['material_mode'] ?? null, 'cost_amount' => ($l['cost_amount'] ?? 0) > 0 ? $l['cost_amount'] : null, 'paid_ledger_id' => $l['paid_ledger_id'] ?? null,
        ]);
        foreach ($l['taxes'] as $t) {
            VoucherItemTax::create(['item_id' => $item->id, 'tax_rate_id' => $t['tax_rate_id'], 'ledger_id' => $t['ledger_id'], 'label' => $t['label'], 'base_amount' => $t['base_amount'], 'tax_amount' => $t['tax_amount']]);
        }

        return $item;
    }

    /** Check availability for stock going out, then move it. @return array applied movements, one per batch */
    private function applyStock(array $moves, ?int $defaultLocation, ?string $date = null): array
    {
        $needs = [];
        $costs = [];
        $arrivals = [];   // stock arriving with its own batch number / dates: each becomes its own batch
        $picked = [];     // stock going out of a batch the seller named
        $returns = [];    // a customer's return: goes back into the batch(es) it was sold from
        $windows = [];    // sales: shelf life a batch needs, and whether an expired one may go
        $baseNeeds = [];  // what each variant needs at each branch, whatever it is for — availability is checked on this
        $batches = app(\App\Services\Stock\BatchService::class);
        foreach ($moves as $m) {
            if ($m['qty'] > 0 && ! empty($m['batch'])) {
                $arrivals[] = $m;
                continue;
            }
            if ($m['qty'] > 0 && array_key_exists('return_to', $m)) {
                $returns[] = $m;
                continue;
            }
            if ($m['qty'] < 0 && ! empty($m['batch_id'])) {
                $picked[] = $m;
                continue;
            }
            $base = $m['variant_id'] . ':' . $m['location_id'];
            $key = $base . (($m['purpose'] ?? null) === 'included' ? ':included' : '');   // included materials are kept apart so their cost can be booked separately
            $needs[$key] = ($needs[$key] ?? 0) + $m['qty'];
            $baseNeeds[$base] = ($baseNeeds[$base] ?? 0) + $m['qty'];
            if (isset($m['window'])) {
                $windows[$base] = $m['window'];
            }
            if (isset($m['unit_cost']) && $m['qty'] > 0) {
                $costs[$key]['amount'] = ($costs[$key]['amount'] ?? 0) + $m['unit_cost'] * $m['qty'];
                $costs[$key]['qty'] = ($costs[$key]['qty'] ?? 0) + $m['qty'];
            }
        }
        foreach ($baseNeeds as $key => $qty) {
            if ($qty >= 0) {
                continue;
            }
            [$variantId, $locId] = array_map('intval', explode(':', $key));
            $a = $this->stock->availability($variantId, $locId, abs($qty));
            $name = collect($moves)->firstWhere('variant_id', $variantId)['product'] ?? "variant #{$variantId}";
            $where = $a['location'] ?? 'that branch';
            $elsewhere = $a['elsewhere'] ? ' Available at: ' . collect($a['elsewhere'])->map(fn ($e) => "{$e['name']} ({$e['quantity']})")->implode(', ') . '.' : '';
            if (isset($windows[$key])) {
                // a sale: only stock that may be sold counts — not expired, and with the shelf life the settings ask for
                $have = $batches->sellable($variantId, $locId, $windows[$key]);
                if ($have + 0.00005 < abs($qty)) {
                    $inDate = $batches->sellable($variantId, $locId);
                    $expired = $batches->expiredOnHand($variantId, $locId);
                    $held = array_filter([
                        $expired > 0.00005 ? round($expired, 4) . ' expired' : null,
                        $inDate - $have > 0.00005 ? round($inDate - $have, 4) . ' too close to expiry to sell' : null,
                    ]);
                    throw new BooksException("Not enough {$name} that can be sold at {$where}: need " . abs($qty) . ', ' . round($have, 4) . ' available' . ($held ? ' (' . implode(', ', $held) . ' held back)' : '') . ".{$elsewhere}");
                }
            } elseif (! $a['ok']) {
                throw new BooksException("Not enough stock of {$name} at {$where}: need " . abs($qty) . ", have {$a['quantity']}.{$elsewhere}");
            }
        }
        foreach ($picked as $m) {
            $b = StockBatch::find($m['batch_id']);
            $have = (float) DB::table('stock_batch_balances')->where('batch_id', $m['batch_id'])->where('location_id', $m['location_id'])->value('quantity');
            if (! $b || (int) $b->variant_id !== (int) $m['variant_id']) {
                throw new BooksException("{$m['product']}: that batch can not be used.");
            }
            if (empty($m['allow_inactive'])) {
                // a sale: the named batch must be one the rules let this sale use
                $win = $m['window'] ?? ['sell_after' => null, 'allow_expired' => false];
                $expired = $b->status === StockBatch::EXPIRED || ($b->expiry_date && $b->expiry_date->lt(today()));
                $name = $b->batch_no ?: '#' . $b->id;
                if (! in_array($b->status, [StockBatch::ACTIVE, StockBatch::EXPIRED], true)) {
                    throw new BooksException("{$m['product']}: batch {$name} is {$b->status} and can not be sold.");
                }
                if ($expired && ! $win['allow_expired']) {
                    throw new BooksException("{$m['product']}: batch {$name} expired on " . ($b->expiry_date?->format('d M Y') ?? '—') . ' and can not be sold.');
                }
                if (! $expired && $win['sell_after'] && $b->expiry_date && $b->expiry_date->toDateString() < $win['sell_after']) {
                    throw new BooksException("{$m['product']}: batch {$name} expires on " . $b->expiry_date->format('d M Y') . ', sooner than the shelf life this sale needs.');
                }
            }
            if ($have + 0.00005 < abs($m['qty'])) {
                throw new BooksException("{$m['product']}: batch " . ($b->batch_no ?: '#' . $b->id) . ' has only ' . round($have, 4) . ' here, need ' . abs($m['qty']) . '.');
            }
        }

        $out = [];
        $record = function (int $variantId, int $locId, array $allocs, ?string $purpose = null) use (&$out) {
            foreach ($allocs as $alloc) {
                $out[] = ['variant_id' => $variantId, 'location_id' => $locId, 'qty' => $alloc['qty'], 'batch_id' => $alloc['batch_id'], 'unit_cost' => $alloc['unit_cost'], 'created' => $alloc['created'], 'purpose' => $purpose];
            }
        };
        foreach ($needs as $key => $qty) {
            [$variantId, $locId] = array_map('intval', explode(':', $key));
            $purpose = str_ends_with($key, ':included') ? 'included' : null;
            $base = $variantId . ':' . $locId;
            $opts = ['received_at' => $date];
            if (! empty($costs[$key]['qty'])) {
                $opts['unit_cost'] = round($costs[$key]['amount'] / $costs[$key]['qty'], 4);   // lines of one arrival share a batch at their average cost
            }
            if (isset($windows[$base])) {
                $opts += $windows[$base];
            }
            $record($variantId, $locId, $this->stock->applyDelta($variantId, $locId, $qty, $opts), $purpose);
        }
        foreach ($arrivals as $m) {
            $record((int) $m['variant_id'], (int) $m['location_id'], $this->stock->applyDelta((int) $m['variant_id'], (int) $m['location_id'], (float) $m['qty'],
                ['received_at' => $date, 'unit_cost' => $m['unit_cost'] ?? null] + $m['batch']));
        }
        foreach ($picked as $m) {
            $record((int) $m['variant_id'], (int) $m['location_id'], $this->stock->applyDelta((int) $m['variant_id'], (int) $m['location_id'], (float) $m['qty'], ['batch_id' => $m['batch_id']]));
        }
        foreach ($returns as $m) {
            $left = (float) $m['qty'];
            foreach ($m['return_to'] as [$batchId, $q]) {
                $q = min($q, $left);
                if ($q > 0.00005) {
                    if (! empty($m['hold']) && ($orig = StockBatch::find($batchId))) {
                        $record((int) $m['variant_id'], (int) $m['location_id'], $batches->receiveHeld($orig, (int) $m['location_id'], $q, 'Customer return — check before shelving', ['received_at' => $date]));
                    } else {
                        $record((int) $m['variant_id'], (int) $m['location_id'], $this->stock->applyDelta((int) $m['variant_id'], (int) $m['location_id'], $q, ['batch_id' => $batchId]));
                    }
                    $left = round($left - $q, 4);
                }
            }
            if ($left > 0.00005) {   // more came back than we can trace: a new batch at the latest known cost
                $record((int) $m['variant_id'], (int) $m['location_id'], $this->stock->applyDelta((int) $m['variant_id'], (int) $m['location_id'], $left, ['received_at' => $date]));
            }
        }

        return $out;
    }

    /** Undo a voucher's stock and chain effects (before an edit or a cancel). */
    private function reverseEffects(Voucher $voucher): void
    {
        // Stock this voucher brought in cannot be taken back once some of it has been sold or used.
        foreach (StockMovement::where('voucher_id', $voucher->id)->where('reversed', false)->where('quantity', '>', 0)->whereNotNull('batch_id')->get() as $m) {
            $left = (float) DB::table('stock_batch_balances')->where('batch_id', $m->batch_id)->where('location_id', $m->location_id)->value('quantity');
            if ($left + 0.00005 < (float) $m->quantity) {
                $b = StockBatch::find($m->batch_id);
                $what = $b?->batch_no ? "batch {$b->batch_no}" : 'a batch';
                throw new BooksException("Some of the stock this voucher brought in ({$what}) has already been sold or used, so it can not be changed. Return it to the supplier with a Debit Note instead.");
            }
        }
        foreach (StockMovement::where('voucher_id', $voucher->id)->where('reversed', false)->get() as $m) {
            // back into / out of the very batch it went through (movements from before batches have none)
            $this->stock->applyDelta($m->variant_id, $m->location_id, -(float) $m->quantity, $m->batch_id ? ['batch_id' => $m->batch_id] : []);
            $m->update(['reversed' => true]);
        }
        StockMovement::where('voucher_id', $voucher->id)->delete();
        // batches this voucher brought in and that are now empty go with it
        StockBatch::where('received_voucher_id', $voucher->id)
            ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('stock_batch_balances as b')->whereColumn('b.batch_id', 'stock_batches.id')->where('b.quantity', '>', 0))
            ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('stock_movements as m')->whereColumn('m.batch_id', 'stock_batches.id'))
            ->delete();
        app(GiftVoucherService::class)->restoreFor($voucher);
        app(GiftVoucherService::class)->voidForSale($voucher);   // vouchers this sale issued (refused if any was already spent)
        VoucherTender::where('voucher_id', $voucher->id)->delete();
        $voucher->load('items');
        $this->bumpSources($voucher, -1);
    }

    private function bumpSources(Voucher $child, int $sign): void
    {
        $child->loadMissing('type', 'items', 'source');
        $field = match ($child->type->base_type) {
            VoucherType::DELIVERY_NOTE, VoucherType::RECEIPT_NOTE => 'delivered_quantity',
            VoucherType::SALES, VoucherType::CASH_SALE, VoucherType::PURCHASE => 'invoiced_quantity',
            default => null,
        };
        if (! $field || ! $child->source) {
            return;
        }
        $touched = [$child->source_voucher_id];
        foreach ($child->items as $it) {
            if (! $it->source_item_id || $it->is_header && false) {
                continue;
            }
            $src = VoucherItem::find($it->source_item_id);
            if (! $src) {
                continue;
            }
            $src->{$field} = max(0, (float) $src->{$field} + $sign * (float) $it->quantity);
            $src->save();
            if ($field === 'invoiced_quantity' && $src->source_item_id) {
                $order = VoucherItem::find($src->source_item_id);
                if ($order) {
                    $order->invoiced_quantity = max(0, (float) $order->invoiced_quantity + $sign * (float) $it->quantity);
                    $order->save();
                    $touched[] = $order->voucher_id;
                }
            }
        }
        foreach (array_unique($touched) as $vid) {
            $this->refreshFulfilment(Voucher::find($vid));
        }
    }

    private function refreshFulfilment(?Voucher $v): void
    {
        if (! $v || ! in_array($v->type?->base_type ?? VoucherType::find($v->voucher_type_id)?->base_type, [VoucherType::SALES_ORDER, VoucherType::DELIVERY_NOTE, VoucherType::PURCHASE_ORDER, VoucherType::RECEIPT_NOTE], true)) {
            return;
        }
        $items = $v->items()->where('is_header', false)->get();
        if ($items->isEmpty()) {
            return;
        }
        $closed = $items->every(fn ($i) => (float) $i->invoiced_quantity + 0.00001 >= (float) $i->quantity);
        $touched = $items->contains(fn ($i) => (float) $i->invoiced_quantity > 0 || (float) $i->delivered_quantity > 0);
        $v->update(['fulfilment_status' => $closed ? 'closed' : ($touched ? 'partial' : 'open')]);
    }

    private function assertNoLiveChildren(Voucher $voucher, string $action): void
    {
        $live = Voucher::where('source_voucher_id', $voucher->id)->where('status', Voucher::POSTED)->first();
        if ($live) {
            throw new BooksException("Can't {$action} {$voucher->voucher_number} — {$live->voucher_number} was made from it. " . ucfirst($action) . ' that first.');
        }
        // anything that settles a bill of this voucher
        $settled = DB::table('voucher_bill_refs as b')->join('vouchers as v', 'v.id', '=', 'b.voucher_id')
            ->where('b.against_voucher_id', $voucher->id)->where('b.ref_type', 'against')->where('v.status', Voucher::POSTED)
            ->where('v.id', '!=', $voucher->id)->value('v.voucher_number');
        if ($settled) {
            throw new BooksException("Can't {$action} {$voucher->voucher_number} — {$settled} settles it. " . ucfirst($action) . ' that first.');
        }
    }

    // ── describe / audit ───────────────────────────────────────────────

    /**
     * The tax on a document, one row per tax as the sales / purchase ledger names it ("VAT 16%") — nothing hardcoded.
     *
     * @return array<int, array{label: string, percent: ?float, amount: float}>
     */
    private function taxBreakdown(array $lines): array
    {
        $rows = [];
        $walk = function (array $l) use (&$rows, &$walk) {
            foreach ($l['taxes'] ?? [] as $t) {
                $key = ($t['ledger_id'] ?? '') . '|' . ($t['label'] ?? '');
                $rows[$key] ??= ['label' => (string) ($t['label'] ?? 'Tax'), 'percent' => isset($t['percent']) ? (float) $t['percent'] : null, 'amount' => 0.0];
                $rows[$key]['amount'] = round($rows[$key]['amount'] + (float) $t['tax_amount'], 2);
            }
            foreach ($l['children'] ?? [] as $c) {
                $walk($c);
            }
        };
        foreach ($lines as $l) {
            $walk($l);
        }

        return array_values(array_filter($rows, fn ($r) => abs($r['amount']) >= 0.005));
    }

    private function describe(array $plan): array
    {
        $flat = fn (array $l) => [
            'item_type' => $l['item_type'], 'is_header' => $l['is_header'], 'description' => $l['description'], 'variant_label' => $l['variant_label'],
            'sku' => $l['sku'], 'unit_code' => $l['unit_code'], 'quantity' => $l['quantity'], 'rate' => $l['rate'], 'discount_amount' => $l['discount_amount'],
            'amount' => $l['amount'], 'tax_rate_percent' => $l['tax_rate_percent'], 'tax_amount' => $l['tax_amount'],
            'material_mode' => $l['material_mode'] ?? null,
            'taxes' => array_map(fn ($t) => ['label' => $t['label'], 'tax_amount' => $t['tax_amount'], 'ledger_id' => $t['ledger_id']], $l['taxes']),
        ];
        $lines = [];
        foreach ($plan['lines'] as $l) {
            $row = $flat($l);
            if ($l['is_header']) {
                $row['children'] = array_map($flat, $l['children']);
            }
            $lines[] = $row;
        }
        $ledgerNames = Ledger::whereIn('id', array_column($plan['entries'], 'ledger_id'))->pluck('name', 'id');

        return [
            'type' => $plan['type']->only(['id', 'code', 'name', 'base_type']),
            'currency' => $plan['currency']->code, 'exchange_rate' => $plan['rate'],
            'party' => $plan['party']?->name, 'lines' => $lines,
            'entries' => array_map(fn ($e) => $e + ['ledger' => $ledgerNames[$e['ledger_id']] ?? null], $plan['entries']),
            'subtotal' => $plan['subtotal'], 'tax_total' => $plan['tax_total'], 'tax_breakdown' => $this->taxBreakdown($plan['lines']), 'total' => $plan['total'],
            'stock' => array_map(fn ($m) => ['variant_id' => $m['variant_id'], 'location_id' => $m['location_id'], 'qty' => $m['qty']], $plan['stock']),
            'warnings' => $plan['warnings'] ?? [],
            'discount_options' => $plan['discount_options'] ?? [],
        ];
    }

    /** Points are earned when money arrives (a Cash Sale, a Receipt); an Invoice counts as an order. A reward problem never undoes a sale. */
    private function rewardHook(Voucher $voucher): void
    {
        try {
            $voucher->loadMissing('type');
            $rewards = app(RewardService::class);
            match ($voucher->type->base_type) {
                VoucherType::CASH_SALE, VoucherType::RECEIPT => $rewards->onMoneyReceived($voucher),
                VoucherType::SALES => $rewards->onInvoiced($voucher),
                default => null,
            };
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** Edit log: keep a snapshot of the voucher (activity null = only make sure version 1 exists). Never stops a save. */
    private function versionHook(Voucher $voucher, ?string $activity, ?User $user): void
    {
        try {
            $versions = app(VoucherVersionService::class);
            $activity === null ? $versions->baseline($voucher) : $versions->record($voucher, $activity, $user);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** A promo code is used when the voucher carrying it is posted. */
    private function promoHook(Voucher $voucher): void
    {
        try {
            app(PromoUsageService::class)->record($voucher);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** Take back what a voucher earned and used: loyalty points and counters, and the promo code's use. */
    private function undoRewards(Voucher $voucher): void
    {
        try {
            app(RewardService::class)->onCancel($voucher);
            app(PromoUsageService::class)->reverse($voucher);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    private function audit(Voucher $voucher, string $action, ?User $user, array $detail = []): void
    {
        VoucherAuditLog::create(['voucher_id' => $voucher->id, 'action' => $action, 'user_id' => $user?->id, 'detail' => $detail ?: null, 'created_at' => now()]);
    }

    public function relations(): array
    {
        return ['type', 'series', 'partyLedger', 'customer:id,first_name,last_name,email', 'location:id,name,code', 'currency:id,code,symbol',
                'paymentMethod', 'source:id,voucher_number,voucher_type_id', 'children:id,voucher_number,voucher_type_id,source_voucher_id,status,total_amount',
                'items.taxes', 'entries.ledger:id,name', 'billRefs', 'audit.user:id,name'];
    }
}
