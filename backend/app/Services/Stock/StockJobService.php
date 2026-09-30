<?php

namespace App\Services\Stock;

use App\Models\Books\AccountingSetting;
use App\Models\Books\StockMovement;
use App\Models\Books\VoucherType;
use App\Models\StockJob;
use App\Models\StockJobLine;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use App\Services\Location\VariantStockService;
use Illuminate\Support\Facades\DB;

/**
 * Work in progress on long jobs. Materials issued to an open job leave stock and are held in the Work in Progress
 * ledger (Dr Work in Progress, Cr Stock) rather than expensed. Completing the job moves the cost to Cost of Services
 * (Dr Cost of Services, Cr Work in Progress); cancelling an open job returns everything to stock.
 * Each step is its own Journal, so the books always match what the job holds.
 */
class StockJobService
{
    public function __construct(private VariantStockService $stock, private BatchService $batches, private VoucherService $vouchers) {}

    public function open(string $title, int $locationId, ?int $customerId, ?string $note, ?User $user = null): StockJob
    {
        $title = trim($title);
        if ($title === '') {
            throw new BooksException('Give the job a title.');
        }
        $j = StockJob::create(['title' => $title, 'location_id' => $locationId, 'customer_id' => $customerId, 'status' => 'open', 'note' => $note, 'created_by' => $user?->id]);
        $j->update(['number' => 'JB-' . str_pad((string) $j->id, 6, '0', STR_PAD_LEFT)]);

        return $j;
    }

    /** @param array<int, array{variant_id:int, quantity:float}> $items base units */
    public function issue(StockJob $j, array $items, ?User $user = null): StockJob
    {
        $this->needOpen($j);
        $items = array_values(array_filter($items, fn ($i) => (float) ($i['quantity'] ?? 0) > 0));
        if (! $items) {
            throw new BooksException('Add at least one material to issue.');
        }

        return DB::transaction(function () use ($j, $items, $user) {
            $cost = 0.0;
            $made = [];
            foreach ($items as $i) {
                $variantId = (int) $i['variant_id'];
                $qty = round((float) $i['quantity'], 4);
                $have = $this->batches->sellable($variantId, (int) $j->location_id);
                if ($have + 0.00005 < $qty) {
                    $name = DB::table('product_variants as pv')->join('products as p', 'p.id', '=', 'pv.product_id')->where('pv.id', $variantId)->value('p.name') ?? "item #{$variantId}";
                    throw new BooksException("Not enough {$name} at this branch: need {$qty}, have " . round($have, 4) . '.');
                }
                foreach ($this->stock->applyDelta($variantId, (int) $j->location_id, -$qty) as $a) {
                    $q = abs($a['qty']);
                    $made[] = StockJobLine::create(['job_id' => $j->id, 'variant_id' => $variantId, 'batch_id' => $a['batch_id'], 'quantity' => $q, 'unit_cost' => $a['unit_cost'], 'issued_at' => now()]);
                    $this->move($j, $variantId, -$q, 'job_issue', $a['batch_id'], $a['unit_cost']);
                    $cost += $q * $a['unit_cost'];
                }
            }
            $vid = $this->journal($j, 'wip', 'stock', round($cost, 2), "Materials issued to job {$j->number}", $user);
            if ($vid) {
                foreach ($made as $l) {
                    $l->update(['voucher_id' => $vid]);
                }
            }

            return $j->load('lines');
        });
    }

    /** Take some of an issued line back to stock (all of it when `$qty` is null). */
    public function returnLine(StockJob $j, int $lineId, ?float $qty, ?User $user = null): StockJob
    {
        $this->needOpen($j);
        $l = StockJobLine::where('job_id', $j->id)->findOrFail($lineId);
        $qty = round($qty ?? (float) $l->quantity, 4);
        if ($qty <= 0 || $qty - 0.00005 > (float) $l->quantity) {
            throw new BooksException('Return between 0 and ' . (float) $l->quantity . '.');
        }

        return DB::transaction(function () use ($j, $l, $qty, $user) {
            $this->stock->applyDelta((int) $l->variant_id, (int) $j->location_id, $qty, ['batch_id' => $l->batch_id, 'no_blend' => true]);
            $this->move($j, (int) $l->variant_id, $qty, 'job_return', (int) $l->batch_id, (float) $l->unit_cost);
            $this->journal($j, 'stock', 'wip', round($qty * (float) $l->unit_cost, 2), "Materials returned from job {$j->number}", $user);
            $left = round((float) $l->quantity - $qty, 4);
            $left > 0 ? $l->update(['quantity' => $left]) : $l->delete();

            return $j->load('lines');
        });
    }

    /** The job is done: everything it holds becomes a cost of the service. */
    public function complete(StockJob $j, ?int $invoiceVoucherId = null, ?User $user = null): StockJob
    {
        $this->needOpen($j);

        return DB::transaction(function () use ($j, $invoiceVoucherId, $user) {
            $this->journal($j, 'cos', 'wip', $this->cost($j), "Job {$j->number} completed: materials used", $user);
            $j->update(['status' => 'completed', 'completed_at' => now(), 'invoice_voucher_id' => $invoiceVoucherId]);

            return $j;
        });
    }

    /** Give up on an open job: all its materials go back to stock. */
    public function cancel(StockJob $j, ?User $user = null): StockJob
    {
        $this->needOpen($j);

        return DB::transaction(function () use ($j, $user) {
            $j->load('lines');
            foreach ($j->lines as $l) {
                $this->stock->applyDelta((int) $l->variant_id, (int) $j->location_id, (float) $l->quantity, ['batch_id' => $l->batch_id, 'no_blend' => true]);
                $this->move($j, (int) $l->variant_id, (float) $l->quantity, 'job_return', (int) $l->batch_id, (float) $l->unit_cost);
            }
            $this->journal($j, 'stock', 'wip', $this->cost($j), "Job {$j->number} cancelled: materials returned", $user);
            $j->update(['status' => 'cancelled']);

            return $j;
        });
    }

    /** Cost of materials held by one job, or by every open job (base currency). */
    public function cost(?StockJob $j = null): float
    {
        $q = DB::table('stock_job_lines as l')->join('stock_jobs as t', 't.id', '=', 'l.job_id');
        $j ? $q->where('t.id', $j->id) : $q->where('t.status', 'open');

        return round((float) $q->selectRaw('COALESCE(SUM(l.quantity * l.unit_cost), 0) as v')->value('v'), 2);
    }

    private function journal(StockJob $j, string $debit, string $credit, float $amount, string $narration, ?User $user): ?int
    {
        if ($amount < 0.005) {
            return null;
        }
        $s = AccountingSetting::current();
        $ledger = ['wip' => $s->wip_ledger_id, 'stock' => $s->stock_ledger_id, 'cos' => $s->cost_of_services_ledger_id];
        if (! $ledger['wip'] || ! $ledger['stock'] || ! $ledger['cos']) {
            throw new BooksException('Choose the Stock, Cost of services and Work in progress ledgers under Books → Settings → Default ledgers first.');
        }
        $type = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');

        return $this->vouchers->create([
            'voucher_type_id' => $type->id, 'date' => today()->toDateString(), 'location_id' => $j->location_id, 'narration' => $narration,
            'meta' => ['stock_job' => ['job_id' => $j->id]],
            'entries' => [['ledger_id' => $ledger[$debit], 'side' => 'D', 'amount' => $amount], ['ledger_id' => $ledger[$credit], 'side' => 'C', 'amount' => $amount]],
        ], $user)->id;
    }

    private function needOpen(StockJob $j): void
    {
        if ($j->status !== 'open') {
            throw new BooksException("Job {$j->number} is already {$j->status}.");
        }
    }

    private function move(StockJob $j, int $variantId, float $qty, string $type, int $batchId, float $cost): void
    {
        StockMovement::create(['voucher_id' => null, 'voucher_item_id' => null, 'variant_id' => $variantId, 'location_id' => $j->location_id, 'quantity' => $qty, 'movement_type' => $type,
            'movement_date' => today()->toDateString(), 'created_at' => now(), 'batch_id' => $batchId, 'unit_cost' => $cost, 'ref_type' => 'job', 'ref_id' => $j->id]);
    }
}
