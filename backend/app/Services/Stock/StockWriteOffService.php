<?php

namespace App\Services\Stock;

use App\Models\Books\AccountingSetting;
use App\Models\Books\StockMovement;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\ProductVariantUnit;
use App\Models\StockBatch;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use App\Services\Location\VariantStockService;
use Illuminate\Support\Facades\DB;

/**
 * What can be done with stock that has expired: write it off (a loss) or send it back to the supplier.
 *
 *  - Write-off: the stock leaves its batch, and a Journal posts Dr Stock Loss / Cr Stock at the batch's cost.
 *    Cancelling that journal puts the stock back in the batch. A batch that cost nothing (opening stock at
 *    cost 0) has no journal to post; the stock just leaves.
 *  - Return to supplier: a Debit Note that takes the stock out of the batch and reduces what we owe the
 *    supplier (Dr Supplier / Cr Stock), against the purchase it came in on when there is one.
 */
class StockWriteOffService
{
    public function __construct(
        private BatchService $batches,
        private VariantStockService $stock,
        private VoucherService $vouchers,
    ) {}

    /**
     * @param  ?int  $locationId  one branch, or every branch holding the batch
     * @param  ?float  $quantity  how much (base units), or all of it
     * @return array{voucher_id: ?int, quantity: float, cost: float}
     */
    public function writeOff(StockBatch $batch, ?int $locationId, ?float $quantity, string $reason, ?User $user = null): array
    {
        $reason = trim($reason);
        if ($reason === '') {
            throw new BooksException('Give a reason for writing the stock off.');
        }

        return DB::transaction(function () use ($batch, $locationId, $quantity, $reason, $user) {
            $takes = $this->takes($batch, $locationId, $quantity);
            $qty = round(array_sum(array_column($takes, 'qty')), 4);
            $cost = round($qty * (float) $batch->unit_cost, 2);
            $voucherId = null;

            if ($cost >= 0.005) {
                $s = AccountingSetting::current();
                if (! $s->stock_loss_ledger_id || ! $s->stock_ledger_id) {
                    throw new BooksException('Choose the Stock and Stock Loss ledgers under Books → Settings → Default ledgers first.');
                }
                $journal = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');
                $voucherId = $this->vouchers->create([
                    'voucher_type_id' => $journal->id, 'date' => today()->toDateString(), 'location_id' => $takes[0]['location_id'],
                    'narration' => 'Stock written off: ' . $this->label($batch) . ' — ' . $reason,
                    'meta' => ['write_off' => ['batch_id' => $batch->id, 'quantity' => $qty, 'reason' => $reason]],
                    'entries' => [
                        ['ledger_id' => $s->stock_loss_ledger_id, 'side' => 'D', 'amount' => $cost],
                        ['ledger_id' => $s->stock_ledger_id, 'side' => 'C', 'amount' => $cost],
                    ],
                ], $user)->id;
            }

            foreach ($takes as $t) {
                $this->stock->applyDelta((int) $batch->variant_id, $t['location_id'], -$t['qty'], ['batch_id' => $batch->id]);
                StockMovement::create([
                    'voucher_id' => $voucherId, 'voucher_item_id' => null, 'variant_id' => $batch->variant_id, 'location_id' => $t['location_id'],
                    'quantity' => -$t['qty'], 'movement_type' => 'write_off', 'movement_date' => today()->toDateString(), 'created_at' => now(),
                    'batch_id' => $batch->id, 'unit_cost' => $batch->unit_cost,
                ]);
            }

            return ['voucher_id' => $voucherId, 'quantity' => $qty, 'cost' => $cost];
        });
    }

    /** Send stock back to the supplier on a Debit Note. Returns the note. */
    public function returnToSupplier(StockBatch $batch, int $locationId, float $quantity, ?int $supplierLedgerId, string $reason, ?User $user = null): Voucher
    {
        $note = VoucherType::byBase(VoucherType::DEBIT_NOTE) ?? throw new BooksException('The Debit Note voucher type is switched off.');
        if ($note->stock_effect !== 'out') {
            throw new BooksException('The Debit Note voucher type does not move stock out. Set it to move stock out under Books → Voucher types.');
        }
        $this->takes($batch, $locationId, $quantity);   // refuses more than the batch holds there

        $received = $batch->received_voucher_id ? Voucher::with('type')->find($batch->received_voucher_id) : null;
        $party = $supplierLedgerId ?: $received?->party_ledger_id;
        if (! $party) {
            throw new BooksException('Choose the supplier this goes back to.');
        }
        $unit = ProductVariantUnit::where('variant_id', $batch->variant_id)->where('role', 'base')->value('id');
        // bill the return against the purchase it came in on, when it came in on one from this supplier
        $against = $received && $received->type?->base_type === VoucherType::PURCHASE && (int) $received->party_ledger_id === (int) $party ? $received->id : null;

        return $this->vouchers->create([
            'voucher_type_id' => $note->id, 'date' => today()->toDateString(), 'location_id' => $locationId, 'party_ledger_id' => $party,
            'source_voucher_id' => $against, 'moves_stock' => true,
            'narration' => 'Returned to supplier: ' . $this->label($batch) . (trim($reason) !== '' ? ' — ' . trim($reason) : ''),
            'lines' => [[
                'type' => 'product', 'variant_id' => $batch->variant_id, 'variant_unit_id' => $unit, 'quantity' => $quantity,
                'rate' => (float) $batch->unit_cost, 'batch_id' => $batch->id,
            ]],
        ], $user);
    }

    /** How much to take from which branch: one branch or all of them, at most what the batch holds. */
    private function takes(StockBatch $batch, ?int $locationId, ?float $quantity): array
    {
        $rows = DB::table('stock_batch_balances')->where('batch_id', $batch->id)->where('quantity', '>', 0)
            ->when($locationId, fn ($q) => $q->where('location_id', $locationId))->orderBy('location_id')->get();
        $held = (float) $rows->sum('quantity');
        if ($held < 0.00005) {
            throw new BooksException('Nothing is left of that batch' . ($locationId ? ' at that branch' : '') . '.');
        }
        $left = $quantity === null ? $held : round($quantity, 4);
        if ($left <= 0) {
            throw new BooksException('Enter how many to take out.');
        }
        if ($left - $held > 0.00005) {
            throw new BooksException('Only ' . round($held, 4) . ' of that batch ' . ($locationId ? 'is at that branch' : 'is left') . ", not {$left}.");
        }
        $out = [];
        foreach ($rows as $r) {
            if ($left <= 0.00005) {
                break;
            }
            $take = round(min((float) $r->quantity, $left), 4);
            $out[] = ['location_id' => (int) $r->location_id, 'qty' => $take];
            $left = round($left - $take, 4);
        }

        return $out;
    }

    private function label(StockBatch $b): string
    {
        $b->loadMissing('variant.product:id,name');

        return ($b->variant?->product?->name ?? 'Product') . ', batch ' . ($b->batch_no ?: '#' . $b->id);
    }
}
