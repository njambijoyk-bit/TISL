<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Menus\Chef;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\PrepCount;
use App\Models\Menus\PrepLot;
use App\Models\Menus\PrepRun;
use App\Models\Menus\Serving;
use App\Models\Menus\Waste;
use App\Models\UnitOfMeasure;
use App\Services\Books\BooksException;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\MenuBranches;
use App\Services\Menus\MenusLists;
use App\Services\Menus\PrepCounts;
use App\Services\Menus\PrepReports;
use App\Services\Menus\PrepProduction;
use App\Services\Menus\WasteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Menus → Prepared food: batches made from recipes of their own, and the prepared stock they leave on the shelf. */
class MenusPreparedController extends Controller
{
    public function __construct(private PrepProduction $production, private PrepCounts $counts, private WasteService $waste, private PrepReports $reports, private \App\Services\Menus\PrepTimers $timers)
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
        $recipes = DishRecipe::standalone()->with('yieldUnit')->where(fn ($q) => $q->where('is_active', true)->orWhereIn('id', $lots->keys()))->orderBy('name')->get()->map(function (DishRecipe $r) use ($lots) {
            $mine = $lots->get($r->id, collect());

            return ['id' => (int) $r->id, 'name' => $r->name, 'active' => (bool) $r->is_active, 'unit_id' => $r->yield_unit_id ? (int) $r->yield_unit_id : null, 'unit' => $r->yieldUnit?->code ?? 'portions', 'yield_label' => $r->yieldLabel(),
                'on_shelf' => round((float) $mine->sum('qty_left'), 4), 'value' => round((float) $mine->sum(fn ($l) => (float) $l->qty_left * (float) $l->unit_cost), 2),
                'lots' => $mine->map(fn (PrepLot $l) => ['id' => (int) $l->id, 'lot_no' => $l->lot_no, 'made_on' => $l->made_on?->toDateString(), 'expiry_date' => $l->expiry_date?->toDateString(),
                    'qty_in' => (float) $l->qty_in, 'qty_left' => (float) $l->qty_left, 'unit_cost' => (float) $l->unit_cost, 'status' => $l->status])->values()];
        })->values();
        $runs = PrepRun::with(['recipe.yieldUnit', 'chef'])->where('location_id', $location)->orderByDesc('made_on')->orderByDesc('id')->limit(40)->get();
        $left = PrepLot::whereIn('id', $runs->pluck('lot_id')->filter())->pluck('qty_left', 'id');

        return response()->json([
            'ready' => true, 'location_id' => $location, 'branches' => $branches, 'recipes' => $recipes, 'timers_ready' => \App\Services\Menus\PrepTimers::installed(), 'timers' => $this->timers->running($location),
            'servings' => MenusLists::installed() ? Serving::where('is_active', true)->orderBy('sort_order')->orderBy('id')->get(['id', 'name'])->map(fn ($x) => ['id' => (int) $x->id, 'name' => $x->name])->values() : [],
            'waste_kinds' => Waste::KINDS, 'counts_ready' => PrepCounts::installed(), 'waste_ready' => \Illuminate\Support\Facades\Schema::hasColumn('menus_waste', 'recipe_id'),
            'counts' => PrepCounts::installed() ? PrepCount::with('lines')->where('location_id', $location)->orderByDesc('counted_on')->orderByDesc('id')->limit(15)->get()->map(fn (PrepCount $c) => [
                'id' => (int) $c->id, 'number' => $c->number, 'date' => $c->counted_on?->toDateString(), 'note' => $c->note, 'value_change' => (float) $c->value_change, 'recipes' => $c->lines->count(),
                'short' => $c->lines->where('variance', '<', 0)->count(), 'found' => $c->lines->where('variance', '>', 0)->count(),
            ])->values() : [],
            'chefs' => Chef::where('is_active', true)->orderBy('display_name')->get(['id', 'display_name'])->map(fn ($c) => ['id' => (int) $c->id, 'name' => $c->display_name])->values(),
            'runs' => $runs->map(fn (PrepRun $r) => [
                'id' => (int) $r->id, 'number' => $r->number, 'recipe' => $r->recipe?->title(), 'chef' => $r->chef?->display_name, 'date' => $r->made_on?->toDateString(), 'unit' => $r->recipe?->yieldUnit?->code ?? 'portions',
                'planned' => (float) $r->planned_qty, 'qty' => (float) $r->qty, 'expected_minutes' => $r->expected_minutes, 'actual_minutes' => $r->actualMinutes(), 'cost' => (float) $r->cost, 'unit_cost' => (float) $r->unit_cost,
                'servings' => $r->servingsLabel(), 'status' => $r->status, 'left' => (float) ($left[$r->lot_id] ?? 0), 'can_cancel' => $r->status === 'posted' && (float) ($left[$r->lot_id] ?? 0) + 0.00005 >= (float) $r->qty, 'note' => $r->note,
            ])->values(),
        ]);
    }

    /** Query: location_id, from?, to? (default today), daily? (one table per day, at most 31 days). Opening + made - served - waste +/- count = closing, per recipe. */
    public function reconciliation(Request $request): JsonResponse
    {
        $d = $request->validate(['location_id' => 'required|integer|exists:locations,id', 'from' => 'nullable|date', 'to' => 'nullable|date|after_or_equal:from', 'daily' => 'nullable|boolean']);
        $to = ! empty($d['to']) ? \Illuminate\Support\Carbon::parse($d['to'])->toDateString() : today()->toDateString();
        $from = ! empty($d['from']) ? \Illuminate\Support\Carbon::parse($d['from'])->toDateString() : $to;
        if (! PrepProduction::installed()) {
            return response()->json(['ready' => false, 'from' => $from, 'to' => $to, 'rows' => [], 'days' => []]);
        }
        $loc = (int) $d['location_id'];
        if ($request->boolean('daily')) {
            $days = collect(PrepReports::days($from, $to))->map(fn ($day) => ['date' => $day] + $this->reports->reconcile($loc, $day, $day))->values();

            return response()->json(['ready' => true, 'from' => $from, 'to' => $to, 'rows' => [], 'days' => $days]);
        }

        return response()->json(['ready' => true, 'days' => []] + $this->reports->reconcile($loc, $from, $to));
    }

    /** Query: location_id, from?, to? (default the last 30 days), recipe_id?. The batches of each recipe by the chef who made them. */
    public function chefs(Request $request): JsonResponse
    {
        $d = $request->validate(['location_id' => 'required|integer|exists:locations,id', 'from' => 'nullable|date', 'to' => 'nullable|date|after_or_equal:from', 'recipe_id' => 'nullable|integer']);
        $to = ! empty($d['to']) ? \Illuminate\Support\Carbon::parse($d['to'])->toDateString() : today()->toDateString();
        $from = ! empty($d['from']) ? \Illuminate\Support\Carbon::parse($d['from'])->toDateString() : \Illuminate\Support\Carbon::parse($to)->subDays(30)->toDateString();
        if (! PrepProduction::installed()) {
            return response()->json(['ready' => false, 'from' => $from, 'to' => $to, 'rows' => []]);
        }

        return response()->json(['ready' => true] + $this->reports->chefs((int) $d['location_id'], $from, $to, ! empty($d['recipe_id']) ? (int) $d['recipe_id'] : null));
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
            'date' => 'nullable|date', 'expiry_date' => 'nullable|date', 'chef_id' => 'nullable|integer', 'started_at' => 'nullable|date', 'finished_at' => 'nullable|date', 'timer_id' => 'nullable|integer',
            'servings' => 'nullable|array|max:20', 'servings.*.serving_id' => 'nullable|integer', 'servings.*.count' => 'nullable|numeric', 'inputs' => 'nullable|array|max:120', 'inputs.*.ingredient_id' => 'required|integer', 'inputs.*.qty' => 'nullable|numeric', 'note' => 'nullable|string|max:255', 'client_key' => 'nullable|string|max:60',
        ]);

        return $this->guard(function () use ($d, $request) {
            $r = DB::transaction(function () use ($d, $request) {
                $r = $this->production->run(DishRecipe::with('yieldUnit')->findOrFail($d['recipe_id']), (int) $d['location_id'], (float) $d['qty'], $d, $request->user());
                if (! empty($d['timer_id']) && \App\Services\Menus\PrepTimers::installed()) {   // the batch was made from a timer: the timer is done
                    $this->timers->finish((int) $d['timer_id'], $r);
                }

                return $r;
            });

            return response()->json(['message' => "Made. {$r->number} is on the shelf and the ingredients are used.", 'id' => $r->id, 'number' => $r->number, 'cost' => (float) $r->cost], 201);
        });
    }

    /** Body: recipe_id, location_id, qty (the batch size), minutes? (when the recipe has no time for it), chef_id?, note?, unit_id?. Start the clock on a batch. */
    public function startTimer(Request $request): JsonResponse
    {
        $d = $request->validate(['recipe_id' => 'required|integer', 'location_id' => 'required|integer|exists:locations,id', 'qty' => 'required|numeric|gt:0', 'minutes' => 'nullable|integer|min:1|max:6000',
            'chef_id' => 'nullable|integer', 'note' => 'nullable|string|max:120', 'unit_id' => 'nullable|integer']);

        return $this->guard(function () use ($d, $request) {
            $t = $this->timers->start(DishRecipe::with('yieldUnit')->findOrFail($d['recipe_id']), (int) $d['location_id'], (float) $d['qty'], $d, $request->user());

            return response()->json(['message' => "Timer started: ready at {$t->ready_at->format('H:i')}.", 'timers' => $this->timers->running((int) $d['location_id'])], 201);
        });
    }

    public function cancelTimer(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $t = $this->timers->cancel($id);

            return response()->json(['message' => 'Timer switched off.', 'timers' => $this->timers->running((int) $t->location_id)]);
        });
    }

    /** Body: recipe_id, location_id, quantity (in the recipe's unit), kind, lot_id?, note?, date?. Prepared food thrown away; it shows in the waste log with the rest. */
    public function waste(Request $request): JsonResponse
    {
        $d = $request->validate(['recipe_id' => 'required|integer', 'location_id' => 'required|integer|exists:locations,id', 'quantity' => 'required|numeric|gt:0', 'kind' => 'required|string|max:20',
            'lot_id' => 'nullable|integer', 'note' => 'nullable|string|max:200', 'date' => 'nullable|date']);

        return $this->guard(function () use ($d, $request) {
            $w = $this->waste->record(['recipe_id' => $d['recipe_id'], 'location_id' => $d['location_id'], 'quantity' => $d['quantity'], 'kind' => $d['kind'], 'batch_id' => $d['lot_id'] ?? null, 'note' => $d['note'] ?? null, 'date' => $d['date'] ?? null], $request->user());

            return response()->json(['message' => 'Written off. It is in the waste log.', 'id' => $w->id, 'cost' => (float) $w->cost], 201);
        });
    }

    /** Body: location_id, lines[{recipe_id, counted}] (only what was counted), date?, note?. */
    public function count(Request $request): JsonResponse
    {
        $d = $request->validate(['location_id' => 'required|integer|exists:locations,id', 'lines' => 'required|array|min:1|max:200', 'lines.*.recipe_id' => 'required|integer', 'lines.*.counted' => 'nullable|numeric',
            'date' => 'nullable|date', 'note' => 'nullable|string|max:255']);

        return $this->guard(function () use ($d, $request) {
            $c = $this->counts->record((int) $d['location_id'], $d['lines'], $d, $request->user());

            return response()->json(['message' => "Counted. {$c->number} is saved.".($c->journal_id ? ' The difference is booked.' : ''), 'id' => $c->id, 'number' => $c->number, 'value_change' => (float) $c->value_change], 201);
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
