<?php

namespace App\Services\Menus;

use App\Models\Menus\IngredientFamily;
use App\Models\Recipe;
use App\Models\RecipeItem;
use App\Models\UnitOfMeasure;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What a recipe line means in stock terms: the amount written (in a recipe unit, per yield), plus what is lost in preparing it, turned into
 * stock units of real stock items at a branch. A line may name an exact stock item or an ingredient family (then the kitchen's pick rule decides which items).
 */
class RecipeLines
{
    private static ?bool $extended = null;

    public function __construct(private IngredientResolver $resolver)
    {
    }

    /** Has script 133 been run (family, unit and waste on recipe lines)? Before it, every line is an exact item in its own stock unit, as it always was. */
    public static function extended(): bool
    {
        return self::$extended ??= Schema::hasTable('recipe_items') && Schema::hasColumn('recipe_items', 'family_id');
    }

    public static function forget(): void
    {
        self::$extended = null;
    }

    /** What has to be taken from the shelf to make `$factor` yields at a branch: one row per stock item, same items added together. @return array<int, array{variant_id: int, quantity: float, from: string}> */
    public function requirements(Recipe $r, float $factor, int $locationId): array
    {
        $r->loadMissing('items');
        $merged = [];
        foreach ($r->items as $line) {
            foreach ($this->resolve($line, $factor, $locationId) as $piece) {
                $v = $piece['variant_id'];
                $merged[$v] = isset($merged[$v]) ? ['quantity' => round($merged[$v]['quantity'] + $piece['quantity'], 4)] + $merged[$v] : $piece;
            }
        }

        return array_values($merged);
    }

    /** The line before the waste is added back: what ends up in the dish, in the line's unit. */
    public static function wasteFactor(RecipeItem $line): float
    {
        $w = self::extended() ? min(90.0, max(0.0, (float) $line->waste_pct)) : 0.0;

        return 1 / (1 - $w / 100);
    }

    /** What one line asks for: an ingredient family and the amount in the family's unit, or an exact item and the amount in its own stock unit. @return array{family: ?IngredientFamily, qty: float, variant_id: ?int} */
    private function need(RecipeItem $line, float $factor): array
    {
        $qty = (float) $line->quantity * $factor * self::wasteFactor($line);
        if (self::extended() && $line->family_id) {
            $family = IngredientFamily::with('unit')->find($line->family_id);
            if (! $family || ! $family->is_active) {
                throw new BooksException('An ingredient in this recipe has been removed or switched off. Open the recipe and choose another.');
            }

            return ['family' => $family, 'qty' => $line->unit_id ? $this->convert($qty, (int) $line->unit_id, $family->unit, $family->name) : $qty, 'variant_id' => null];
        }
        $stock = self::extended() && $line->unit_id ? $this->toStockUnits((int) $line->variant_id, $qty, (int) $line->unit_id) : $qty;

        return ['family' => null, 'qty' => $stock, 'variant_id' => (int) $line->variant_id];
    }

    /** @return array<int, array{variant_id: int, quantity: float, from: string}> */
    private function resolve(RecipeItem $line, float $factor, int $locationId): array
    {
        $n = $this->need($line, $factor);
        if ($n['family']) {
            return array_map(fn ($p) => ['variant_id' => $p['variant_id'], 'quantity' => $p['stock_qty'], 'from' => $n['family']->name], $this->resolver->plan($n['family'], $n['qty'], $locationId));
        }

        return [['variant_id' => $n['variant_id'], 'quantity' => round($n['qty'], 4), 'from' => '']];
    }

    /**
     * How many units of the finished item the shelf at a branch could make right now: the scarcest ingredient decides. An ingredient with none on the shelf makes it 0.
     * (A family counts everything its allowed items hold; waste is allowed for.)
     */
    public function capacity(Recipe $r, int $locationId, ?\App\Services\Stock\BatchService $batches = null): float
    {
        $r->loadMissing('items');
        $batches ??= app(\App\Services\Stock\BatchService::class);
        $yields = INF;
        foreach ($r->items as $line) {
            $n = $this->need($line, 1.0);
            if ($n['qty'] <= 0) {
                continue;
            }
            $have = $n['family'] ? $this->resolver->available($n['family'], $locationId) : $batches->sellable((int) $n['variant_id'], $locationId);
            $yields = min($yields, $have / $n['qty']);
        }

        return is_infinite($yields) ? 0.0 : round(max(0.0, $yields) * (float) $r->yield_qty, 4);
    }

    private function convert(float $qty, int $fromUnitId, ?UnitOfMeasure $to, string $what): float
    {
        $from = UnitOfMeasure::find($fromUnitId);
        if (! $from || ! $to || $from->dimension !== $to->dimension) {
            throw new BooksException("{$what} is measured in {$to?->code}; the recipe's unit {$from?->code} can not be turned into it.");
        }

        return $from->convertTo($to, $qty);
    }

    /** A quantity written in a recipe unit, in the item's own stock unit, worked out from what one stock unit holds (its net content). */
    public function toStockUnits(int $variantId, float $qty, int $unitId): float
    {
        $v = DB::table('product_variants')->where('id', $variantId)->first(['net_content_qty', 'net_content_unit_id']);
        if (! $v || ! $v->net_content_unit_id || (float) $v->net_content_qty <= 0) {
            throw new BooksException('This item does not say how much one of it holds, so a recipe can not use it in grams or millilitres. Give it its net content, or write the line in its own stock unit.');
        }
        $netUnit = UnitOfMeasure::find($v->net_content_unit_id);

        return $this->convert($qty, $unitId, $netUnit, 'This item') / (float) $v->net_content_qty;
    }
}
