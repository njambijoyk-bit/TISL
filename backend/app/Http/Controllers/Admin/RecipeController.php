<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Production;
use App\Models\Recipe;
use App\Services\Books\BooksException;
use App\Services\Menus\RecipeCosting;
use App\Services\Menus\RecipeLines;
use App\Services\Stock\ProductionService;
use App\Services\Stock\RecipeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Recipes (what an item is made of) and production runs (making a batch from them). */
class RecipeController extends Controller
{
    public function __construct(private RecipeService $recipes, private ProductionService $production) {}

    public function index(Request $request): JsonResponse
    {
        $location = $request->integer('location_id') ?: (int) DB::table('locations')->where('is_active', 1)->orderByDesc('is_default')->orderBy('id')->value('id');
        $rows = Recipe::with('items')->orderByDesc('id')->get()->map(function (Recipe $r) use ($location) {
            $cost = app(RecipeCosting::class)->for($r, $location);

            return $this->row($r) + ['cost_each' => $cost['per_unit'], 'cost_complete' => $cost['complete']];
        })->values();
        $runs = Production::orderByDesc('id')->limit(50)->get()->map(function (Production $p) {
            $v = $this->variantName((int) $p->variant_id);

            return ['id' => $p->id, 'number' => $p->number, 'item' => $v, 'quantity' => (float) $p->quantity, 'unit_cost' => (float) $p->unit_cost, 'status' => $p->status,
                'location' => DB::table('locations')->where('id', $p->location_id)->value('name'), 'created_at' => (string) $p->created_at];
        })->values();

        return response()->json(['recipes' => $rows, 'runs' => $runs, 'location_id' => $location, 'branches' => DB::table('locations')->where('is_active', 1)->orderBy('name')->get(['id', 'name'])]);
    }

    /** Body: variant_id, yield_qty, deduct_on_sale?, note?, items[{variant_id, quantity}]. */
    public function save(Request $request): JsonResponse
    {
        $d = $request->validate([
            'variant_id' => 'required|integer|exists:product_variants,id', 'yield_qty' => 'required|numeric|min:0.0001', 'deduct_on_sale' => 'nullable|boolean', 'note' => 'nullable|string|max:255',
            'items' => 'required|array|min:1', 'items.*.variant_id' => 'nullable|integer|exists:product_variants,id', 'items.*.family_id' => 'nullable|integer', 'items.*.unit_id' => 'nullable|integer|exists:units_of_measure,id',
            'items.*.waste_pct' => 'nullable|numeric|min:0|max:90', 'items.*.quantity' => 'required|numeric|min:0.0001',
            'visibility' => 'nullable|string|max:12', 'prep_minutes' => 'nullable|integer|min:0|max:6000', 'cook_minutes' => 'nullable|integer|min:0|max:6000',
            'steps' => 'nullable|array|max:60', 'steps.*.body' => 'nullable|string|max:2000', 'steps.*.minutes' => 'nullable|integer|min:0|max:6000', 'steps.*.image' => 'nullable|string|max:255',
        ]);

        return $this->guard(function () use ($d) {
            $extra = array_intersect_key($d, array_flip(['visibility', 'prep_minutes', 'cook_minutes', 'steps']));
            $r = $this->recipes->save((int) $d['variant_id'], (float) $d['yield_qty'], (bool) ($d['deduct_on_sale'] ?? false), $d['note'] ?? null, $d['items'], $extra);

            return response()->json(['message' => 'Recipe saved.', 'recipe' => $this->row($r)]);
        });
    }

    public function destroy(int $id): JsonResponse
    {
        $r = Recipe::findOrFail($id);
        DB::transaction(function () use ($r) {
            $r->items()->delete();
            $r->delete();
        });

        return response()->json(['message' => 'Recipe removed.']);
    }

    /** What it costs to make, from what the ingredients really cost at a branch (query: location_id). */
    public function cost(Request $request, int $id): JsonResponse
    {
        $loc = $request->integer('location_id') ?: (int) DB::table('locations')->where('is_active', 1)->orderByDesc('is_default')->orderBy('id')->value('id');

        return response()->json(['location_id' => $loc] + app(RecipeCosting::class)->for(Recipe::with('items')->findOrFail($id), $loc));
    }

    /** Body: quantity, location_id, batch_no?, expiry_date?, note?. */
    public function produce(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['quantity' => 'required|numeric|min:0.0001', 'location_id' => 'required|integer|exists:locations,id', 'batch_no' => 'nullable|string|max:60', 'expiry_date' => 'nullable|date', 'note' => 'nullable|string|max:255']);

        return $this->guard(function () use ($d, $request, $id) {
            $p = $this->production->run(Recipe::with('items')->findOrFail($id), (int) $d['location_id'], (float) $d['quantity'], $d, $request->user());

            return response()->json(['message' => "{$p->number}: made {$p->quantity} at " . number_format((float) $p->unit_cost, 4) . ' each.'], 201);
        });
    }

    public function cancelRun(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $p = $this->production->cancel(Production::with('lines')->findOrFail($id));

            return response()->json(['message' => "{$p->number} cancelled; the ingredients are back."]);
        });
    }

    private function variantName(int $variantId): ?string
    {
        $v = DB::table('product_variants as pv')->join('products as p', 'p.id', '=', 'pv.product_id')->where('pv.id', $variantId)->first(['p.name', 'pv.name as variant']);

        return $v ? $v->name . ($v->variant && $v->variant !== 'Standard' ? " — {$v->variant}" : '') : null;
    }

    private function row(Recipe $r): array
    {
        return [
            'id' => $r->id, 'variant_id' => (int) $r->variant_id, 'item' => $this->variantName((int) $r->variant_id), 'yield_qty' => (float) $r->yield_qty,
            'deduct_on_sale' => (bool) $r->deduct_on_sale, 'note' => $r->note,
            'items' => $r->items->map(fn ($i) => ['variant_id' => $i->variant_id ? (int) $i->variant_id : null, 'family_id' => RecipeLines::extended() && $i->family_id ? (int) $i->family_id : null,
                'name' => RecipeLines::extended() && $i->family_id ? \App\Models\Menus\IngredientFamily::where('id', $i->family_id)->value('name') : $this->variantName((int) $i->variant_id),
                'quantity' => (float) $i->quantity, 'unit_id' => RecipeLines::extended() && $i->unit_id ? (int) $i->unit_id : null, 'waste_pct' => RecipeLines::extended() ? (float) $i->waste_pct : 0.0])->values(),
        ] + (RecipeLines::extended() ? [
            'visibility' => $r->visibility ?? 'internal', 'prep_minutes' => $r->prep_minutes, 'cook_minutes' => $r->cook_minutes,
            'steps' => $r->steps->map(fn ($s) => ['body' => $s->body, 'minutes' => $s->minutes, 'image' => $s->image])->values(),
        ] : []);
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
