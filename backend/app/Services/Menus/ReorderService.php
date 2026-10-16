<?php

namespace App\Services\Menus;

use App\Models\Books\VoucherType;
use App\Models\Menus\Ingredient;
use App\Models\Menus\IngredientItem;
use App\Models\Menus\StockBatch;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * What to buy: the ingredients the next days of expected sales will use, plus the level to keep of each variant, less what is on the shelf. An ingredient is ordered as its preferred
 * variant, in whole packs when it has a pack size (else the bigger unit, else the base unit). Each suggestion shows the supplier it was last bought from; "make orders" puts one
 * Purchase Order per supplier into the books for the buyer to check and send.
 */
class ReorderService
{
    public function __construct(private PrepService $prep, private IngredientUse $use, private StockCounts $counts, private VoucherService $vouchers)
    {
    }

    /**
     * @return array<int, array{item_id: int, name: string, quantity: float, unit: string, unit_kind: string, quantity_base: float, need: float, on_hand: float, par: float, base_unit: string, reason: string, supplier_id: ?int, supplier: ?string, unit_cost: float}>
     */
    public function suggest(int $loc, int $days = 7, ?Carbon $from = null, int $weeks = 4, int $buffer = 10): array
    {
        $days = max(1, min(21, $days));
        $from = ($from ?? today())->copy()->startOfDay();
        $need = [];
        for ($i = 1; $i <= $days; $i++) {
            foreach ($this->prep->demandFor($from->copy()->addDays($i), $loc, $weeks, $buffer) as $id => $n) {
                $need[$id] = round(($need[$id] ?? 0) + $n['qty'], 4);
            }
        }
        $rows = [];
        foreach (Ingredient::with('baseUnit', 'altUnit', 'variants')->whereIn('id', array_keys($need))->get() as $ing) {
            $pick = $ing->variants->first(fn (IngredientItem $v) => $v->is_allowed && $v->is_active);
            if (! $pick) {
                continue;
            }
            $have = round((float) $this->use->usable($ing, $loc)->sum('qty_left'), 4);
            $short = $need[$ing->id] - $have;
            if ($short > self::EPS) {
                $rows[$pick->id] = $this->row($pick, $ing, $short, $need[$ing->id], $have, 0.0, 'forecast', $loc);
            }
        }
        foreach ($this->belowPar($loc) as $b) {   // variants that have fallen under the level to keep, whether or not the forecast uses them
            if (! isset($rows[$b['item']->id])) {
                $rows[$b['item']->id] = $this->row($b['item'], $b['item']->ingredient, $b['par'] - $b['have'], 0.0, $b['have'], $b['par'], 'below_par', $loc);
            }
        }
        $out = array_values($rows);
        usort($out, fn ($a, $b) => strcmp($a['name'], $b['name']));

        return $out;
    }

    private const EPS = 0.00005;

    private function row(IngredientItem $item, Ingredient $ing, float $shortBase, float $need, float $have, float $par, string $reason, int $loc): array
    {
        [$kind, $qty, $perUnit] = $this->orderUnit($item, $ing, $shortBase);
        [$sid, $sname] = $this->supplier($item->id);
        $unit = match ($kind) { 'pack' => $qty == 1.0 ? 'pack' : 'packs', 'alt' => $ing->altUnit?->code ?? '', default => $ing->baseUnit?->code ?? '' };

        return ['item_id' => $item->id, 'name' => trim($ing->name.' '.$item->name), 'quantity' => $qty, 'unit' => $unit, 'unit_kind' => $kind, 'quantity_base' => round($qty * $perUnit, 4), 'need' => round($need, 4), 'on_hand' => round($have, 4),
            'par' => round($par, 4), 'base_unit' => $ing->baseUnit?->code ?? '', 'reason' => $reason, 'supplier_id' => $sid, 'supplier' => $sname, 'unit_cost' => round($this->counts->lastCost($item->id, $loc) * $perUnit, 4)];
    }

    /** The unit to order in, how many of it, and how many base units one of it holds. Whole packs; the bigger unit or the base unit in hundredths (whole for things counted by the piece). @return array{0: string, 1: float, 2: float} */
    private function orderUnit(IngredientItem $item, Ingredient $ing, float $shortBase): array
    {
        if ($item->pack_size && (float) $item->pack_size > 0) {
            $pack = (float) $item->pack_size;

            return ['pack', (float) ceil($shortBase / $pack - 0.00001), $pack];
        }
        if ($ing->altUnit) {
            $one = $ing->altUnit->convertTo($ing->baseUnit, 1.0);

            return ['alt', $this->ceil($shortBase / max($one, 0.000001), $ing->altUnit->dimension ?? null), $one];
        }

        return ['base', $this->ceil($shortBase, $ing->baseUnit?->dimension ?? null), 1.0];
    }

    private function ceil(float $qty, ?string $dimension): float
    {
        return $dimension === 'count' ? (float) ceil($qty - 0.00001) : (float) ceil($qty * 100 - 0.001) / 100;
    }

    /** @return array<int, array{item: IngredientItem, have: float, par: float}> variants under the level to keep */
    private function belowPar(int $loc): array
    {
        $out = [];
        if (! \Illuminate\Support\Facades\Schema::hasColumn('menus_ingredient_items', 'reorder_level')) {
            return $out;   // script 185 not run yet
        }
        foreach (IngredientItem::with('ingredient.baseUnit', 'ingredient.altUnit')->where('is_active', true)->where('reorder_level', '>', 0)->get() as $item) {
            $have = round((float) StockBatch::where('item_id', $item->id)->where('location_id', $loc)->where('status', 'ok')->where('qty_left', '>', 0)
                ->where(fn ($w) => $w->whereNull('expiry_date')->orWhere('expiry_date', '>=', today()->toDateString()))->sum('qty_left'), 4);
            if ($have + self::EPS < (float) $item->reorder_level) {
                $out[] = ['item' => $item, 'have' => $have, 'par' => (float) $item->reorder_level];
            }
        }

        return $out;
    }

    /** Who this was last bought from. @return array{0: ?int, 1: ?string} */
    public function supplier(int $itemId): array
    {
        $id = null;
        if (\Illuminate\Support\Facades\Schema::hasColumn('menus_stock_batches', 'voucher_id')) {
            $id = DB::table('menus_stock_batches as b')->join('vouchers as v', 'v.id', '=', 'b.voucher_id')->where('b.item_id', $itemId)->where('v.status', '!=', 'cancelled')->whereNotNull('v.party_ledger_id')
                ->orderByDesc('b.id')->value('v.party_ledger_id');
        }
        $id ??= DB::table('menus_stock_batches as b')->join('menus_receipts as r', 'r.id', '=', 'b.receipt_id')->where('b.item_id', $itemId)->where('r.status', 'posted')->whereNotNull('r.supplier_ledger_id')
            ->orderByDesc('b.id')->value('r.supplier_ledger_id');

        return $id ? [(int) $id, DB::table('ledgers')->where('id', $id)->value('name')] : [null, null];
    }

    /**
     * One Purchase Order per supplier for the chosen lines. Variants with no known supplier are left out and named.
     *
     * @param array<int, array{item_id: int, quantity: float, unit?: string, rate?: ?float}> $picks `unit` is pack, alt or base (what the suggestion said)
     * @return array{created: array<int, array{voucher_id: int, number: ?string, supplier: ?string, lines: int}>, skipped: string[]}
     */
    public function makeOrders(int $loc, array $picks, ?User $by = null): array
    {
        $type = VoucherType::byBase(VoucherType::PURCHASE_ORDER) ?? throw new BooksException('The Purchase Order voucher type is switched off.');
        $inventory = FoodLedgers::inventory();
        $groups = [];
        $skipped = [];
        foreach ($picks as $p) {
            $qty = round((float) ($p['quantity'] ?? 0), 4);
            $item = IngredientItem::with('ingredient.baseUnit', 'ingredient.altUnit')->find((int) ($p['item_id'] ?? 0));
            if (! $item || $qty <= 0) {
                continue;
            }
            [$sid] = $this->supplier($item->id);
            $name = trim($item->ingredient->name.' '.$item->name);
            if (! $sid) {
                $skipped[] = $name;
                continue;
            }
            $unit = (string) ($p['unit'] ?? 'base');
            $perUnit = $item->toBase($unit, 1.0);
            $rate = isset($p['rate']) ? round((float) $p['rate'], 4) : round($this->counts->lastCost($item->id, $loc) * $perUnit, 4);
            $word = match ($unit) { 'pack' => $qty == 1.0 ? 'pack' : 'packs', 'alt' => $item->ingredient->altUnit?->code ?? '', default => $item->ingredient->baseUnit?->code ?? '' };
            $groups[$sid][] = ['type' => 'custom', 'description' => $name.': '.rtrim(rtrim(number_format($qty, 4, '.', ''), '0'), '.').' '.$word, 'quantity' => $qty, 'rate' => $rate, 'ledger_id' => $inventory];
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
