<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Product;
use App\Services\Books\BooksException;
use App\Services\Books\TradingAccounts;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/** Making and changing dishes. */
class DishService
{
    public function __construct(private DishItems $items)
    {
    }

    /**
     * @param array{name?: string, description?: ?string, photo?: ?string, price?: float, sales_ledger_id?: ?int, prep_minutes?: ?int, sort_order?: int, is_active?: bool,
     *              allergens?: ?array, tags?: ?array} $d `allergens` / `tags`: absent or null = worked out from the ingredients, a list (even an empty one) = exactly these are declared
     */
    public function save(array $d, ?int $id = null, ?int $by = null): Dish
    {
        $dish = $id ? Dish::findOrFail($id) : null;
        $name = array_key_exists('name', $d) ? trim((string) $d['name']) : $dish?->name;
        if (! $name) {
            throw new BooksException('Give the dish a name.');
        }
        if (array_key_exists('price', $d) && (! is_numeric($d['price']) || (float) $d['price'] < 0)) {
            throw new BooksException('The price can not be less than nothing.');
        }
        if (! $dish && ! array_key_exists('price', $d)) {
            throw new BooksException('Give the dish a price.');
        }
        $override = [];
        foreach ([['allergens', 'allergens_override', FoodTags::ALLERGENS, 'allergen'], ['tags', 'tags_override', FoodTags::TAGS, 'tag']] as [$in, $col, $known, $word]) {
            if (array_key_exists($in, $d)) {
                if ($d[$in] === null) {
                    $override[$col] = null;
                    continue;
                }
                if ($bad = FoodTags::unknown((array) $d[$in], $known)) {
                    throw new BooksException('Unknown '.$word.': '.implode(', ', $bad).'.');
                }
                $override[$col] = FoodTags::clean((array) $d[$in], $known);
            }
        }

        return DB::transaction(function () use ($d, $dish, $name, $by, $override) {
            if (! $dish) {
                $settings = MenusSettings::all();
                $ledger = ! empty($d['sales_ledger_id']) ? (int) $d['sales_ledger_id'] : ($settings['sales_ledger_id'] ? (int) $settings['sales_ledger_id'] : null);
                if (! $ledger) {
                    throw new BooksException('Choose the sales account dishes are booked under (Settings → Menus), so the tax is right.');
                }
                if ($problem = TradingAccounts::problem($ledger, 'sales')) {
                    throw new BooksException($problem);
                }
                [$product, $variant] = $this->items->make($name, (float) $d['price'], $ledger, $settings['category_id'] ? (int) $settings['category_id'] : null, $by);
                $dish = new Dish(['product_id' => $product->id, 'variant_id' => $variant->id, 'created_by' => $by, 'slug' => $this->slug($name)]);
            } else {
                $product = Product::findOrFail($dish->product_id);
                $this->items->makeSellable($product);
                if (array_key_exists('price', $d)) {
                    $this->items->setPrice($product, $dish->variant, (float) $d['price']);
                }
            }
            $dish->fill(['name' => $name] + $override + array_intersect_key($d, array_flip(['description', 'photo', 'prep_minutes', 'sort_order', 'is_active']))
                + (array_key_exists('lead_hours', $d) && Schema::hasColumn('menus_dishes', 'lead_hours') ? ['lead_hours' => $d['lead_hours'] ?: null] : []));   // (script 143)
            if ($dish->exists && $dish->isDirty('name')) {
                Product::where('id', $dish->product_id)->update(['name' => $name]);
            }
            if (array_key_exists('station_id', $d) && KitchenService::installed()) {
                $st = $d['station_id'] ? \App\Models\Menus\Station::find($d['station_id']) : null;
                if ($d['station_id'] && ! $st) {
                    throw new BooksException('That kitchen station does not exist.');
                }
                $dish->station_id = $st?->id;
            }
            if (array_key_exists('chef_id', $d) && ChefService::installed() && \Illuminate\Support\Facades\Schema::hasColumn('menus_dishes', 'chef_id')) {
                $chef = $d['chef_id'] ? \App\Models\Menus\Chef::where('is_active', true)->find($d['chef_id']) : null;
                if ($d['chef_id'] && ! $chef) {
                    throw new BooksException('That chef does not exist or is switched off.');
                }
                $dish->chef_id = $chef?->id;
            }
            $dish->save();

            return $dish->fresh();
        });
    }

    /** "86": not available today whatever the stock says, or available again. */
    public function soldOutToday(Dish $dish, bool $soldOut): Dish
    {
        $dish->update(['sold_out_on' => $soldOut ? today()->toDateString() : null]);

        return $dish;
    }

    /** A dish that was never sold, stocked or priced anywhere can be deleted; anything else is switched off instead (the books keep their history). */
    public function delete(Dish $dish): void
    {
        foreach (['stock_movements' => 'variant_id', 'stock_batches' => 'variant_id', 'voucher_items' => 'variant_id', 'productions' => 'variant_id'] as $table => $col) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, $col) && DB::table($table)->where($col, $dish->variant_id)->exists()) {
                throw new BooksException("{$dish->name} has been sold or stocked, so it can not be deleted. Switch it off instead and it disappears from the menus; the history stays.");
            }
        }
        DB::transaction(function () use ($dish) {
            DB::table('recipes')->where('variant_id', $dish->variant_id)->get(['id'])->each(function ($r) {
                DB::table('recipe_items')->where('recipe_id', $r->id)->delete();
                if (Schema::hasTable('recipe_steps')) {
                    DB::table('recipe_steps')->where('recipe_id', $r->id)->delete();
                }
                DB::table('recipes')->where('id', $r->id)->delete();
            });
            DB::table('product_variant_units')->where('variant_id', $dish->variant_id)->delete();
            DB::table('product_variants')->where('id', $dish->variant_id)->delete();
            Product::where('id', $dish->product_id)->delete();
            $dish->delete();
        });
    }

    private function slug(string $name): string
    {
        $base = Str::slug($name) ?: 'dish';
        $slug = $base;
        for ($i = 2; Dish::where('slug', $slug)->exists(); $i++) {
            $slug = $base.'-'.$i;
        }

        return $slug;
    }
}
