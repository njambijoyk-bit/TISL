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

    /** @param array<int, array{variant_id:int, quantity:float, price?:?float}> $items base units; price = what the job's invoice charges per unit (base currency), empty = the item's price in the system */
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
                $price = isset($i['price']) && $i['price'] !== '' ? round((float) $i['price'], 4) : null;
                $name = DB::table('product_variants as pv')->join('products as p', 'p.id', '=', 'pv.product_id')->where('pv.id', $variantId)->value('p.name') ?? "item #{$variantId}";
                if ($price !== null && $price < 0) {
                    throw new BooksException("The price of {$name} cannot be negative.");
                }
                if ($price !== null && ! \Illuminate\Support\Facades\Schema::hasColumn('stock_job_lines', 'sale_price')) {
                    throw new BooksException('Run script 52_job_line_prices.sql before entering a price on a job.');
                }
                // the invoice needs a price: the item's own, or one typed here
                if ($price === null && DB::table('product_variant_units')->where('variant_id', $variantId)->where('role', 'base')->value('price') === null) {
                    throw new BooksException("{$name} has no selling price in the system — enter the price to charge for it on this job.");
                }
                $have = $this->batches->sellable($variantId, (int) $j->location_id);
                if ($have + 0.00005 < $qty) {
                    $name = DB::table('product_variants as pv')->join('products as p', 'p.id', '=', 'pv.product_id')->where('pv.id', $variantId)->value('p.name') ?? "item #{$variantId}";
                    throw new BooksException("Not enough {$name} at this branch: need {$qty}, have " . round($have, 4) . '.');
                }
                foreach ($this->stock->applyDelta($variantId, (int) $j->location_id, -$qty) as $a) {
                    $q = abs($a['qty']);
                    $made[] = StockJobLine::create(['job_id' => $j->id, 'variant_id' => $variantId, 'batch_id' => $a['batch_id'], 'quantity' => $q, 'unit_cost' => $a['unit_cost'], 'issued_at' => now()] + ($price !== null ? ['sale_price' => $price] : []));
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

    /**
     * What the job's invoice carries for the materials it used: one line per item (and price), in base units. The quantity is what the
     * job holds now (issued less returned) and the price is the one typed when it was issued, else the item's price in the system.
     * These lines are fixed — the invoice cannot change them — and they do not take stock again: the materials left stock when they
     * were issued to the job.
     *
     * @return array<int, array{variant_id:int, name:string, quantity:float, price:?float, system_price:?float}>
     */
    public function invoiceLines(StockJob $j): array
    {
        $hasPrice = \Illuminate\Support\Facades\Schema::hasColumn('stock_job_lines', 'sale_price');
        $q = DB::table('stock_job_lines as l')->join('product_variants as pv', 'pv.id', '=', 'l.variant_id')->join('products as p', 'p.id', '=', 'pv.product_id')
            ->leftJoin('product_variant_units as u', fn ($x) => $x->on('u.variant_id', '=', 'l.variant_id')->where('u.role', 'base'))
            ->where('l.job_id', $j->id);
        $cols = ['l.variant_id', 'p.name as product', 'pv.name as variant', 'l.quantity', 'u.price as system_price', 'u.id as unit_id'];
        $rows = $q->get($hasPrice ? array_merge($cols, ['l.sale_price']) : $cols);
        $out = [];
        foreach ($rows as $r) {
            $price = $hasPrice && $r->sale_price !== null ? (float) $r->sale_price : null;
            $key = $r->variant_id . '|' . ($price ?? 'sys');
            $out[$key] ??= ['variant_id' => (int) $r->variant_id, 'variant_unit_id' => $r->unit_id ? (int) $r->unit_id : null,
                'name' => $r->product . ($r->variant && strtolower((string) $r->variant) !== 'standard' ? " — {$r->variant}" : ''), 'quantity' => 0.0, 'price' => $price,
                'system_price' => $r->system_price !== null ? (float) $r->system_price : null];
            $out[$key]['quantity'] = round($out[$key]['quantity'] + (float) $r->quantity, 4);
        }

        return array_values($out);
    }

    /**
     * The sales invoice for a completed job, built here so the materials cannot be changed or taken from stock twice. $o: customer_id
     * (when the job has none), date, due_date, extra[{description, amount, ledger_id}] for work or other charges. $preview only works out the figures.
     *
     * @return array|\App\Models\Books\Voucher
     */
    public function invoice(StockJob $j, array $o, ?User $user = null, bool $preview = false)
    {
        if ($j->status !== 'completed') {
            throw new BooksException("Complete job {$j->number} first, then invoice it.");
        }
        if ($j->invoice_voucher_id) {
            $existing = \App\Models\Books\Voucher::find($j->invoice_voucher_id);
            if ($existing && $existing->status !== \App\Models\Books\Voucher::CANCELLED) {
                throw new BooksException("Job {$j->number} is already invoiced ({$existing->voucher_number}). Cancel that invoice to raise another.");
            }
        }
        $customerId = $j->customer_id ?: ($o['customer_id'] ?? null);
        if (! $customerId) {
            throw new BooksException('Choose the customer to invoice.');
        }
        $type = VoucherType::byBase(VoucherType::SALES) ?? throw new BooksException('The Sales voucher type is switched off.');

        $lines = [];
        foreach ($this->invoiceLines($j) as $m) {
            if ($m['quantity'] <= 0) {
                continue;
            }
            $lines[] = ['type' => 'product', 'variant_id' => $m['variant_id'], 'variant_unit_id' => $m['variant_unit_id'], 'quantity' => $m['quantity'], 'discount' => 0, 'as_material' => true, 'from_job' => true]
                + ($m['price'] !== null ? ['rate' => $m['price']] : []);
        }
        foreach ($o['extra'] ?? [] as $x) {
            if ((float) ($x['amount'] ?? 0) <= 0 && trim((string) ($x['description'] ?? '')) === '') {
                continue;
            }
            $lines[] = ['type' => 'custom', 'description' => trim((string) ($x['description'] ?? '')) ?: 'Work', 'quantity' => 1, 'rate' => (float) ($x['amount'] ?? 0), 'ledger_id' => (int) ($x['ledger_id'] ?? 0) ?: null];
        }
        if (! $lines) {
            throw new BooksException('There is nothing to invoice: the job holds no materials and no work was added.');
        }
        $data = [
            'voucher_type_id' => $type->id, 'date' => $o['date'] ?? today()->toDateString(), 'due_date' => $o['due_date'] ?? null, 'location_id' => $j->location_id,
            'customer_id' => (int) $customerId, 'reference_no' => $j->number, 'narration' => "Job {$j->number} — {$j->title}",
            'moves_stock' => false,        // the materials already left stock when they were issued to the job
            'discount_choices' => [],      // the prices were agreed for this job: no customer discount rewrites them
            'lines' => $lines, 'meta' => ['stock_job' => ['job_id' => $j->id]],
        ];
        if ($preview) {
            return $this->vouchers->preview($data, $user);
        }

        return DB::transaction(function () use ($j, $data, $customerId, $user) {
            $v = $this->vouchers->create($data, $user);
            $j->update(['invoice_voucher_id' => $v->id, 'customer_id' => $j->customer_id ?: $customerId]);

            return $v;
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
