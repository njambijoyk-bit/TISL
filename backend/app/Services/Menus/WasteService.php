<?php

namespace App\Services\Menus;

use App\Models\Books\Voucher;
use App\Models\Menus\Waste;
use App\Models\StockBatch;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use App\Services\Stock\RecipeService;
use App\Services\Stock\StockWriteOffService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The waste log: what was thrown away or eaten by staff, with a reason. Recording it takes the stock out (first-expiring first, expired stock included) through the ordinary stock
 * write-off, so the books get their Stock Loss journal at the cost of the batches. Wasting a dish that is made to order writes off the ingredients it is made of.
 * Taking an entry back cancels those journals and the stock returns.
 */
class WasteService
{
    private static ?bool $installed = null;

    public static function installed(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasTable('menus_waste');
        }

        return self::$installed ??= Schema::hasTable('menus_waste');
    }

    public function __construct(private StockWriteOffService $writeOffs, private RecipeService $recipes, private VoucherService $vouchers)
    {
    }

    /**
     * @param array{location_id?: int, variant_id: int, quantity: float, kind: string, note?: ?string, date?: ?string} $in
     */
    public function record(array $in, ?User $by = null): Waste
    {
        $kind = (string) ($in['kind'] ?? '');
        if (! isset(Waste::KINDS[$kind])) {
            throw new BooksException('Choose why it was wasted.');
        }
        $qty = round((float) ($in['quantity'] ?? 0), 4);
        if ($qty <= 0) {
            throw new BooksException('Enter how much.');
        }
        $loc = (int) ($in['location_id'] ?? 0) ?: (int) DB::table('locations')->where('is_active', 1)->orderByDesc('is_default')->orderBy('id')->value('id');
        if (! DB::table('locations')->where('id', $loc)->exists()) {
            throw new BooksException('Choose the branch.');
        }
        $variant = (int) ($in['variant_id'] ?? 0);
        if (! DB::table('product_variants')->where('id', $variant)->exists()) {
            throw new BooksException('Choose what was wasted.');
        }
        $note = mb_substr(trim((string) ($in['note'] ?? '')), 0, 200) ?: null;
        $date = ! empty($in['date']) ? Carbon::parse($in['date'])->toDateString() : today()->toDateString();
        if ($date > today()->toDateString()) {
            throw new BooksException('That day has not come yet.');
        }
        $reason = Waste::KINDS[$kind].($note ? ": {$note}" : '');

        return DB::transaction(function () use ($variant, $qty, $loc, $kind, $note, $date, $reason, $by) {
            $parts = $this->recipes->isMadeToOrder($variant) ? $this->ingredients($variant, $qty, $loc) : [['variant_id' => $variant, 'quantity' => $qty]];
            $cost = 0.0;
            $vouchers = [];
            foreach ($parts as $p) {
                foreach ($this->takes((int) $p['variant_id'], $loc, (float) $p['quantity']) as $t) {
                    $r = $this->writeOffs->writeOff(StockBatch::findOrFail($t['batch_id']), $loc, $t['qty'], $reason, $by);
                    $cost += (float) $r['cost'];
                    if ($r['voucher_id']) {
                        $vouchers[] = (int) $r['voucher_id'];
                    }
                }
            }

            return Waste::create(['location_id' => $loc, 'variant_id' => $variant, 'quantity' => $qty, 'cost' => round($cost, 2), 'kind' => $kind, 'note' => $note, 'voucher_ids' => $vouchers ?: null, 'user_id' => $by?->id, 'wasted_on' => $date]);
        });
    }

    /** A dish made to order that was thrown away: what it is made of. @return array<int, array{variant_id: int, quantity: float}> */
    private function ingredients(int $variant, float $portions, int $loc): array
    {
        $rows = $this->recipes->consumption($variant, $portions, $loc) ?? [];
        if (! $rows) {
            throw new BooksException('That dish has no ingredients on the shelf to write off.');
        }

        return array_map(fn ($r) => ['variant_id' => $r['variant_id'], 'quantity' => $r['quantity']], $rows);
    }

    /** Which batches give the quantity, first-expiring first, expired ones included (spoilage is often exactly that). @return array<int, array{batch_id: int, qty: float}> */
    private function takes(int $variant, int $loc, float $qty): array
    {
        $rows = DB::table('stock_batch_balances as b')->join('stock_batches as s', 's.id', '=', 'b.batch_id')->where('s.variant_id', $variant)->where('b.location_id', $loc)->where('b.quantity', '>', 0)
            ->orderByRaw('s.expiry_date IS NULL')->orderBy('s.expiry_date')->orderBy('s.id')->get(['b.batch_id', 'b.quantity']);
        $held = round((float) $rows->sum('quantity'), 4);
        if ($held + 0.00005 < $qty) {
            $name = DB::table('product_variants as v')->join('products as p', 'p.id', '=', 'v.product_id')->where('v.id', $variant)->value('p.name') ?? 'that item';

            throw new BooksException("Only {$held} of {$name} is on the shelf here, not {$qty}.");
        }
        $left = $qty;
        $out = [];
        foreach ($rows as $r) {
            if ($left <= 0.00005) {
                break;
            }
            $take = round(min((float) $r->quantity, $left), 4);
            $out[] = ['batch_id' => (int) $r->batch_id, 'qty' => $take];
            $left = round($left - $take, 4);
        }

        return $out;
    }

    /** A mistake: the journals are cancelled and the stock goes back. */
    public function void(Waste $w, ?User $by = null): Waste
    {
        if ($w->voided_at) {
            throw new BooksException('That entry was already taken back.');
        }
        DB::transaction(function () use ($w, $by) {
            foreach ((array) $w->voucher_ids as $id) {
                $v = Voucher::find($id);
                if ($v && $v->status !== Voucher::CANCELLED) {
                    $this->vouchers->cancel($v, 'Waste entry taken back', $by);
                }
            }
            $w->update(['voided_at' => now(), 'voided_by' => $by?->id]);
        });

        return $w->fresh();
    }

    /** @return array<string, mixed> what was wasted in a period: by reason, by item, by day, and against food sales */
    public function report(string $from, string $to, ?int $location = null): array
    {
        $q = Waste::whereBetween('wasted_on', [$from, $to])->whereNull('voided_at')->when($location, fn ($w) => $w->where('location_id', $location));
        $rows = $q->get();
        $names = DB::table('product_variants as v')->join('products as p', 'p.id', '=', 'v.product_id')->whereIn('v.id', $rows->pluck('variant_id'))->get(['v.id', 'p.name', 'v.name as variant'])->keyBy('id');
        $total = round((float) $rows->sum('cost'), 2);
        $sales = $this->foodSales($from, $to, $location);

        return ['from' => $from, 'to' => $to, 'total' => $total, 'entries' => $rows->count(), 'sales' => $sales, 'percent_of_sales' => $sales > 0 ? round($total / $sales * 100, 2) : null,
            'by_kind' => collect(Waste::KINDS)->map(fn ($label, $k) => ['kind' => $k, 'label' => $label, 'cost' => round((float) $rows->where('kind', $k)->sum('cost'), 2), 'entries' => $rows->where('kind', $k)->count()])->values()->all(),
            'by_item' => $rows->groupBy('variant_id')->map(fn ($g, $id) => ['variant_id' => (int) $id, 'name' => trim(($names[$id]->name ?? 'item '.$id).' '.($names[$id]->variant ?? '')), 'quantity' => round((float) $g->sum('quantity'), 4), 'cost' => round((float) $g->sum('cost'), 2)])
                ->sortByDesc('cost')->values()->take(10)->all(),
            'by_day' => $rows->groupBy(fn ($w) => $w->wasted_on->toDateString())->map(fn ($g, $d) => ['date' => $d, 'cost' => round((float) $g->sum('cost'), 2)])->sortKeys()->values()->all()];
    }

    /** Food sold in the period before tax (paid or still to be paid, not cancelled): the base waste is compared with. */
    private function foodSales(string $from, string $to, ?int $location): float
    {
        if (! Schema::hasTable('menus_orders')) {
            return 0.0;
        }

        return round((float) DB::table('menus_orders')->whereNotIn('status', ['cancelled'])->whereIn('payment', ['paid', 'later', 'open'])->whereBetween(DB::raw('DATE(created_at)'), [$from, $to])
            ->when($location, fn ($q) => $q->where('location_id', $location))->sum('subtotal'), 2);
    }

    /** @return array<int, array<string, mixed>> the latest entries */
    public function recent(?int $location = null, int $limit = 60): array
    {
        $rows = Waste::when($location, fn ($w) => $w->where('location_id', $location))->orderByDesc('wasted_on')->orderByDesc('id')->limit($limit)->get();
        $names = DB::table('product_variants as v')->join('products as p', 'p.id', '=', 'v.product_id')->whereIn('v.id', $rows->pluck('variant_id'))->get(['v.id', 'p.name', 'v.name as variant'])->keyBy('id');
        $users = DB::table('users')->whereIn('id', $rows->pluck('user_id')->filter())->pluck('name', 'id');

        return $rows->map(fn (Waste $w) => ['id' => $w->id, 'date' => $w->wasted_on->toDateString(), 'item' => trim(($names[$w->variant_id]->name ?? 'item').' '.($names[$w->variant_id]->variant ?? '')), 'quantity' => (float) $w->quantity, 'cost' => (float) $w->cost,
            'kind' => $w->kind, 'kind_label' => Waste::KINDS[$w->kind] ?? $w->kind, 'note' => $w->note, 'by' => $users[$w->user_id] ?? null, 'voided' => (bool) $w->voided_at])->all();
    }
}
