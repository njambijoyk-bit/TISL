<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Location;
use App\Models\Menus\Area;
use App\Models\Menus\Table;
use App\Services\Books\BooksException;
use App\Services\Menus\FloorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Menus → Floor: the plan of the tables, who is at them, and the floor's set-up. */
class MenusFloorController extends Controller
{
    public function __construct(private FloorService $floor)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(FloorService::installed(), 422, 'Run database script 139_menus_floor.sql first.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function show(Request $request): JsonResponse
    {
        $branches = app(\App\Services\Menus\MenuBranches::class)->narrow(Location::query()->active())->ordered()->get(['id', 'name']);
        if (! FloorService::installed()) {
            return response()->json(['ready' => false, 'areas' => [], 'branches' => $branches, 'location_id' => null, 'resources' => []]);
        }
        $loc = $request->integer('location_id') ?: (int) ($branches->firstWhere('id', Location::defaultSelling()?->id)?->id ?? $branches->firstWhere('id', Location::default()?->id)?->id ?? $branches->first()?->id);

        return response()->json(['ready' => true, 'branches' => $branches, 'location_id' => $loc, 'now' => now()->toIso8601String()] + $this->floor->floor($loc) + [
            'resources' => DB::getSchemaBuilder()->hasTable('bookable_resources') ? DB::table('bookable_resources')->where('type', 'table')->where('is_active', 1)->orderBy('name')->get(['id', 'name']) : [],
            'all_areas' => Area::where('location_id', $loc)->orderBy('sort_order')->orderBy('name')->get(['id', 'name', 'is_active'])]);
    }

    public function saveArea(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate(['name' => 'required|string|max:60', 'location_id' => 'nullable|integer', 'sort_order' => 'nullable|integer|min:0|max:9999', 'is_active' => 'nullable|boolean']);

        return $this->guard(fn () => response()->json(['message' => 'Area saved.', 'area' => $this->floor->saveArea($d, $id)], $id === null ? 201 : 200));
    }

    public function deleteArea(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $this->floor->deleteArea(Area::findOrFail($id));

            return response()->json(['message' => 'Area removed.']);
        });
    }

    public function saveTable(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate(['name' => 'required|string|max:40', 'area_id' => 'required|integer', 'seats' => 'nullable|integer|min:1|max:60', 'shape' => 'nullable|string|in:square,round', 'x' => 'nullable|integer|min:0|max:60', 'y' => 'nullable|integer|min:0|max:60',
            'w' => 'nullable|integer|min:1|max:12', 'h' => 'nullable|integer|min:1|max:12', 'resource_id' => 'nullable|integer', 'sort_order' => 'nullable|integer|min:0|max:9999', 'is_active' => 'nullable|boolean']);

        return $this->guard(fn () => response()->json(['message' => 'Table saved.', 'table' => $this->floor->saveTable($d, $id)], $id === null ? 201 : 200));
    }

    public function deleteTable(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $this->floor->deleteTable(Table::findOrFail($id));

            return response()->json(['message' => 'Table removed.']);
        });
    }

    public function layout(Request $request): JsonResponse
    {
        $d = $request->validate(['places' => 'required|array|max:300', 'places.*.id' => 'required|integer', 'places.*.x' => 'required|integer|min:0|max:60', 'places.*.y' => 'required|integer|min:0|max:60', 'places.*.w' => 'nullable|integer|min:1|max:12', 'places.*.h' => 'nullable|integer|min:1|max:12']);

        return $this->guard(function () use ($d) {
            $this->floor->saveLayout($d['places']);

            return response()->json(['message' => 'Layout saved.']);
        });
    }

    public function qr(int $id)
    {
        abort_unless(FloorService::installed(), 404);

        return response($this->floor->qrSvg(Table::findOrFail($id)), 200, ['Content-Type' => 'image/svg+xml', 'Cache-Control' => 'no-store']);
    }

    public function act(Request $request, int $id, string $action): JsonResponse
    {
        if ($action === 'renew-qr' && ! app(\App\Services\Access\Authorizer::class)->allows($request->user(), 'menus.manage')) {
            return response()->json(['message' => 'Making a new QR code for a table needs the permission to manage Menus.'], 403);   // the till and floor are open to menus.till, this is not
        }
        $t = Table::findOrFail($id);
        $d = $request->validate(['guests' => 'nullable|integer|min:1|max:200', 'ids' => 'nullable|array|max:20', 'ids.*' => 'integer']);

        return $this->guard(function () use ($t, $action, $d) {
            $r = match ($action) {
                'seat' => $this->floor->seat($t, (int) ($d['guests'] ?? 0)),
                'clear' => $this->floor->clear($t),
                'bill' => $this->floor->askBill($t),
                'merge' => $this->floor->merge($t, (array) ($d['ids'] ?? [])),
                'unmerge' => $this->floor->unmerge($t),
                'renew-qr' => $this->floor->renewQr($t),
            };

            return response()->json(['table' => $this->floor->card($r)]);
        });
    }
}
