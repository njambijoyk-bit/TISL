<?php

namespace App\Services\Menus;

use App\Models\Menus\IngredientFamily;
use App\Services\Books\BooksException;
use App\Services\Stock\BatchService;
use Illuminate\Support\Facades\DB;

/**
 * "200 g wheat flour" -> which stock items to take it from. The family's pick rule orders its allowed variants (preferred first, the cheapest first,
 * or the one that expires first); the kitchen takes from the first until it runs out, then the next. What is taken is in each item's own stock unit,
 * so the batches, their cost and their expiry follow exactly as they do for any sale or production run.
 */
class IngredientResolver
{
    public function __construct(private BatchService $batches)
    {
    }

    /**
     * Where `$need` (in the family's unit) comes from at a branch.
     *
     * @return array<int, array{variant_id: int, stock_qty: float, family_qty: float}>
     * @throws BooksException when the branch does not hold enough in total
     */
    public function plan(IngredientFamily $family, float $need, int $locationId): array
    {
        $need = round($need, 4);
        if ($need <= 0) {
            return [];
        }
        $left = $need;
        $out = [];
        foreach ($this->candidates($family, $locationId) as $c) {
            if ($left <= 0.00005) {
                break;
            }
            $inFamily = $c['available'] * $c['units_per_stock'];
            if ($inFamily <= 0.00005) {
                continue;
            }
            $take = min($left, $inFamily);
            $out[] = ['variant_id' => $c['variant_id'], 'stock_qty' => round($take / $c['units_per_stock'], 4), 'family_qty' => round($take, 4)];
            $left -= $take;
        }
        if ($left > 0.00005) {
            $unit = $family->unit?->code ?? '';
            throw new BooksException("Not enough {$family->name}: need {$need} {$unit}, have ".round($need - $left, 4).'.');
        }

        return $out;
    }

    /** How much of the family is on the shelf at a branch, in the family's unit. */
    public function available(IngredientFamily $family, int $locationId): float
    {
        return round(array_sum(array_map(fn ($c) => $c['available'] * $c['units_per_stock'], $this->candidates($family, $locationId))), 4);
    }

    /** What one family unit costs right now, going by the item that would be used first (null when none is on the shelf). */
    public function unitCost(IngredientFamily $family, int $locationId): ?float
    {
        foreach ($this->candidates($family, $locationId) as $c) {
            if ($c['available'] > 0.00005 && $c['cost'] !== null) {
                return round($c['cost'] / $c['units_per_stock'], 6);
            }
        }

        return null;
    }

    /**
     * The family's allowed items, with what is on the shelf at the branch, in the order the pick rule says.
     *
     * @return array<int, array{variant_id: int, units_per_stock: float, available: float, cost: ?float, expiry: ?string, rank: int}>
     */
    private function candidates(IngredientFamily $family, int $locationId): array
    {
        $rows = [];
        foreach ($family->variants()->where('is_allowed', true)->get() as $v) {
            $variantId = (int) $v->variant_id;
            $stats = DB::table('stock_batch_balances as b')->join('stock_batches as s', 's.id', '=', 'b.batch_id')
                ->where('s.variant_id', $variantId)->where('b.location_id', $locationId)->where('b.quantity', '>', 0)
                ->where('s.status', 'active')->where(fn ($w) => $w->whereNull('s.expiry_date')->orWhere('s.expiry_date', '>=', today()->toDateString()))
                ->selectRaw('SUM(b.quantity) as qty, SUM(b.quantity * s.unit_cost) as value, MIN(s.expiry_date) as soonest')->first();
            $qty = (float) ($stats->qty ?? 0);
            $rows[] = [
                'variant_id' => $variantId, 'units_per_stock' => (float) $v->units_per_stock, 'rank' => (int) $v->preference,
                'available' => $qty > 0 ? $this->batches->sellable($variantId, $locationId) : 0.0,
                'cost' => $qty > 0 ? round((float) $stats->value / $qty, 6) : null, 'expiry' => $stats->soonest ?? null,
            ];
        }
        $rule = $family->pick_rule;
        usort($rows, function ($a, $b) use ($rule) {
            if ($rule === 'cheapest') {
                $byCost = ($a['cost'] === null ? INF : $a['cost'] / $a['units_per_stock']) <=> ($b['cost'] === null ? INF : $b['cost'] / $b['units_per_stock']);
                if ($byCost !== 0) {
                    return $byCost;
                }
            } elseif ($rule === 'first_expiring') {
                $byDate = ($a['expiry'] ?? '9999-12-31') <=> ($b['expiry'] ?? '9999-12-31');
                if ($byDate !== 0) {
                    return $byDate;
                }
            }

            return $a['rank'] <=> $b['rank'];
        });

        return $rows;
    }
}
