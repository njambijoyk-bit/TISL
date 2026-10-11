<?php

namespace App\Services\Stock;

use App\Models\Recipe;
use App\Models\RecipeItem;
use App\Models\RecipeStep;
use App\Services\Menus\RecipeLines;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What an item is made of. A recipe is per yield: "1 batch makes 12 loaves from 1 kg flour + 0.02 kg yeast".
 * Made ahead → a production run turns ingredients into a batch of finished stock.
 * Made to order (deduct_on_sale) → selling it uses the ingredients; the finished item itself holds no stock.
 */
class RecipeService
{
    /**
     * @param array<int, array{variant_id?:int, family_id?:int, quantity:float, unit_id?:int, waste_pct?:float}> $items a line names an exact stock item (variant_id) or an ingredient family (family_id), and may be
     *        written in a recipe unit (unit_id) and lose some in preparation (waste_pct); both need script 133
     * @param array{visibility?: string, prep_minutes?: ?int, cook_minutes?: ?int, steps?: array<int, array{body: string, minutes?: ?int, image?: ?string}>} $extra the method and who may see it (script 133)
     */
    public function save(int $variantId, float $yield, bool $onSale, ?string $note, array $items, array $extra = []): Recipe
    {
        $items = array_values(array_filter($items, fn ($i) => (float) ($i['quantity'] ?? 0) > 0));
        if ($yield <= 0) {
            throw new BooksException('The yield must be more than zero.');
        }
        if (! $items) {
            throw new BooksException('Add at least one ingredient.');
        }
        $extended = RecipeLines::extended();
        $ids = [];
        $families = [];
        foreach ($items as $i) {
            $isFamily = ! empty($i['family_id']);
            if ($isFamily === ! empty($i['variant_id'])) {
                throw new BooksException('Each ingredient line is either one exact stock item or an ingredient, not both and not neither.');
            }
            if (! $extended && ($isFamily || ! empty($i['unit_id']) || (float) ($i['waste_pct'] ?? 0) > 0)) {
                throw new BooksException('Ingredients, recipe units and waste need database script 133 to be run first.');
            }
            if ((float) ($i['waste_pct'] ?? 0) < 0 || (float) ($i['waste_pct'] ?? 0) > 90) {
                throw new BooksException('Waste must be between 0 and 90 percent.');
            }
            $isFamily ? $families[] = (int) $i['family_id'] : $ids[] = (int) $i['variant_id'];
        }
        if (in_array($variantId, $ids, true)) {
            throw new BooksException('An item cannot be an ingredient of itself.');
        }
        if (count($ids) !== count(array_unique($ids)) || count($families) !== count(array_unique($families))) {
            throw new BooksException('An ingredient is listed twice — add the amounts together.');
        }
        foreach ($families as $fid) {
            $family = \App\Models\Menus\IngredientFamily::with('variants')->find($fid);
            if (! $family || ! $family->is_active) {
                throw new BooksException('One of the ingredients has been removed or switched off.');
            }
            if ($family->variants->contains('variant_id', $variantId)) {
                throw new BooksException("An item cannot be an ingredient of itself ({$family->name} includes it).");
            }
            $ids = array_merge($ids, $family->variants->pluck('variant_id')->map(fn ($v) => (int) $v)->all());
        }
        if ($ids && Recipe::whereIn('variant_id', $ids)->where('deduct_on_sale', true)->where('is_active', true)->exists()) {
            throw new BooksException('An ingredient that is itself made to order cannot be used in another recipe.');
        }
        foreach ($items as $i) {
            if (! empty($i['unit_id'])) {
                $this->checkUnit($i);
            }
        }
        $visibility = $extra['visibility'] ?? 'internal';
        if (! array_key_exists($visibility, Recipe::VISIBILITY)) {
            throw new BooksException('Choose who may see this recipe: the kitchen only, or the website too.');
        }
        if ($extra && ! $extended) {
            throw new BooksException('The method and who may see a recipe need database script 133 to be run first.');
        }

        return DB::transaction(function () use ($variantId, $yield, $onSale, $note, $items, $extra, $visibility, $extended) {
            $r = Recipe::updateOrCreate(['variant_id' => $variantId], ['yield_qty' => $yield, 'deduct_on_sale' => $onSale, 'note' => $note, 'is_active' => true]
                + ($extended ? ['visibility' => $visibility, 'prep_minutes' => $extra['prep_minutes'] ?? null, 'cook_minutes' => $extra['cook_minutes'] ?? null] : []));
            $r->items()->delete();
            foreach ($items as $i) {
                RecipeItem::create(['recipe_id' => $r->id, 'variant_id' => ! empty($i['family_id']) ? null : (int) $i['variant_id'], 'quantity' => round((float) $i['quantity'], 4)]
                    + ($extended ? ['family_id' => $i['family_id'] ?? null, 'unit_id' => $i['unit_id'] ?? null, 'waste_pct' => round((float) ($i['waste_pct'] ?? 0), 2)] : []));
            }
            if ($extended && array_key_exists('steps', $extra)) {
                $r->steps()->delete();
                $n = 0;
                foreach ($extra['steps'] as $step) {
                    if (trim((string) ($step['body'] ?? '')) === '') {
                        continue;
                    }
                    RecipeStep::create(['recipe_id' => $r->id, 'position' => ++$n, 'body' => trim((string) $step['body']), 'minutes' => $step['minutes'] ?? null, 'image' => $step['image'] ?? null]);
                }
            }

            return $r->load('items');
        });
    }

    /** A line written in a recipe unit must be convertible to what it is made from. */
    private function checkUnit(array $i): void
    {
        $unit = \App\Models\UnitOfMeasure::find((int) $i['unit_id']);
        if (! $unit) {
            throw new BooksException('Choose a unit that exists for the ingredient line.');
        }
        if (! empty($i['family_id'])) {
            $family = \App\Models\Menus\IngredientFamily::with('unit')->find((int) $i['family_id']);
            if ($family && $family->unit && $family->unit->dimension !== $unit->dimension) {
                throw new BooksException("{$family->name} is measured in {$family->unit->code}; {$unit->code} can not be turned into it.");
            }

            return;
        }
        app(\App\Services\Menus\RecipeLines::class)->toStockUnits((int) $i['variant_id'], 1.0, $unit->id);   // says why when the item can not be measured in this unit
    }

    /**
     * What selling `$stockQty` of this item at a branch uses, resolved to real stock items (families already decided), or null when it is not made to order.
     *
     * @return ?array<int, array{variant_id:int, product_id:?int, quantity:float, name:string}>
     */
    public function consumption(int $variantId, float $stockQty, int $locationId): ?array
    {
        $recipe = $this->madeToOrder($variantId);
        if (! $recipe) {
            return null;
        }
        $rows = app(RecipeLines::class)->requirements($recipe, $stockQty / (float) $recipe->yield_qty, $locationId);
        $info = DB::table('product_variants as pv')->join('products as p', 'p.id', '=', 'pv.product_id')->whereIn('pv.id', array_column($rows, 'variant_id'))->get(['pv.id', 'pv.product_id', 'p.name'])->keyBy('id');

        return array_map(fn ($r) => ['variant_id' => $r['variant_id'], 'product_id' => ($info[$r['variant_id']]->product_id ?? null) ? (int) $info[$r['variant_id']]->product_id : null,
            'quantity' => $r['quantity'], 'name' => $info[$r['variant_id']]->name ?? 'item '.$r['variant_id']], $rows);
    }

    /** Is this item made to order (a sale of it uses its ingredients and the item itself holds no stock)? Always false while Menus is off. */
    public function isMadeToOrder(int $variantId): bool
    {
        return $this->madeToOrder($variantId) !== null;
    }

    private static ?bool $ready = null;

    public static function forget(): void
    {
        self::$ready = null;
    }

    private function madeToOrder(int $variantId): ?Recipe
    {
        self::$ready ??= Schema::hasTable('recipes');
        if (! self::$ready || ! app(\App\Services\Licensing\LicenseManager::class)->isActive('menus')) {   // recipes belong to Menus; Core sells normally without it
            return null;
        }

        return Recipe::with('items')->where('variant_id', $variantId)->where('is_active', true)->where('deduct_on_sale', true)->first();
    }
}
