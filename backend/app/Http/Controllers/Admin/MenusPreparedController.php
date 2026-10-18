<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Menus\Chef;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\PrepLot;
use App\Models\Menus\PrepRun;
use App\Models\UnitOfMeasure;
use App\Services\Books\BooksException;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\MenuBranches;
use App\Services\Menus\PrepProduction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Menus → Prepared food: batches made from recipes of their own, and the prepared stock they leave on the shelf. */
class MenusPreparedController extends Controller
{
    public function __construct(private PrepProduction $production)
    {
    }

    public function index(Request $request): JsonResponse
    {
        if (! PrepProduction::installed() || ! DishRecipes::has('name')) {
            return response()->json(['ready' => false, 'recipes' => [], 'runs' => [], 'chefs' => [], 'branches' => [], 'location_id' => null]);
        }
        $branches = app(MenuBranches::class)->narrow(DB::table('locations')->where('is_active', 1))->orderByDesc('is_default')->orderBy('name')->get(['id', 'name']);
        $location = $request->integer('location_id') ?: (int) ($branches->first()->id ?? 0);
        $lots = PrepLot::where('location_id', $location)->where('qty_left', '>', 0)->orderBy('expiry_date')->orderBy('made_on')->orderBy('id')->get()->groupBy('recipe_id');
        $recipes = DishRecipe::standalone()->with('yieldUnit')->where('is_active', true)->orderBy('name')->get()->map(function (DishRecipe $r) use ($lots) {
            $mine = $lots->get($r->id, collect());

            return ['id' => (int) $r->id, 'name' => $r->name, 'unit_id' => $r->yield_unit_id ? (int) $r->yield_unit_id : null, 'unit' => $r->yieldUnit?->code ?? 'portions', 'yield_label' => $r->yieldLabel(),
                'on_shelf' => round((float) $mine->sum('qty_left'), 4), 'value' => round((float) $mine->sum(fn ($l) => (float) $l->qty_left * (float) $l->unit_cost), 2),
                'lots' => $mine->map(fn (PrepLot $l) => ['id' => (int) $l->id, 'lot_no' => $l->lot_no, 'made_on' => $l->made_on?->toDateString(), 'expiry_date' => $l->expiry_date?->toDateString(),
                    'qty_in' => (float) $l->qty_in, 'qty_left' => (float) $l->qty_left, 'unit_cost' => (float) $l->unit_cost, 'status' => $l->status])->values()];
        })->values();
        $runs = PrepRun::with(['recipe.yieldUnit', 'chef'])->where('location_id', $location)->orderByDesc('made_on')->orderByDesc('id')->limit(40)->get();
        $left = PrepLot::whereIn('id', $runs->pluck('lot_id')->filter())->pluck('qty_left', 'id');

        return response()->json([
            'ready' => true, 'location_id' => $location, 'branches' => $branches, 'recipes' => $recipes,
            'chefs' => Chef::where('is_active', true)->orderBy('display_name')->get(['id', 'display_name'])->map(fn ($c) => ['id' => (int) $c->id, 'name' => $c->display_name])->values(),
            'runs' => $runs->map(fn (PrepRun $r) => [
                'id' => (int) $r->id, 'number' => $r->number, 'recipe' => $r->recipe?->title(), 'chef' => $r->chef?->display_name, 'date' => $r->made_on?->toDateString(), 'unit' => $r->recipe?->yieldUnit?->code ?? 'portions',
                'planned' => (float) $r->planned_qty, 'qty' => (float) $r->qty, 'expected_minutes' => $r->expected_minutes, 'actual_minutes' => $r->actualMinutes(), 'cost' => (float) $r->cost, 'unit_cost' => (float) $r->unit_cost,
                'status' => $r->status, 'left' => (float) ($left[$r->lot_id] ?? 0), 'can_cancel' => $r->status === 'posted' && (float) ($left[$r->lot_id] ?? 0) + 0.00005 >= (float) $r->qty, 'note' => $r->note,
            ])->values(),
        ]);
    }

    /** Query: recipe_id, location_id, qty, unit_id?. What a batch of that size would take and cost. */
    public function preview(Request $request): JsonResponse
    {
        $d = $request->validate(['recipe_id' => 'required|integer', 'location_id' => 'required|integer|exists:locations,id', 'qty' => 'required|numeric|gt:0', 'unit_id' => 'nullable|integer']);

        return $this->guard(fn () => response()->json($this->production->preview(DishRecipe::with('yieldUnit')->findOrFail($d['recipe_id']), (int) $d['location_id'], (float) $d['qty'], ! empty($d['unit_id']) ? UnitOfMeasure::find((int) $d['unit_id']) : null)));
    }

    /** Body: recipe_id, location_id, qty (the batch size), output_qty?, unit_id?, date?, expiry_date?, chef_id?, started_at?, finished_at?, inputs[{ingredient_id, qty}]?, note?, client_key?. */
    public function run(Request $request): JsonResponse
    {
        $d = $request->validate([
            'recipe_id' => 'required|integer', 'location_id' => 'required|integer|exists:locations,id', 'qty' => 'required|numeric|gt:0', 'output_qty' => 'nullable|numeric|min:0', 'unit_id' => 'nullable|integer',
            'date' => 'nullable|date', 'expiry_date' => 'nullable|date', 'chef_id' => 'nullable|integer', 'started_at' => 'nullable|date', 'finished_at' => 'nullable|date',
            'inputs' => 'nullable|array|max:120', 'inputs.*.ingredient_id' => 'required|integer', 'inputs.*.qty' => 'nullable|numeric', 'note' => 'nullable|string|max:255', 'client_key' => 'nullable|string|max:60',
        ]);

        return $this->guard(function () use ($d, $request) {
            $r = $this->production->run(DishRecipe::with('yieldUnit')->findOrFail($d['recipe_id']), (int) $d['location_id'], (float) $d['qty'], $d, $request->user());

            return response()->json(['message' => "Made. {$r->number} is on the shelf and the ingredients are used.", 'id' => $r->id, 'number' => $r->number, 'cost' => (float) $r->cost], 201);
        });
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['reason' => 'nullable|string|max:200']);

        return $this->guard(function () use ($request, $id, $d) {
            $this->production->cancel(PrepRun::findOrFail($id), $request->user(), $d['reason'] ?? null);

            return response()->json(['message' => 'Batch undone. The ingredients are back on the shelf.']);
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
