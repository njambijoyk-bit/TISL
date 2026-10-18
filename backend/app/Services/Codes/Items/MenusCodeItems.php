<?php

namespace App\Services\Codes\Items;

use App\Services\Licensing\LicenseManager;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * What the Menus module can put a code on (Codes page, build step 9.1 of docs/MENUS_DISHES_PLAN.md): a dish, a recipe, a batch of prepared food, a lot of an ingredient, and a kitchen stock item
 * (one pack of an ingredient: a crate of Coke). Dishes, recipes and the two kinds of lot carry a code made from their number (nothing is stored, like a stock batch: DSH, RCP, PBL and ILT and
 * eight digits); a kitchen stock item stores its own code, which may be a supplier's barcode. The types are only on offer while Menus is switched on and its tables are there.
 */
final class MenusCodeItems
{
    public const TYPES = ['dish' => 'Dish', 'recipe' => 'Recipe', 'prep_lot' => 'Prepared batch', 'stock_lot' => 'Ingredient lot', 'kitchen_item' => 'Kitchen stock item'];

    /** the codes made from a number: type => the letters in front */
    public const DERIVED = ['dish' => 'DSH', 'recipe' => 'RCP', 'prep_lot' => 'PBL', 'stock_lot' => 'ILT'];

    /** the table each type needs */
    private const TABLES = ['dish' => ['menus_dishes'], 'recipe' => ['menus_recipes', 'menus_dishes'], 'prep_lot' => ['menus_prep_lots', 'menus_recipes'],
        'stock_lot' => ['menus_stock_batches', 'menus_ingredient_items', 'menus_ingredients'], 'kitchen_item' => ['menus_ingredient_items', 'menus_ingredients']];

    public static function is(string $type): bool
    {
        return isset(self::TYPES[$type]);
    }

    /** Is Menus on, so that its things can be given codes? */
    public static function on(): bool
    {
        try {
            return app(LicenseManager::class)->isActive('menus');
        } catch (Throwable) {
            return false;
        }
    }

    /** Can this type be listed, found and labelled right now? */
    public static function ready(string $type): bool
    {
        if (! self::is($type) || ! self::on()) {
            return false;
        }
        foreach (self::TABLES[$type] as $t) {
            if (! Schema::hasTable($t)) {
                return false;
            }
        }

        return true;
    }

    /** @return array<string, string> the types on offer now, by name */
    public static function offered(): array
    {
        return array_filter(self::TYPES, fn ($label, $type) => self::ready($type), ARRAY_FILTER_USE_BOTH);
    }

    public static function derived(string $type, int $id): ?string
    {
        return isset(self::DERIVED[$type]) ? self::DERIVED[$type].str_pad((string) $id, 8, '0', STR_PAD_LEFT) : null;
    }

    /** The type a made-from-a-number code belongs to, and its number: "DSH00000012" is the dish 12. @return ?array{0: string, 1: int} */
    public static function parse(string $code): ?array
    {
        if (preg_match('/^(DSH|RCP|PBL|ILT)(\d{8})$/i', $code, $m)) {
            return [array_search(strtoupper($m[1]), self::DERIVED, true), (int) $m[2]];
        }

        return null;
    }

    /** the column to sort a list by, and to find one item by */
    public static function key(string $type): string
    {
        return ['dish' => 'd.id', 'recipe' => 'r.id', 'prep_lot' => 'l.id', 'stock_lot' => 'b.id', 'kitchen_item' => 'i.id'][$type];
    }

    public static function query(string $type): Builder
    {
        return match ($type) {
            'dish' => DB::table('menus_dishes as d')
                ->when(Schema::hasColumn('menus_dishes', 'currency_id') && Schema::hasTable('currencies'), fn ($q) => $q->leftJoin('currencies as c', 'c.id', '=', 'd.currency_id')->addSelect('c.code as currency'), fn ($q) => $q->addSelect(DB::raw('NULL as currency')))
                ->addSelect('d.id', 'd.name as product', 'd.price', 'd.slug'),
            'recipe' => DB::table('menus_recipes as r')->leftJoin('menus_dishes as d', 'd.id', '=', 'r.dish_id')
                ->addSelect('r.id', DB::raw((Schema::hasColumn('menus_recipes', 'name') ? 'COALESCE(r.name, d.name)' : 'd.name').' as product'), 'r.dish_id'),
            'prep_lot' => DB::table('menus_prep_lots as l')->leftJoin('menus_recipes as r', 'r.id', '=', 'l.recipe_id')->leftJoin('menus_dishes as d', 'd.id', '=', 'r.dish_id')
                ->when(Schema::hasTable('menus_prep_runs') && Schema::hasTable('menus_chefs'), fn ($q) => $q->leftJoin('menus_prep_runs as run', 'run.id', '=', 'l.run_id')->leftJoin('menus_chefs as ch', 'ch.id', '=', 'run.chef_id')
                    ->addSelect('ch.display_name as chef', DB::raw('COALESCE(run.finished_at, run.started_at, l.created_at) as cooked_at')), fn ($q) => $q->addSelect(DB::raw('NULL as chef'), 'l.created_at as cooked_at'))
                ->addSelect('l.id', DB::raw((Schema::hasColumn('menus_recipes', 'name') ? 'COALESCE(r.name, d.name)' : 'd.name').' as product'), 'l.lot_no as batch_no', 'l.expiry_date', 'l.made_on'),
            'stock_lot' => DB::table('menus_stock_batches as b')->join('menus_ingredient_items as i', 'i.id', '=', 'b.item_id')->join('menus_ingredients as g', 'g.id', '=', 'i.ingredient_id')
                ->select('b.id', 'g.name as product', 'i.name as variant', 'b.batch_no', 'b.expiry_date', 'b.received_on as made_on', 'b.received_on as cooked_at'),
            'kitchen_item' => DB::table('menus_ingredient_items as i')->join('menus_ingredients as g', 'g.id', '=', 'i.ingredient_id')
                ->select('i.id', 'g.name as product', 'i.name as variant', 'i.code', 'i.ingredient_id'),
        };
    }

    public static function search(string $type, $w, string $like): void
    {
        match ($type) {
            'dish' => $w->where('d.name', 'like', $like),
            'recipe' => $w->where('d.name', 'like', $like)->when(Schema::hasColumn('menus_recipes', 'name'), fn ($q) => $q->orWhere('r.name', 'like', $like)),
            'prep_lot' => $w->where('l.lot_no', 'like', $like)->orWhere('d.name', 'like', $like),
            'stock_lot' => $w->where('g.name', 'like', $like)->orWhere('i.name', 'like', $like)->orWhere('b.batch_no', 'like', $like),
            'kitchen_item' => $w->where('g.name', 'like', $like)->orWhere('i.name', 'like', $like)->orWhere('i.code', 'like', $like),
        };
    }

    /** @return array<string, mixed> the same shape the catalogue gives a product, so the Codes page and the labels read it the same way */
    public static function shape(string $type, object $r): array
    {
        $variant = (string) ($r->variant ?? '');
        $product = (string) ($r->product ?? '');
        $name = trim($product.($variant !== '' && strcasecmp($variant, $product) !== 0 ? ' — '.$variant : ''));
        $label = match ($type) {
            'prep_lot' => implode(' · ', array_filter([$product, 'batch '.($r->batch_no ?: '#'.$r->id), $r->expiry_date ? 'use by '.substr((string) $r->expiry_date, 0, 10) : null])),
            'stock_lot' => implode(' · ', array_filter([$name, 'lot '.($r->batch_no ?: '#'.$r->id), $r->expiry_date ? 'expires '.substr((string) $r->expiry_date, 0, 10) : null])),
            default => $name,
        };
        $made = match ($type) {
            'prep_lot' => self::made('Made', $r->cooked_at ?? null, $r->chef ?? null, true),
            'stock_lot' => self::made('Received', $r->made_on ?? null, null, false),
            default => null,
        };
        $code = isset(self::DERIVED[$type]) ? self::derived($type, (int) $r->id) : ($r->code !== null && $r->code !== '' ? (string) $r->code : null);

        return ['type' => $type, 'id' => (int) $r->id, 'variant_id' => null, 'product_id' => null, 'pack_units' => null, 'label' => $label, 'sku' => null, 'code' => $code, 'derived' => isset(self::DERIVED[$type]),
            'price' => isset($r->price) && $r->price !== null ? (float) $r->price : null, 'currency' => $r->currency ?? null,
            'batch_no' => $r->batch_no ?? null, 'expiry' => isset($r->expiry_date) && $r->expiry_date ? substr((string) $r->expiry_date, 0, 10) : null, 'name' => $name,
            'ingredient_id' => isset($r->ingredient_id) ? (int) $r->ingredient_id : null, 'dish_id' => isset($r->dish_id) && $r->dish_id ? (int) $r->dish_id : null,
            'payload' => self::link($type, $r), 'made' => $made, 'expiry_label' => in_array($type, ['prep_lot', 'stock_lot'], true) ? 'use by' : null];
    }

    /** "Made 17 Oct 14:30, Chef Wanjiru": when it was made and by whom, for the label of a batch. */
    private static function made(string $word, $at, ?string $chef, bool $withTime): ?string
    {
        if (! $at) {
            return $chef ? $word.' by '.$chef : null;
        }
        $d = \Illuminate\Support\Carbon::parse($at);

        return $word.' '.$d->format('j M').($withTime && $d->format('H:i') !== '00:00' ? ' '.$d->format('H:i') : '').($chef ? ', '.$chef : '');
    }

    private static function base(): string
    {
        return rtrim((string) config('app.frontend_url'), '/');
    }

    /** What the QR of a dish or a recipe holds (9.2): a page to open. The dish's page is the public menu at that dish; the recipe's is the kitchen card, for staff who are signed in. Null for the rest. */
    public static function link(string $type, object $r): ?string
    {
        return match ($type) {
            'dish' => ! empty($r->slug) ? self::base().'/menu?dish='.rawurlencode((string) $r->slug) : null,
            'recipe' => self::base().'/admin/menus/recipes?card='.(int) $r->id,
            default => null,
        };
    }

    /** A scan of the QR itself is a link, not a code: read the dish or recipe out of it. @return ?array{0: string, 1: int} */
    public static function fromLink(string $text): ?array
    {
        if (! preg_match('#^https?://#i', $text)) {
            return null;
        }
        if (preg_match('/[?&]dish=([^&#]+)/', $text, $m) && Schema::hasTable('menus_dishes')) {
            $v = rawurldecode($m[1]);
            $id = DB::table('menus_dishes')->where('slug', $v)->value('id');

            return $id ? ['dish', (int) $id] : null;
        }
        if (preg_match('#/admin/menus/recipes\?card=(\d+)#', $text, $m)) {
            return ['recipe', (int) $m[1]];
        }

        return null;
    }
}
