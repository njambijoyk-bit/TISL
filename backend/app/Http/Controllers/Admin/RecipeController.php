<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Production;
use App\Models\Recipe;
use App\Services\Books\BooksException;
use App\Services\Stock\ProductionService;
use App\Services\Stock\RecipeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Recipes (what an item is made of) and production runs (making a batch from them). */
class RecipeController extends Controller
{
    public function __construct(private RecipeService $recipes, private ProductionService $production) {}

    public function index(): JsonResponse
    {
        $rows = Recipe::with('items')->orderByDesc('id')->get()->map(fn (Recipe $r) => $this->row($r))->values();
        $runs = Production::orderByDesc('id')->limit(50)->get()->map(function (Production $p) {
            $v = $this->variantName((int) $p->variant_id);

            return ['id' => $p->id, 'number' => $p->number, 'item' => $v, 'quantity' => (float) $p->quantity, 'unit_cost' => (float) $p->unit_cost, 'status' => $p->status,
                'location' => DB::table('locations')->where('id', $p->location_id)->value('name'), 'created_at' => (string) $p->created_at];
        })->values();

        return response()->json(['recipes' => $rows, 'runs' => $runs, 'branches' => DB::table('locations')->where('is_active', 1)->orderBy('name')->get(['id', 'name'])]);
    }

    /** Body: variant_id, yield_qty, deduct_on_sale?, note?, items[{variant_id, quantity}]. */
    public function save(Request $request): JsonResponse
    {
        $d = $request->validate([
            'variant_id' => 'required|integer|exists:product_variants,id', 'yield_qty' => 'required|numeric|min:0.0001', 'deduct_on_sale' => 'nullable|boolean', 'note' => 'nullable|string|max:255',
            'items' => 'required|array|min:1', 'items.*.variant_id' => 'required|integer|exists:product_variants,id', 'items.*.quantity' => 'required|numeric|min:0.0001',
        ]);

        return $this->guard(function () use ($d) {
            $r = $this->recipes->save((int) $d['variant_id'], (float) $d['yield_qty'], (bool) ($d['deduct_on_sale'] ?? false), $d['note'] ?? null, $d['items']);

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
            'items' => $r->items->map(fn ($i) => ['variant_id' => (int) $i->variant_id, 'name' => $this->variantName((int) $i->variant_id), 'quantity' => (float) $i->quantity])->values(),
        ];
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
