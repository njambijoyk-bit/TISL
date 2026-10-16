<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Menus\Dish;
use App\Models\Menus\Menu;
use App\Services\Books\BooksException;
use App\Services\Menus\DishOptions;
use App\Services\Menus\MenuSchedule;
use App\Services\Menus\MenuService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Menus → Menus (the cards and their sections) and the choices on a dish. */
class MenusMenuController extends Controller
{
    public function __construct(private MenuService $menus, private DishOptions $options)
    {
    }

    public function index(): JsonResponse
    {
        $now = Carbon::now((string) config('app.timezone', 'Africa/Nairobi'));
        $menus = Menu::with('sections.dishes:id,name')->orderBy('sort_order')->orderBy('name')->get()->map(fn (Menu $m) => [
            'id' => $m->id, 'name' => $m->name, 'slug' => $m->slug, 'description' => $m->description, 'days' => $m->days ?? [], 'starts_at' => $m->starts_at ? substr($m->starts_at, 0, 5) : '', 'ends_at' => $m->ends_at ? substr($m->ends_at, 0, 5) : '',
            'sort_order' => $m->sort_order, 'is_active' => $m->is_active, 'serves' => MenuSchedule::words($m), 'serving_now' => MenuSchedule::serving($m, $now),
            'sections' => $m->sections->map(fn ($s) => ['name' => $s->name, 'description' => $s->description, 'dishes' => $s->dishes->map(fn ($d) => ['id' => $d->id, 'name' => $d->name])->values()->all()])->values()->all(),
        ])->values();

        return response()->json(['menus' => $menus, 'dishes' => Dish::orderBy('name')->get(['id', 'name', 'is_active']), 'days' => MenuSchedule::DAYS]);
    }

    /** Body: name, description?, days?, starts_at?, ends_at?, sort_order?, is_active?, sections[{name, description?, dishes[ids]}]. */
    public function save(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate([
            'name' => 'required|string|max:120', 'description' => 'nullable|string|max:500', 'days' => 'nullable|array', 'days.*' => 'integer|between:0,6', 'starts_at' => 'nullable|string|max:8', 'ends_at' => 'nullable|string|max:8',
            'sort_order' => 'nullable|integer|min:0|max:9999', 'is_active' => 'nullable|boolean',
            'sections' => 'nullable|array|max:40', 'sections.*.name' => 'required|string|max:120', 'sections.*.description' => 'nullable|string|max:300', 'sections.*.dishes' => 'nullable|array|max:200', 'sections.*.dishes.*' => 'integer',
        ]);

        return $this->guard(function () use ($d, $id) {
            $m = $this->menus->save($d, $id);

            return response()->json(['message' => 'Menu saved.', 'menu' => ['id' => $m->id, 'name' => $m->name, 'slug' => $m->slug]], $id === null ? 201 : 200);
        });
    }

    public function destroy(int $id): JsonResponse
    {
        $this->menus->delete(Menu::findOrFail($id));

        return response()->json(['message' => 'Menu deleted. The dishes are untouched.']);
    }

    /** The choices on one dish, with what the screen needs to edit them. */
    public function options(int $id): JsonResponse
    {
        $dish = Dish::with('menuRecipe.lines.ingredient')->findOrFail($id);

        return response()->json([
            'dish' => ['id' => $dish->id, 'name' => $dish->name, 'has_recipe' => (bool) $dish->menuRecipe],
            'groups' => $this->options->forDish($dish),
            'ingredients' => \App\Models\Menus\Ingredient::where('is_active', true)->with(['baseUnit:id,code', 'altUnit:id,code'])->orderBy('name')->get()->map(fn ($i) => ['id' => $i->id, 'name' => $i->name, 'base_unit' => $i->baseUnit?->code, 'alt_unit' => $i->altUnit?->code]),
            'dishes' => Dish::where('id', '!=', $dish->id)->orderBy('name')->get(['id', 'name']),
            'recipe_lines' => $dish->menuRecipe ? $dish->menuRecipe->lines->map(fn ($l) => ['ingredient_id' => (int) $l->ingredient_id, 'name' => $l->ingredient?->name])->values() : [],
        ]);
    }

    /** Body: groups[{id?, name, kind, min_choices, max_choices, options[{id?, name, price_delta, is_default, charge_removal, linked_dish_id, is_active, uses[{mode, ingredient_id, quantity, unit: base|alt}]}]}]. */
    public function saveOptions(Request $request, int $id): JsonResponse
    {
        $d = $request->validate([
            'groups' => 'present|array|max:20', 'groups.*.id' => 'nullable|integer', 'groups.*.name' => 'required|string|max:120', 'groups.*.kind' => 'nullable|string|max:8', 'groups.*.min_choices' => 'nullable|integer|min:0|max:50', 'groups.*.max_choices' => 'nullable|integer|min:1|max:50',
            'groups.*.options' => 'required|array|min:1|max:60', 'groups.*.options.*.id' => 'nullable|integer', 'groups.*.options.*.name' => 'required|string|max:120', 'groups.*.options.*.price_delta' => 'nullable|numeric',
            'groups.*.options.*.is_default' => 'nullable|boolean', 'groups.*.options.*.charge_removal' => 'nullable|boolean', 'groups.*.options.*.linked_dish_id' => 'nullable|integer', 'groups.*.options.*.is_active' => 'nullable|boolean',
            'groups.*.options.*.uses' => 'nullable|array|max:20', 'groups.*.options.*.uses.*.mode' => 'required|string|max:8', 'groups.*.options.*.uses.*.ingredient_id' => 'nullable|integer',
            'groups.*.options.*.uses.*.quantity' => 'nullable|numeric|min:0', 'groups.*.options.*.uses.*.unit' => 'nullable|in:base,alt',
        ]);

        return $this->guard(function () use ($d, $id) {
            $dish = Dish::with('menuRecipe.lines')->findOrFail($id);
            $this->options->save($dish, $d['groups']);

            return response()->json(['message' => 'Choices saved.', 'groups' => $this->options->forDish($dish)]);
        });
    }

    private function guard(\Closure $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}
