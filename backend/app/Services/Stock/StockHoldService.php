<?php

namespace App\Services\Stock;

use App\Models\Customer;
use App\Models\Notification;
use App\Models\StockBatch;
use App\Models\StockBatchEvent;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Location\VariantStockService;
use Illuminate\Support\Facades\DB;

/**
 * Holding stock back: quarantine (checking it), recall (a supplier or regulator says it must not be sold),
 * and clearance pricing (near-expiry stock sold cheaper).
 *
 * A quarantined or recalled batch is never sold — anywhere — and is not counted as available stock. What can
 * still be done with it: write it off or send it back to the supplier (the expiry list does both). A quarantined
 * batch can be released; a recalled one only by cancelling the recall. Every step is recorded on the batch.
 */
class StockHoldService
{
    public function __construct(private VariantStockService $stock) {}

    public function quarantine(StockBatch $batch, string $reason, ?User $user = null): StockBatch
    {
        $this->needReason($reason);
        if (! in_array($batch->status, [StockBatch::ACTIVE, StockBatch::EXPIRED], true)) {
            throw new BooksException('Only a batch that is on the shelf can be quarantined; this one is ' . $batch->status . '.');
        }

        return $this->move($batch, StockBatch::QUARANTINED, 'quarantine', $reason, $user);
    }

    /** Back on the shelf (or, past its date, into the expired list). */
    public function release(StockBatch $batch, ?User $user = null): StockBatch
    {
        if ($batch->status !== StockBatch::QUARANTINED) {
            throw new BooksException($batch->status === StockBatch::RECALLED ? 'This batch is recalled. Cancel the recall to release it.' : 'This batch is not quarantined.');
        }

        return $this->move($batch, $this->restingStatus($batch), 'release', null, $user);
    }

    public function recall(StockBatch $batch, string $reason, ?User $user = null): StockBatch
    {
        $this->needReason($reason);
        if ($batch->status === StockBatch::RECALLED) {
            throw new BooksException('That batch is already recalled.');
        }

        return $this->move($batch, StockBatch::RECALLED, 'recall', $reason, $user);
    }

    public function cancelRecall(StockBatch $batch, ?string $note, ?User $user = null): StockBatch
    {
        if ($batch->status !== StockBatch::RECALLED) {
            throw new BooksException('That batch is not recalled.');
        }

        return $this->move($batch, $this->restingStatus($batch), 'recall_cancelled', $note, $user);
    }

    /** Sell a near-expiry batch cheaper: `percent` off the price of whatever is taken from it. null or 0 clears it. */
    public function setClearance(StockBatch $batch, ?float $percent, ?User $user = null): StockBatch
    {
        if ($percent !== null && ($percent < 0 || $percent > 100)) {
            throw new BooksException('A clearance discount is between 0 and 100 percent.');
        }
        $percent = $percent !== null && $percent > 0 ? round($percent, 2) : null;
        $batch->forceFill(['clearance_percent' => $percent])->save();
        $this->log($batch, $percent === null ? 'clearance_cleared' : 'clearance_set', $percent === null ? null : "{$percent}% off", $user, ['percent' => $percent]);

        return $batch;
    }

    /**
     * Where a batch went. `sold` is every sale that took from it (with the customer, so they can be reached);
     * `returned` what customers brought back; `held` what is still in the shop and where; plus what was returned to
     * the supplier, written off, or transferred.
     *
     * @return array{batch: array, summary: array, sold: array, returned: array, on_hand: array, events: array}
     */
    public function trace(StockBatch $batch): array
    {
        $batch->loadMissing('variant.product:id,name');
        $rows = DB::table('stock_movements as m')
            ->leftJoin('vouchers as v', 'v.id', '=', 'm.voucher_id')
            ->leftJoin('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->leftJoin('customers as c', 'c.id', '=', 'v.customer_id')
            ->leftJoin('ledgers as pl', 'pl.id', '=', 'v.party_ledger_id')
            ->leftJoin('locations as l', 'l.id', '=', 'm.location_id')
            ->where('m.batch_id', $batch->id)->where('m.reversed', false)
            ->orderBy('m.movement_date')->orderBy('m.id')
            ->get(['m.id', 'm.voucher_id', 'm.quantity', 'm.movement_type', 'm.movement_date', 'm.location_id', 'l.name as location', 'v.voucher_number', 'v.channel', 'v.customer_id',
                'c.first_name', 'c.last_name', 'c.email', 'c.phone', 'pl.name as party']);

        $who = fn ($r) => [
            'movement_id' => (int) $r->id, 'voucher_id' => $r->voucher_id ? (int) $r->voucher_id : null, 'voucher_number' => $r->voucher_number, 'date' => (string) $r->movement_date,
            'quantity' => abs((float) $r->quantity), 'location' => $r->location, 'channel' => $r->channel, 'customer_id' => $r->customer_id ? (int) $r->customer_id : null,
            'customer' => trim(($r->first_name ?? '') . ' ' . ($r->last_name ?? '')) ?: ($r->party ?? null), 'email' => $r->email, 'phone' => $r->phone,
        ];
        $sold = $rows->filter(fn ($r) => (float) $r->quantity < 0 && in_array($r->movement_type, ['sales', 'cash_sale', 'delivery_note'], true))->map($who)->values()->all();
        $returned = $rows->filter(fn ($r) => (float) $r->quantity > 0 && $r->movement_type === 'credit_note')->map($who)->values()->all();
        $sum = fn (string $type, int $sign) => round($rows->filter(fn ($r) => $r->movement_type === $type && $sign * (float) $r->quantity > 0)->sum(fn ($r) => abs((float) $r->quantity)), 4);
        $onHand = DB::table('stock_batch_balances as b')->leftJoin('locations as l', 'l.id', '=', 'b.location_id')
            ->where('b.batch_id', $batch->id)->where('b.quantity', '>', 0)->get(['b.location_id', 'l.name as location', 'b.quantity'])
            ->map(fn ($r) => ['location_id' => (int) $r->location_id, 'location' => $r->location, 'quantity' => (float) $r->quantity])->all();

        return [
            'batch' => $this->describe($batch),
            'summary' => [
                'sold' => round(array_sum(array_column($sold, 'quantity')), 4), 'returned' => round(array_sum(array_column($returned, 'quantity')), 4),
                'on_hand' => round(array_sum(array_column($onHand, 'quantity')), 4), 'to_supplier' => $sum('debit_note', -1), 'written_off' => $sum('write_off', -1),
                'customers' => count(array_unique(array_filter(array_column($sold, 'customer_id')))),
            ],
            'sold' => $sold, 'returned' => $returned, 'on_hand' => $onHand,
            'events' => $batch->events()->with('user:id,name')->limit(50)->get()->map(fn ($e) => ['action' => $e->action, 'note' => $e->note, 'by' => $e->user?->name, 'at' => (string) $e->created_at])->all(),
        ];
    }

    /**
     * Tell the customers who bought a recalled batch. Those with an account get a notification; the rest are returned so
     * they can be phoned or e-mailed.
     *
     * @return array{notified:int, unreachable: array<int, array{customer:?string, email:?string, phone:?string, voucher_number:?string}>}
     */
    public function notifyCustomers(StockBatch $batch, string $message, ?User $user = null): array
    {
        $this->needReason($message);
        $batch->loadMissing('variant.product:id,name');
        $name = $batch->variant?->product?->name ?? 'a product';
        $title = "Recall: {$name}" . ($batch->batch_no ? ", batch {$batch->batch_no}" : '');
        $notified = [];
        $unreachable = [];
        foreach ($this->trace($batch)['sold'] as $row) {
            $customer = $row['customer_id'] ? Customer::with('user')->find($row['customer_id']) : null;
            if ($customer && ! isset($notified[$customer->id]) && ($customer->user ?? null)) {
                Notification::createFor($customer->user, 'stock_recall', $title, $message, null, null, ['batch_id' => $batch->id, 'voucher_id' => $row['voucher_id']], ['database'], 'high');
                $notified[$customer->id] = true;
            } elseif (! $customer || ! ($customer->user ?? null)) {
                $unreachable[] = ['customer' => $row['customer'], 'email' => $row['email'], 'phone' => $row['phone'], 'voucher_number' => $row['voucher_number']];
            }
        }
        $this->log($batch, 'recall_notified', $message, $user, ['notified' => count($notified), 'unreachable' => count($unreachable)]);

        return ['notified' => count($notified), 'unreachable' => $unreachable];
    }

    /** One batch as the screens show it. */
    public function describe(StockBatch $b): array
    {
        $b->loadMissing('variant.product:id,name');
        $held = (float) DB::table('stock_batch_balances')->where('batch_id', $b->id)->sum('quantity');

        return [
            'id' => $b->id, 'product' => $b->variant?->product?->name, 'variant' => $b->variant?->name, 'sku' => $b->variant?->sku, 'batch_no' => $b->batch_no,
            'expiry_date' => $b->expiry_date?->toDateString(), 'status' => $b->status, 'held_reason' => $b->held_reason, 'on_hand' => round($held, 4),
            'unit_cost' => (float) $b->unit_cost, 'clearance_percent' => $b->clearance_percent !== null ? (float) $b->clearance_percent : null,
        ];
    }

    private function move(StockBatch $batch, string $status, string $action, ?string $note, ?User $user): StockBatch
    {
        $batch->forceFill(['status' => $status, 'held_reason' => in_array($status, [StockBatch::QUARANTINED, StockBatch::RECALLED], true) ? $note : null])->save();
        $this->log($batch, $action, $note, $user);
        $this->stock->refreshVariant((int) $batch->variant_id);   // held stock no longer counts as available

        return $batch->fresh();
    }

    private function restingStatus(StockBatch $b): string
    {
        return $b->expiry_date && $b->expiry_date->lt(today()) ? StockBatch::EXPIRED : StockBatch::ACTIVE;
    }

    private function log(StockBatch $b, string $action, ?string $note, ?User $user, ?array $meta = null): void
    {
        StockBatchEvent::create(['batch_id' => $b->id, 'action' => $action, 'note' => $note ? mb_substr($note, 0, 255) : null, 'meta' => $meta, 'user_id' => $user?->id, 'created_at' => now()]);
    }

    private function needReason(string $s): void
    {
        if (trim($s) === '') {
            throw new BooksException('Give a reason.');
        }
    }
}
