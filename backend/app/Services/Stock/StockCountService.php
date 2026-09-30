<?php

namespace App\Services\Stock;

use App\Models\Books\AccountingSetting;
use App\Models\Books\StockMovement;
use App\Models\Books\VoucherType;
use App\Models\StockCount;
use App\Models\StockCountLine;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use App\Services\Location\VariantStockService;
use Illuminate\Support\Facades\DB;

/**
 * Counting a branch's shelves. Starting a count lists every batch the books say is there; the counter enters what is
 * actually found; posting corrects the batches to the counted quantities and books the net difference on a Journal
 * (a loss: Dr Stock Loss, Cr Stock; a gain the other way round). Lines left empty are not counted and stay as they are.
 */
class StockCountService
{
    public function __construct(private VariantStockService $stock, private VoucherService $vouchers) {}

    public function start(int $locationId, ?string $note, ?User $user = null): StockCount
    {
        return DB::transaction(function () use ($locationId, $note, $user) {
            if (StockCount::where('location_id', $locationId)->where('status', 'open')->exists()) {
                throw new BooksException('This branch already has a count open. Post or cancel it first.');
            }
            $c = StockCount::create(['location_id' => $locationId, 'status' => 'open', 'note' => $note, 'created_by' => $user?->id]);
            $c->update(['number' => 'SC-' . str_pad((string) $c->id, 6, '0', STR_PAD_LEFT)]);
            $rows = DB::table('stock_batch_balances as bb')->join('stock_batches as sb', 'sb.id', '=', 'bb.batch_id')
                ->where('bb.location_id', $locationId)->where('bb.quantity', '>', 0)->orderBy('sb.variant_id')->orderBy('sb.expiry_date')->orderBy('sb.id')
                ->get(['sb.variant_id', 'bb.batch_id', 'bb.quantity', 'sb.unit_cost']);
            foreach ($rows as $r) {
                StockCountLine::create(['count_id' => $c->id, 'variant_id' => $r->variant_id, 'batch_id' => $r->batch_id, 'expected_qty' => $r->quantity, 'unit_cost' => $r->unit_cost]);
            }
            if ($rows->isEmpty()) {
                throw new BooksException('There is no stock at this branch to count.');
            }

            return $c->load('lines');
        });
    }

    /** @param array<int, float|string|null> $counted line id => quantity found ('' or null = not counted) */
    public function save(StockCount $c, array $counted): StockCount
    {
        $this->needOpen($c);
        foreach ($c->lines as $l) {
            if (array_key_exists($l->id, $counted)) {
                $v = $counted[$l->id];
                if ($v !== null && $v !== '' && (float) $v < 0) {
                    throw new BooksException('A counted quantity cannot be negative.');
                }
                $l->update(['counted_qty' => ($v === null || $v === '') ? null : round((float) $v, 4)]);
            }
        }

        return $c->load('lines');
    }

    /** @return array{lines:int, loss:float, gain:float, voucher_id:?int} */
    public function post(StockCount $c, array $counted = [], ?User $user = null): array
    {
        $this->needOpen($c);

        return DB::transaction(function () use ($c, $counted, $user) {
            $this->save($c, $counted);
            $loss = 0.0;
            $gain = 0.0;
            $n = 0;
            foreach ($c->lines()->get() as $l) {
                if ($l->counted_qty === null) {
                    continue;
                }
                $have = (float) DB::table('stock_batch_balances')->where('batch_id', $l->batch_id)->where('location_id', $c->location_id)->value('quantity');
                $diff = round((float) $l->counted_qty - $have, 4);
                if (abs($diff) < 0.00005) {
                    continue;
                }
                $this->stock->applyDelta((int) $l->variant_id, (int) $c->location_id, $diff, ['batch_id' => $l->batch_id, 'no_blend' => true]);
                StockMovement::create(['voucher_id' => null, 'voucher_item_id' => null, 'variant_id' => $l->variant_id, 'location_id' => $c->location_id, 'quantity' => $diff,
                    'movement_type' => $diff < 0 ? 'count_loss' : 'count_gain', 'movement_date' => today()->toDateString(), 'created_at' => now(),
                    'batch_id' => $l->batch_id, 'unit_cost' => $l->unit_cost, 'ref_type' => 'count', 'ref_id' => $c->id]);
                $diff < 0 ? $loss += -$diff * (float) $l->unit_cost : $gain += $diff * (float) $l->unit_cost;
                $n++;
            }
            $net = round($gain - $loss, 2);
            $voucherId = null;
            if (abs($net) >= 0.005) {
                $s = AccountingSetting::current();
                if (! $s->stock_loss_ledger_id || ! $s->stock_ledger_id) {
                    throw new BooksException('Choose the Stock and Stock Loss ledgers under Books → Settings → Default ledgers before posting a count.');
                }
                $journal = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');
                $abs = abs($net);
                $voucherId = $this->vouchers->create([
                    'voucher_type_id' => $journal->id, 'date' => today()->toDateString(), 'location_id' => $c->location_id,
                    'narration' => "Stock count {$c->number}: " . ($net < 0 ? 'shortage' : 'surplus'),
                    'meta' => ['stock_count' => ['count_id' => $c->id]],
                    'entries' => [
                        ['ledger_id' => $net < 0 ? $s->stock_loss_ledger_id : $s->stock_ledger_id, 'side' => 'D', 'amount' => $abs],
                        ['ledger_id' => $net < 0 ? $s->stock_ledger_id : $s->stock_loss_ledger_id, 'side' => 'C', 'amount' => $abs],
                    ],
                ], $user)->id;
            }
            $c->update(['status' => 'posted', 'posted_by' => $user?->id, 'posted_at' => now(), 'voucher_id' => $voucherId]);

            return ['lines' => $n, 'loss' => round($loss, 2), 'gain' => round($gain, 2), 'voucher_id' => $voucherId];
        });
    }

    public function cancel(StockCount $c): StockCount
    {
        $this->needOpen($c);
        $c->update(['status' => 'cancelled']);

        return $c;
    }

    private function needOpen(StockCount $c): void
    {
        if ($c->status !== 'open') {
            throw new BooksException("Count {$c->number} is already {$c->status}.");
        }
    }
}
