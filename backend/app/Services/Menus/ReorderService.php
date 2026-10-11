<?php

namespace App\Services\Menus;

use App\Models\Books\VoucherType;
use App\Models\Menus\IngredientFamily;
use App\Models\Menus\IngredientVariant;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use App\Services\Stock\BatchService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * What to buy: the ingredients the next days of expected sales will use, plus the stock level to keep on the shelf, less what is there. An ingredient family is ordered as its preferred
 * item. Each suggestion shows the supplier the item was last bought from; "make orders" puts one Purchase Order per supplier into the books for the buyer to check and send.
 */
class ReorderService
{
    public function __construct(private PrepService $prep, private IngredientResolver $resolver, private BatchService $batches, private VoucherService $vouchers)
    {
    }

    /**
     * @return array<int, array{variant_id: int, name: string, quantity: float, need: float, on_hand: float, par: float, reason: string, for: string, supplier_id: ?int, supplier: ?string, unit_cost: float}>
     */
    public function suggest(int $loc, int $days = 7, ?Carbon $from = null, int $weeks = 4, int $buffer = 10): array
    {
        $days = max(1, min(21, $days));
        $from = ($from ?? today())->copy()->startOfDay();
        $need = [];
        for ($i = 1; $i <= $days; $i++) {
            foreach ($this->prep->demandFor($from->copy()->addDays($i), $loc, $weeks, $buffer) as $key => $n) {
                $need[$key] = ['family_id' => $n['family_id'], 'variant_id' => $n['variant_id'], 'qty' => round(($need[$key]['qty'] ?? 0) + $n['qty'], 4)];
            }
        }
        $rows = [];
        foreach ($need as $n) {
            if ($n['family_id']) {
                $f = IngredientFamily::with('unit')->find($n['family_id']);
                if (! $f) {
                    continue;
                }
                $have = $this->resolver->available($f, $loc);
                $pick = IngredientVariant::where('family_id', $f->id)->where('is_allowed', true)->orderBy('preference')->first();
                if (! $pick) {
                    continue;
                }
                $short = $n['qty'] - $have;
                if ($short <= 0.00005) {
                    continue;
                }
                $qty = $this->round($short / max(0.000001, (float) $pick->units_per_stock), (int) $pick->variant_id);
                $rows[$pick->variant_id] = $this->row((int) $pick->variant_id, $qty, $n['qty'], $have, 0.0, 'forecast', $f->name, $loc, $rows[$pick->variant_id] ?? null);
            } else {
                $vid = (int) $n['variant_id'];
                $have = $this->batches->sellable($vid, $loc);
                $par = $this->par($vid, $loc);
                $short = $n['qty'] + $par - $have;
                if ($short > 0.00005) {
                    $rows[$vid] = $this->row($vid, $this->round($short, $vid), $n['qty'], $have, $par, 'forecast', '', $loc, $rows[$vid] ?? null);
                }
            }
        }
        foreach ($this->belowPar($loc) as $b) {   // ingredients that have fallen under the level to keep, whether or not the forecast uses them
            if (! isset($rows[$b['variant_id']])) {
                $rows[$b['variant_id']] = $this->row($b['variant_id'], $this->round($b['par'] - $b['have'], $b['variant_id']), 0.0, $b['have'], $b['par'], 'below_par', '', $loc, null);
            }
        }
        $out = array_values($rows);
        usort($out, fn ($a, $b) => strcmp($a['name'], $b['name']));

        return $out;
    }

    private function row(int $variant, float $qty, float $need, float $have, float $par, string $reason, string $for, int $loc, ?array $existing): array
    {
        if ($existing) {   // two families preferring the same item: one line, the amounts added
            $qty += $existing['quantity'];
            $need += $existing['need'];
        }
        $name = DB::table('product_variants as v')->join('products as p', 'p.id', '=', 'v.product_id')->where('v.id', $variant)->first(['p.name', 'v.name as variant']);
        [$sid, $sname] = $this->supplier($variant);

        return ['variant_id' => $variant, 'name' => trim(($name->name ?? 'item').' '.($name->variant ?? '')), 'quantity' => round($qty, 2), 'need' => round($need, 4), 'on_hand' => round($have, 4), 'par' => round($par, 4), 'reason' => $reason, 'for' => $for,
            'supplier_id' => $sid, 'supplier' => $sname, 'unit_cost' => $this->batches->lastCost($variant)];
    }

    /** Whole packs for an item counted in packs or pieces; a fraction (up to hundredths) for one bought by weight or volume. */
    private function round(float $qty, int $variant): float
    {
        $dimension = DB::table('product_variant_units as pu')->join('units_of_measure as u', 'u.id', '=', 'pu.unit_id')->where('pu.variant_id', $variant)->where('pu.role', 'base')->value('u.dimension');

        return in_array($dimension, [null, 'count'], true) ? (float) ceil($qty - 0.00001) : (float) ceil($qty * 100 - 0.001) / 100;
    }

    private function par(int $variant, int $loc): float
    {
        return (float) (DB::table('variant_location_stock')->where('product_variant_id', $variant)->where('location_id', $loc)->value('reorder_level') ?? 0);
    }

    /** @return array<int, array{variant_id: int, have: float, par: float}> ingredient items under the level to keep */
    private function belowPar(int $loc): array
    {
        $ids = DB::table('menus_ingredient_variants')->pluck('variant_id')->merge(DB::table('recipe_items')->whereNotNull('variant_id')->pluck('variant_id'))->unique()->all();
        $out = [];
        foreach (DB::table('variant_location_stock')->where('location_id', $loc)->where('reorder_level', '>', 0)->whereIn('product_variant_id', $ids)->get(['product_variant_id', 'reorder_level']) as $r) {
            $have = $this->batches->sellable((int) $r->product_variant_id, $loc);
            if ($have + 0.00005 < (float) $r->reorder_level) {
                $out[] = ['variant_id' => (int) $r->product_variant_id, 'have' => $have, 'par' => (float) $r->reorder_level];
            }
        }

        return $out;
    }

    /** Who this was last bought from. @return array{0: ?int, 1: ?string} */
    public function supplier(int $variant): array
    {
        $id = DB::table('stock_batches as s')->join('vouchers as v', 'v.id', '=', 's.received_voucher_id')->where('s.variant_id', $variant)->whereNotNull('v.party_ledger_id')->orderByDesc('s.id')->value('v.party_ledger_id');

        return $id ? [(int) $id, DB::table('ledgers')->where('id', $id)->value('name')] : [null, null];
    }

    /**
     * One Purchase Order per supplier for the chosen lines. Items with no known supplier are left out and named.
     *
     * @param array<int, array{variant_id: int, quantity: float}> $picks
     * @return array{created: array<int, array{voucher_id: int, number: ?string, supplier: ?string, lines: int}>, skipped: string[]}
     */
    public function makeOrders(int $loc, array $picks, ?User $by = null): array
    {
        $type = VoucherType::byBase(VoucherType::PURCHASE_ORDER) ?? throw new BooksException('The Purchase Order voucher type is switched off.');
        $groups = [];
        $skipped = [];
        foreach ($picks as $p) {
            $vid = (int) ($p['variant_id'] ?? 0);
            $qty = round((float) ($p['quantity'] ?? 0), 4);
            if ($vid <= 0 || $qty <= 0) {
                continue;
            }
            [$sid] = $this->supplier($vid);
            if (! $sid) {
                $skipped[] = (string) (DB::table('product_variants as v')->join('products as p', 'p.id', '=', 'v.product_id')->where('v.id', $vid)->value('p.name') ?? "item {$vid}");
                continue;
            }
            $unit = DB::table('product_variant_units')->where('variant_id', $vid)->where('role', 'base')->value('id');
            $groups[$sid][] = ['type' => 'product', 'variant_id' => $vid, 'variant_unit_id' => $unit, 'quantity' => $qty, 'rate' => $this->batches->lastCost($vid)];
        }
        $created = [];
        DB::transaction(function () use ($groups, $type, $loc, $by, &$created) {
            foreach ($groups as $sid => $lines) {
                $v = $this->vouchers->create(['voucher_type_id' => $type->id, 'date' => today()->toDateString(), 'location_id' => $loc, 'party_ledger_id' => $sid, 'narration' => 'Kitchen reorder (Menus → Operations)', 'lines' => $lines], $by);
                $created[] = ['voucher_id' => $v->id, 'number' => $v->voucher_number, 'supplier' => DB::table('ledgers')->where('id', $sid)->value('name'), 'lines' => count($lines)];
            }
        });

        return ['created' => $created, 'skipped' => $skipped];
    }
}
