<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Menus\Dish;
use App\Services\Books\BooksException;
use App\Services\Menus\DietBadges;
use App\Services\Menus\DishInfo;
use App\Services\Menus\DishService;
use App\Services\Menus\FoodTags;
use App\Services\Menus\MenusSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Menus → Dishes, and Settings → Menus. */
class MenusDishController extends Controller
{
    public function __construct(private DishService $dishes, private DishInfo $info)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $location = $request->integer('location_id') ?: (int) DB::table('locations')->where('is_active', 1)->orderByDesc('is_default')->orderBy('id')->value('id');
        $rows = Dish::with('recipe.items')->orderBy('sort_order')->orderBy('name')->get()->map(fn (Dish $d) => $this->row($d, $location))->values();

        return response()->json([
            'dishes' => $rows, 'location_id' => $location, 'settings' => MenusSettings::all(), 'settings_ready' => MenusSettings::ready(),
            'allergens' => FoodTags::ALLERGENS, 'tags' => FoodTags::TAGS, 'diets' => DietBadges::LABELS,
            'chefs' => \App\Services\Menus\ChefService::installed() ? \App\Models\Menus\Chef::where('is_active', true)->orderBy('display_name')->get(['id', 'display_name as name']) : null,
            'stations' => \App\Services\Menus\KitchenService::installed() ? \App\Models\Menus\Station::where('is_active', true)->orderBy('sort_order')->orderBy('name')->get(['id', 'name']) : null,
            'branches' => DB::table('locations')->where('is_active', 1)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    /** Body: name, price, description?, photo?, prep_minutes?, sort_order?, is_active?, sales_ledger_id? (new dishes), allergens? / tags? (omit or null = from the ingredients; a list = declared). */
    public function save(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate([
            'name' => 'required|string|max:150', 'price' => 'nullable|numeric|min:0', 'description' => 'nullable|string|max:3000', 'photo' => 'nullable|string|max:255', 'prep_minutes' => 'nullable|integer|min:0|max:6000', 'lead_hours' => 'nullable|integer|min:0|max:2000',
            'sort_order' => 'nullable|integer|min:0|max:9999', 'is_active' => 'nullable|boolean', 'sales_ledger_id' => 'nullable|integer', 'station_id' => 'nullable|integer', 'chef_id' => 'nullable|integer',
            'allergens' => 'nullable|array', 'allergens.*' => 'string|max:20', 'tags' => 'nullable|array', 'tags.*' => 'string|max:20',
        ]);

        return $this->guard(function () use ($d, $id, $request) {
            $dish = $this->dishes->save($d, $id, $request->user()?->id);

            return response()->json(['message' => 'Dish saved.', 'dish' => $this->row($dish->load('recipe.items'), null)], $id === null ? 201 : 200);
        });
    }

    /** Body: sold_out (bool). */
    public function soldOut(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['sold_out' => 'required|boolean']);
        $dish = $this->dishes->soldOutToday(Dish::findOrFail($id), (bool) $d['sold_out']);

        return response()->json(['message' => $dish->sold_out_on ? "{$dish->name} is marked sold out for today." : "{$dish->name} is available again.", 'dish' => $this->row($dish->load('recipe.items'), null)]);
    }

    public function destroy(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $this->dishes->delete(Dish::findOrFail($id));

            return response()->json(['message' => 'Dish deleted.']);
        });
    }

    public function settings(): JsonResponse
    {
        return response()->json(['settings' => MenusSettings::all(), 'ready' => MenusSettings::ready()]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        $d = $request->validate(['sales_ledger_id' => 'nullable|integer', 'category_id' => 'nullable|integer', 'allergen_note' => 'nullable|string|max:600', 'receipt_footer' => 'nullable|string|max:200',
            'tip_ledger_id' => 'nullable|integer', 'service_charge_ledger_id' => 'nullable|integer', 'service_charge_pct' => 'nullable|numeric|min:0|max:30', 'custom_orders' => 'nullable|boolean', 'custom_deposit_pct' => 'nullable|numeric|min:0|max:100', 'custom_quote_days' => 'nullable|numeric|min:1|max:90', 'custom_lead_hours' => 'nullable|numeric|min:0|max:720', 'chef_lead_hours' => 'nullable|numeric|min:0|max:720', 'rota_max_week_hours' => 'nullable|numeric|min:1|max:120', 'rota_min_rest_hours' => 'nullable|numeric|min:0|max:24', 'rota_ahead_weeks' => 'nullable|numeric|min:0|max:8', 'rota_swaps_need_approval' => 'nullable|boolean', 'rota_no_show_alerts' => 'nullable|boolean', 'rota_overtime_source' => 'nullable|string|in:attendance,rota', 'rota_overtime_grace' => 'nullable|numeric|min:0|max:120', 'rota_claims_need_approval' => 'nullable|boolean', 'rota_clock_from_rota' => 'nullable|boolean', 'rota_clock_early' => 'nullable|numeric|min:0|max:240', 'rota_premium_source' => 'nullable|string|in:off,payroll', 'rota_overtime_needs_approval' => 'nullable|boolean', 'rota_clock_location' => 'nullable|string|in:off,warn,require', 'rota_clock_radius' => 'nullable|numeric|min:20|max:5000', 'rota_clock_accuracy' => 'nullable|numeric|min:10|max:2000', 'qr_ordering' => 'nullable|boolean', 'qr_open_by_scan' => 'nullable|boolean']);

        return $this->guard(fn () => response()->json(['message' => 'Menus settings saved.', 'settings' => MenusSettings::save($d, $request->user()?->id)]));
    }

    private function row(Dish $d, ?int $location): array
    {
        $profile = $this->info->profile($d);
        $recipe = $d->recipe;

        return [
            'id' => $d->id, 'name' => $d->name, 'slug' => $d->slug, 'description' => $d->description, 'photo' => $d->photo, 'prep_minutes' => $d->prep_minutes, 'lead_hours' => $d->lead_hours ?? null, 'sort_order' => $d->sort_order, 'is_active' => $d->is_active,
            'variant_id' => (int) $d->variant_id, 'product_id' => (int) $d->product_id, 'station_id' => $d->station_id, 'chef_id' => $d->chef_id, 'sold_out_today' => (bool) ($d->sold_out_on && $d->sold_out_on->isToday()),
            'has_recipe' => (bool) $recipe, 'made_to_order' => (bool) ($recipe && $recipe->deduct_on_sale),
            'allergens' => $profile['allergens'], 'tags' => $profile['tags'], 'diets' => $profile['diets'], 'info_complete' => $profile['complete'], 'declared' => $profile['declared'],
            'allergens_declared' => $d->allergens_override !== null, 'tags_declared' => $d->tags_override !== null,
        ] + ($location ? ['available' => $this->info->portions($d, $location)] + $this->info->money($d, $location) : []);
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
