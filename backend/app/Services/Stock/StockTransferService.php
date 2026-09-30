<?php

namespace App\Services\Stock;

use App\Models\Books\AccountingSetting;
use App\Models\Books\StockMovement;
use App\Models\Books\VoucherType;
use App\Models\StockBatch;
use App\Models\StockTransfer;
use App\Models\StockTransferLine;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use App\Services\Location\VariantStockService;
use Illuminate\Support\Facades\DB;

/**
 * Stock between branches. Sending takes the stock out of the sending branch at once (first-expiring batches first);
 * it is "in transit" until the other branch receives it, batch numbers, expiry and cost intact. Cancelling while it
 * is in transit puts it back. A shortfall on receipt is written off as a Stock Loss. Nothing else is posted: it is
 * the same stock, in the same company.
 */
class StockTransferService
{
    public function __construct(private VariantStockService $stock, private VoucherService $vouchers) {}

    /**
     * @param  array<int, array{variant_id:int, quantity:float}>  $items  base units
     */
    public function send(int $from, int $to, array $items, ?string $note, ?User $user = null): StockTransfer
    {
        if ($from === $to) {
            throw new BooksException('Choose two different branches.');
        }
        $items = array_values(array_filter($items, fn ($i) => (float) ($i['quantity'] ?? 0) > 0));
        if (! $items) {
            throw new BooksException('Add at least one item to send.');
        }

        return DB::transaction(function () use ($from, $to, $items, $note, $user) {
            $t = StockTransfer::create(['from_location_id' => $from, 'to_location_id' => $to, 'status' => StockTransfer::IN_TRANSIT,
                'note' => $note, 'sent_by' => $user?->id, 'sent_at' => now()]);
            $t->update(['number' => 'TR-' . str_pad((string) $t->id, 6, '0', STR_PAD_LEFT)]);

            foreach ($items as $i) {
                $variantId = (int) $i['variant_id'];
                $qty = round((float) $i['quantity'], 4);
                $have = app(BatchService::class)->sellable($variantId, $from);
                if ($have + 0.00005 < $qty) {
                    $name = DB::table('product_variants as pv')->join('products as p', 'p.id', '=', 'pv.product_id')->where('pv.id', $variantId)->value('p.name') ?? "item #{$variantId}";
                    throw new BooksException("Only {$have} of {$name} can be sent from this branch (expired or held stock cannot be transferred).");
                }
                foreach ($this->stock->applyDelta($variantId, $from, -$qty) as $a) {
                    $q = abs($a['qty']);
                    StockTransferLine::create(['transfer_id' => $t->id, 'variant_id' => $variantId, 'batch_id' => $a['batch_id'], 'quantity' => $q, 'unit_cost' => $a['unit_cost']]);
                    $this->move($t, $variantId, $from, -$q, 'transfer_out', $a['batch_id'], $a['unit_cost']);
                }
            }

            return $t->load('lines');
        });
    }

    /**
     * The receiving branch accepts the stock. `$received` maps line id => quantity that arrived (default: all of it).
     * Anything short is written off as a Stock Loss.
     */
    public function receive(StockTransfer $t, array $received = [], ?User $user = null): StockTransfer
    {
        $this->needInTransit($t);

        return DB::transaction(function () use ($t, $received, $user) {
            $short = 0.0;
            foreach ($t->lines as $l) {
                $got = round(min((float) $l->quantity, max(0.0, (float) ($received[$l->id] ?? $l->quantity))), 4);
                if ($got > 0) {
                    $this->stock->applyDelta((int) $l->variant_id, (int) $t->to_location_id, $got, ['batch_id' => $l->batch_id, 'no_blend' => true]);
                    $this->move($t, (int) $l->variant_id, (int) $t->to_location_id, $got, 'transfer_in', (int) $l->batch_id, (float) $l->unit_cost);
                }
                $l->update(['received_qty' => $got]);
                $short += ((float) $l->quantity - $got) * (float) $l->unit_cost;
            }
            if ($short >= 0.005) {
                $this->writeOffShortfall($t, round($short, 2), $user);
            }
            $t->update(['status' => StockTransfer::RECEIVED, 'received_by' => $user?->id, 'received_at' => now()]);

            return $t->load('lines');
        });
    }

    /** Stop a transfer that has not arrived: the stock goes back to the sending branch, into the batches it came from. */
    public function cancel(StockTransfer $t): StockTransfer
    {
        $this->needInTransit($t);

        return DB::transaction(function () use ($t) {
            foreach ($t->lines as $l) {
                $this->stock->applyDelta((int) $l->variant_id, (int) $t->from_location_id, (float) $l->quantity, ['batch_id' => $l->batch_id, 'no_blend' => true]);
            }
            StockMovement::where('ref_type', 'transfer')->where('ref_id', $t->id)->update(['reversed' => true]);
            $t->update(['status' => StockTransfer::CANCELLED]);

            return $t;
        });
    }

    /** Cost of everything still on the road (base currency). */
    public function inTransitValue(): float
    {
        return round((float) DB::table('stock_transfer_lines as l')->join('stock_transfers as t', 't.id', '=', 'l.transfer_id')
            ->where('t.status', StockTransfer::IN_TRANSIT)->selectRaw('COALESCE(SUM(l.quantity * l.unit_cost), 0) as v')->value('v'), 2);
    }

    private function writeOffShortfall(StockTransfer $t, float $cost, ?User $user): void
    {
        $s = AccountingSetting::current();
        if (! $s->stock_loss_ledger_id || ! $s->stock_ledger_id) {
            throw new BooksException('Choose the Stock and Stock Loss ledgers under Books → Settings → Default ledgers before receiving a short delivery.');
        }
        $journal = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');
        $this->vouchers->create([
            'voucher_type_id' => $journal->id, 'date' => today()->toDateString(), 'location_id' => $t->to_location_id,
            'narration' => "Short delivery on transfer {$t->number}",
            'meta' => ['transfer_shortfall' => ['transfer_id' => $t->id]],
            'entries' => [
                ['ledger_id' => $s->stock_loss_ledger_id, 'side' => 'D', 'amount' => $cost],
                ['ledger_id' => $s->stock_ledger_id, 'side' => 'C', 'amount' => $cost],
            ],
        ], $user);
    }

    private function needInTransit(StockTransfer $t): void
    {
        if ($t->status !== StockTransfer::IN_TRANSIT) {
            throw new BooksException("Transfer {$t->number} is already {$t->status}.");
        }
    }

    private function move(StockTransfer $t, int $variantId, int $location, float $qty, string $type, int $batchId, float $cost): void
    {
        StockMovement::create(['voucher_id' => null, 'voucher_item_id' => null, 'variant_id' => $variantId, 'location_id' => $location, 'quantity' => $qty,
            'movement_type' => $type, 'movement_date' => today()->toDateString(), 'created_at' => now(), 'batch_id' => $batchId, 'unit_cost' => $cost,
            'ref_type' => 'transfer', 'ref_id' => $t->id]);
    }
}
