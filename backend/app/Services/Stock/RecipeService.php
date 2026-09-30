<?php

namespace App\Services\Stock;

use App\Models\Recipe;
use App\Models\RecipeItem;
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
    /** @param array<int, array{variant_id:int, quantity:float}> $items */
    public function save(int $variantId, float $yield, bool $onSale, ?string $note, array $items): Recipe
    {
        $items = array_values(array_filter($items, fn ($i) => (float) ($i['quantity'] ?? 0) > 0));
        if ($yield <= 0) {
            throw new BooksException('The yield must be more than zero.');
        }
        if (! $items) {
            throw new BooksException('Add at least one ingredient.');
        }
        $ids = array_map(fn ($i) => (int) $i['variant_id'], $items);
        if (in_array($variantId, $ids, true)) {
            throw new BooksException('An item cannot be an ingredient of itself.');
        }
        if (count($ids) !== count(array_unique($ids))) {
            throw new BooksException('An ingredient is listed twice — add the amounts together.');
        }
        if (Recipe::whereIn('variant_id', $ids)->where('deduct_on_sale', true)->where('is_active', true)->exists()) {
            throw new BooksException('An ingredient that is itself made to order cannot be used in another recipe.');
        }

        return DB::transaction(function () use ($variantId, $yield, $onSale, $note, $items) {
            $r = Recipe::updateOrCreate(['variant_id' => $variantId], ['yield_qty' => $yield, 'deduct_on_sale' => $onSale, 'note' => $note, 'is_active' => true]);
            $r->items()->delete();
            foreach ($items as $i) {
                RecipeItem::create(['recipe_id' => $r->id, 'variant_id' => (int) $i['variant_id'], 'quantity' => round((float) $i['quantity'], 4)]);
            }

            return $r->load('items');
        });
    }

    /**
     * The ingredients a sale of this item uses, or null when it is not made to order.
     *
     * @return ?array{yield: float, items: array<int, array{variant_id:int, product_id:?int, quantity:float, name:string}>}
     */
    public function onSale(int $variantId): ?array
    {
        static $ready = null;
        $ready ??= Schema::hasTable('recipes');
        if (! $ready) {
            return null;
        }
        $r = Recipe::where('variant_id', $variantId)->where('is_active', true)->where('deduct_on_sale', true)->first();
        if (! $r) {
            return null;
        }
        $items = DB::table('recipe_items as ri')->join('product_variants as pv', 'pv.id', '=', 'ri.variant_id')->join('products as p', 'p.id', '=', 'pv.product_id')
            ->where('ri.recipe_id', $r->id)->get(['ri.variant_id', 'pv.product_id', 'ri.quantity', 'p.name'])
            ->map(fn ($x) => ['variant_id' => (int) $x->variant_id, 'product_id' => (int) $x->product_id, 'quantity' => (float) $x->quantity, 'name' => $x->name])->all();

        return ['yield' => (float) $r->yield_qty, 'items' => $items];
    }
}
