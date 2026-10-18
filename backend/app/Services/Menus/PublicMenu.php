<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\Menu;
use App\Models\Menus\OptionGroup;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** What a customer sees: the active menus with their sections and dishes, what is being served now, and for each dish its allergens, diets, choices and whether it can be had at the branch. */
class PublicMenu
{
    public function __construct(private DishInfo $info)
    {
    }

    /** @return array<string, mixed> */
    public function build(Carbon $now, ?int $locationId): array
    {
        $location = $locationId ?: (int) DB::table('locations')->where('is_active', 1)->orderByDesc('is_default')->orderBy('id')->value('id');
        $dishes = [];
        $menus = Menu::with('sections.dishes.menuRecipe.lines.ingredient')->where('is_active', true)->orderBy('sort_order')->orderBy('name')->get()->map(function (Menu $m) use ($now, $location, &$dishes) {
            return [
                'id' => $m->id, 'name' => $m->name, 'slug' => $m->slug, 'description' => $m->description, 'serves' => MenuSchedule::words($m), 'serving_now' => MenuSchedule::serving($m, $now),
                'sections' => $m->sections->map(fn ($s) => [
                    'id' => $s->id, 'name' => $s->name, 'description' => $s->description,
                    'dishes' => $s->dishes->where('is_active', true)->map(fn (Dish $d) => $dishes[$d->id] ??= $this->dish($d, $location))->values()->all(),
                ])->filter(fn ($s) => $s['dishes'])->values()->all(),
            ];
        })->filter(fn ($m) => $m['sections'])->values()->all();

        return ['menus' => $menus, 'allergens' => FoodTags::allergens(), 'diets' => DietBadges::LABELS, 'note' => MenusSettings::all()['allergen_note'], 'now' => $now->toIso8601String()];
    }

    /** @return array<string, mixed> */
    private function dish(Dish $d, int $location): array
    {
        $profile = $this->info->profile($d);
        $portions = $this->info->portions($d, $location);

        return [
            'id' => $d->id, 'name' => $d->name, 'slug' => $d->slug, 'description' => $d->description, 'photo' => $d->photo, 'prep_minutes' => $d->prep_minutes,
            'price' => (float) $d->price, 'price_incl' => $this->inclusive($d),
            'available' => $portions > 0, 'sold_out_today' => (bool) ($d->sold_out_on && $d->sold_out_on->isToday()),
            'allergens' => $profile['allergens'], 'diets' => $profile['diets'], 'info_complete' => $profile['complete'],
            'options' => $this->options($d), 'chef' => $this->chefName($d), 'makeup' => $this->makeup($d, $location),
        ];
    }

    /**
     * The sizes and the sides to pick from (script 202), for a dish that has them: the price of each size, each slot with what can be chosen in it and whether that side can be served at the branch now,
     * and who the dish is for. Null for a dish with no make-up, which is ordered as it always was.
     *
     * @return ?array<string, mixed>
     */
    private function makeup(Dish $d, int $location): ?array
    {
        if (! DishSelection::applies($d)) {
            return null;
        }
        $m = app(DishMakeup::class)->show($d);
        $stock = app(SideStock::class);
        $sides = \App\Models\Menus\Side::with('recipe', 'ingredient', 'amounts')->whereIn('id', collect($m['slots'])->flatMap(fn ($s) => array_column($s['choices'], 'side_id'))->all())->get()->keyBy('id');
        $servings = array_map(fn ($s) => ['id' => $s['serving_id'], 'name' => $s['serving'], 'price' => $s['price'], 'price_incl' => $this->inclusive($d, $s['price'])], $m['servings']);

        return [
            'servings' => $servings,
            'from' => $servings ? min(array_column($servings, 'price')) : null,
            'audiences' => $m['audience_ids'] ? \Illuminate\Support\Facades\DB::table('menus_audiences')->whereIn('id', $m['audience_ids'])->orderBy('sort_order')->pluck('name')->all() : [],
            'slots' => array_map(fn ($slot) => [
                'id' => $slot['id'], 'name' => $slot['name'], 'kind' => $slot['kind'], 'min' => $slot['min'], 'max' => $slot['max'],
                'choices' => array_map(fn ($c) => ['side_id' => $c['side_id'], 'name' => $c['side'], 'upcharge' => $c['upcharge'], 'is_default' => $c['is_default'],
                    'available' => isset($sides[$c['side_id']]) && $stock->servings($sides[$c['side_id']], $location) > 0], $slot['choices']),
            ], $m['slots']),
        ];
    }

    /** "Chef Wanjiru", for a dish by a chef who is shown to guests. */
    private function chefName(Dish $d): ?string
    {
        if (! $d->chef_id || ! ChefService::installed()) {
            return null;
        }

        return \App\Models\Menus\Chef::where('id', $d->chef_id)->where('is_public', true)->where('is_active', true)->value('display_name');
    }

    private function inclusive(Dish $d, ?float $price = null): ?float
    {
        try {
            $ledger = MenusSettings::all()['sales_ledger_id'] ?? null;

            return $ledger ? (float) \App\Services\Books\PriceTax::split($price ?? (float) $d->price, \App\Services\Books\PriceTax::forAccount((int) $ledger))['gross'] : null;
        } catch (\Throwable) {
            return null;   // no tax figure can be worked out (no tax set on the account yet): the screen shows the price before tax
        }
    }

    /** @return array<int, array<string, mixed>> */
    private function options(Dish $d): array
    {
        return OptionGroup::with(['options' => fn ($q) => $q->where('is_active', true)])->offered()->where('dish_id', $d->id)->orderBy('sort_order')->get()->map(fn (OptionGroup $g) => [
            'id' => $g->id, 'name' => $g->name, 'kind' => $g->kind, 'min_choices' => $g->min_choices, 'max_choices' => $g->kind === 'single' ? 1 : $g->max_choices,
            'options' => $g->options->map(fn ($o) => ['id' => $o->id, 'name' => $o->name, 'price_delta' => (float) $o->price_delta, 'is_default' => $o->is_default,
                'dish' => $o->linked_dish_id ? Dish::whereKey($o->linked_dish_id)->value('name') : null])->values()->all(),
        ])->filter(fn ($g) => $g['options'])->values()->all();
    }
}
