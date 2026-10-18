<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Location;
use App\Models\Menus\Waste;
use App\Services\Books\BooksException;
use App\Services\Menus\PrepService;
use App\Services\Menus\ReorderService;
use App\Services\Menus\WasteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/** Menus → Operations: the prep list, the waste log and what to buy. */
class MenusOperationsController extends Controller
{
    public function __construct(private PrepService $prep, private ReorderService $reorder, private WasteService $waste)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function location(Request $r): int
    {
        $mine = $this->branches();

        return $r->integer('location_id') ?: (int) ($mine->firstWhere('id', Location::defaultSelling()?->id)?->id ?? $mine->firstWhere('id', Location::default()?->id)?->id ?? $mine->first()?->id);
    }

    private function branches(): \Illuminate\Support\Collection
    {
        return app(\App\Services\Menus\MenuBranches::class)->narrow(Location::query()->active())->ordered()->get(['id', 'name']);
    }

    /** Why packaging was left off, for a branch and a period (default: the last 30 days). */
    public function packaging(Request $request): JsonResponse
    {
        $d = $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date']);
        $loc = $this->location($request);
        $to = Carbon::parse($d['to'] ?? today()->toDateString())->toDateString();
        $from = Carbon::parse($d['from'] ?? today()->subDays(30)->toDateString())->toDateString();

        return response()->json(app(\App\Services\Menus\PackagingReport::class)->build($loc, min($from, $to), max($from, $to)) + ['location_id' => $loc, 'branches' => $this->branches()]);
    }

    public function prep(Request $request): JsonResponse
    {
        $d = $request->validate(['date' => 'nullable|date', 'weeks' => 'nullable|integer|min:1|max:12', 'buffer' => 'nullable|integer|min:0|max:100']);
        $loc = $this->location($request);
        $date = Carbon::parse($d['date'] ?? today()->addDay()->toDateString());

        return response()->json($this->prep->forecast($date, $loc, (int) ($d['weeks'] ?? 4), (int) ($d['buffer'] ?? 10)) + ['location_id' => $loc, 'branches' => $this->branches()]);
    }

    public function suggest(Request $request): JsonResponse
    {
        $d = $request->validate(['days' => 'nullable|integer|min:1|max:21']);
        $loc = $this->location($request);

        return response()->json(['rows' => $this->reorder->suggest($loc, (int) ($d['days'] ?? 7)), 'location_id' => $loc, 'branches' => $this->branches()]);
    }

    public function makeOrders(Request $request): JsonResponse
    {
        $d = $request->validate(['picks' => 'required|array|min:1|max:200', 'picks.*.item_id' => 'required|integer', 'picks.*.quantity' => 'required|numeric|min:0.0001', 'picks.*.unit' => 'nullable|in:pack,alt,base', 'picks.*.rate' => 'nullable|numeric|min:0']);

        return $this->guard(fn () => response()->json($this->reorder->makeOrders($this->location($request), $d['picks'], $request->user()), 201));
    }

    public function wasteIndex(Request $request): JsonResponse
    {
        $d = $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date']);
        $loc = $this->location($request);
        if (! WasteService::installed()) {
            return response()->json(['ready' => false, 'recent' => [], 'report' => null, 'kinds' => Waste::KINDS, 'branches' => $this->branches(), 'location_id' => $loc]);
        }
        $from = Carbon::parse($d['from'] ?? today()->subDays(29)->toDateString())->toDateString();
        $to = Carbon::parse($d['to'] ?? today()->toDateString())->toDateString();

        return response()->json(['ready' => true, 'recent' => $this->waste->recent($loc), 'report' => $this->waste->report($from, $to, $loc), 'kinds' => Waste::KINDS, 'branches' => $this->branches(), 'location_id' => $loc]);
    }

    public function wasteStore(Request $request): JsonResponse
    {
        $d = $request->validate(['item_id' => 'nullable|integer', 'dish_id' => 'nullable|integer', 'unit' => 'nullable|in:pack,alt,base', 'quantity' => 'required|numeric|min:0.0001', 'kind' => 'required|string|max:12', 'note' => 'nullable|string|max:200', 'date' => 'nullable|date']);

        return $this->guard(function () use ($d, $request) {
            abort_unless(WasteService::installed(), 422, 'Run database script 185_menus_operations_own.sql first.');
            $w = $this->waste->record($d + ['location_id' => $this->location($request)], $request->user());

            return response()->json(['message' => 'Recorded.', 'cost' => (float) $w->cost, 'id' => $w->id], 201);
        });
    }

    public function wasteVoid(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($id, $request) {
            $this->waste->void(Waste::findOrFail($id), $request->user());

            return response()->json(['message' => 'Taken back: the stock is returned.']);
        });
    }
}
