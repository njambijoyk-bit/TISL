<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Menus\Station;
use App\Models\Menus\Ticket;
use App\Services\Books\BooksException;
use App\Services\Menus\KitchenService;
use App\Services\Menus\StationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Menus → Kitchen: the stations, each station's screen, the pass (expo) and the chefs' buttons. */
class MenusKitchenController extends Controller
{
    public function __construct(private KitchenService $kitchen, private StationService $stations)
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

    public function stations(): JsonResponse
    {
        if (! KitchenService::installed()) {
            return response()->json(['ready' => false, 'stations' => [], 'branches' => []]);
        }

        return response()->json(['ready' => true, 'branches' => DB::table('locations')->where('is_active', 1)->orderBy('name')->get(['id', 'name']),
            'stations' => Station::orderBy('sort_order')->orderBy('name')->get()->map(fn (Station $s) => $s->toArray() + [
                'dishes' => DB::table('menus_dishes')->where('station_id', $s->id)->count(),
                'open_tickets' => Ticket::where('station_id', $s->id)->whereIn('status', ['new', 'started'])->count(),
            ])->values()]);
    }

    public function saveStation(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate(['name' => 'required|string|max:80', 'location_id' => 'nullable|integer', 'target_minutes' => 'nullable|integer|min:1|max:240', 'is_default' => 'nullable|boolean',
            'is_active' => 'nullable|boolean', 'sort_order' => 'nullable|integer|min:0|max:9999']);

        return $this->guard(function () use ($d, $id) {
            abort_unless(KitchenService::installed(), 422, 'Run database script 137_menus_kitchen.sql first.');
            $s = $this->stations->save($d, $id);

            return response()->json(['message' => 'Station saved.', 'station' => $s], $id === null ? 201 : 200);
        });
    }

    public function destroyStation(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $this->stations->delete(Station::findOrFail($id));

            return response()->json(['message' => 'Station removed.']);
        });
    }

    public function screen(int $id): JsonResponse
    {
        return response()->json($this->kitchen->screen(Station::findOrFail($id)));
    }

    public function expo(): JsonResponse
    {
        return response()->json($this->kitchen->expo());
    }

    public function ticket(Request $request, int $id, string $action): JsonResponse
    {
        $t = Ticket::findOrFail($id);

        return $this->guard(function () use ($t, $action) {
            $this->kitchen->{$action}($t);

            return response()->json(['message' => 'Done.']);
        });
    }
}
