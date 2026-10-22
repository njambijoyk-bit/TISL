<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\DishBatch;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\Option;
use App\Models\Menus\OptionGroup;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/** Making and changing dishes. A dish stands on its own: its own price, and a recipe on ingredients; no product is made behind it. */
class DishService
{
    /**
     * @param array{name?: string, description?: ?string, photo?: ?string, price?: float, prep_minutes?: ?int, sort_order?: int, is_active?: bool,
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
        foreach ([['allergens', 'allergens_override', FoodTags::allergens(), 'allergen'], ['tags', 'tags_override', FoodTags::tags(), 'tag']] as [$in, $col, $known, $word]) {
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
                if (! (MenusSettings::all()['sales_ledger_id'] ?? null)) {
                    throw new BooksException('Choose the sales account dishes are booked under (Menus, Configuration), so the tax is right.');
                }
                $dish = new Dish(['created_by' => $by, 'slug' => $this->slug($name)]);
            }
            $dish->fill(['name' => $name] + $override + (array_key_exists('price', $d) ? ['price' => round((float) $d['price'], 2)] : [])
                + array_intersect_key($d, array_flip(['description', 'photo', 'prep_minutes', 'sort_order', 'is_active']))
                + (array_key_exists('lead_hours', $d) && Schema::hasColumn('menus_dishes', 'lead_hours') ? ['lead_hours' => $d['lead_hours'] ?: null] : []));   // (script 143)
            if (array_key_exists('currency_id', $d) && MenuMoney::dishCurrencies()) {   // the currency the price is in (script 213); empty: the Menus currency
                if ($d['currency_id'] && ! \App\Models\Currency::whereKey((int) $d['currency_id'])->where('is_active', true)->exists()) {
                    throw new BooksException('That currency is not available. Choose an active one, or leave it empty for the Menus currency.');
                }
                $dish->currency_id = $d['currency_id'] ? (int) $d['currency_id'] : null;
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
            if (array_key_exists('section_ids', $d) && Schema::hasTable('menus_section_dishes')) {
                $this->sections($dish, (array) $d['section_ids']);
            }

            return $dish->fresh();
        });
    }

    /** Put the dish in exactly these menu sections (Mains, Drinks...): taken out of the others, added at the end of the ones it was not in. */
    private function sections(Dish $dish, array $ids): void
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if ($ids && \App\Models\Menus\MenuSection::whereIn('id', $ids)->count() !== count($ids)) {
            throw new BooksException('One of the menu sections does not exist any more.');
        }
        DB::table('menus_section_dishes')->where('dish_id', $dish->id)->whereNotIn('section_id', $ids)->delete();
        $have = DB::table('menus_section_dishes')->where('dish_id', $dish->id)->pluck('section_id')->map(fn ($i) => (int) $i)->all();
        foreach (array_diff($ids, $have) as $sectionId) {
            DB::table('menus_section_dishes')->insert(['section_id' => $sectionId, 'dish_id' => $dish->id, 'sort_order' => (int) DB::table('menus_section_dishes')->where('section_id', $sectionId)->max('sort_order') + 1]);
        }
    }

    /** "86": not available today whatever the stock says, or available again. */
    public function soldOutToday(Dish $dish, bool $soldOut): Dish
    {
        $dish->update(['sold_out_on' => $soldOut ? today()->toDateString() : null]);

        return $dish;
    }

    /** A dish that was never sold or made can be deleted; anything else is switched off instead (the books keep their history). */
    public function delete(Dish $dish): void
    {
        $history = (Schema::hasColumn('voucher_items', 'dish_id') && DB::table('voucher_items')->where('dish_id', $dish->id)->exists())
            || (Schema::hasTable('menus_dish_batches') && DishBatch::where('dish_id', $dish->id)->exists())
            || (Schema::hasTable('menus_order_lines') && DB::table('menus_order_lines')->where('dish_id', $dish->id)->exists());
        if ($history) {
            throw new BooksException("{$dish->name} has been sold or made, so it can not be deleted. Switch it off instead and it disappears from the menus; the history stays.");
        }
        DB::transaction(function () use ($dish) {
            PackagingRules::forget('dish', (int) $dish->id);
            Condiments::forget((int) $dish->id);
            if (DishRecipes::installed()) {
                app(DishRecipes::class)->delete($dish);
            }
            foreach (OptionGroup::where('dish_id', $dish->id)->get() as $g) {
                $ids = Option::where('group_id', $g->id)->pluck('id');
                \App\Models\Menus\OptionUse::whereIn('option_id', $ids)->delete();
                Option::whereIn('id', $ids)->delete();
                $g->delete();
            }
            app(DishMakeup::class)->deleteAll((int) $dish->id);
            DB::table('menus_section_dishes')->where('dish_id', $dish->id)->delete();
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
