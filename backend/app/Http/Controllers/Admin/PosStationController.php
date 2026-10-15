<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Pos\Station;
use App\Models\Access\AccessLog;
use App\Services\Books\BooksException;
use App\Services\Pos\StationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Point of sale → Stations: the tills and self-checkout screens of each branch, and the receipt paper each branch offers. */
class PosStationController extends Controller
{
    public function __construct(private StationService $stations)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(StationService::installed(), 422, 'Run database script 169_pos.sql first.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function index(): JsonResponse
    {
        if (! StationService::installed()) {
            return response()->json(['ready' => false, 'branches' => [], 'paper' => StationService::PAPER, 'kinds' => StationService::KINDS]);
        }

        return response()->json(['ready' => true, 'branches' => $this->stations->branches(), 'paper' => StationService::PAPER, 'kinds' => StationService::KINDS]);
    }

    public function save(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate(['name' => 'required|string|max:80', 'location_id' => 'required|integer', 'kind' => 'nullable|string|max:20', 'code' => 'nullable|string|max:20',
            'paper' => 'nullable|string|max:10', 'is_default' => 'nullable|boolean', 'is_active' => 'nullable|boolean']);

        return $this->guard(function () use ($d, $id, $request) {
            $s = $this->stations->save($d, $id ? Station::findOrFail($id) : null);
            AccessLog::record($request->user()->id, null, $id ? 'pos_station_changed' : 'pos_station_made', ['station' => $s->id, 'name' => $s->name, 'location_id' => $s->location_id]);

            return response()->json(['message' => 'Station saved.', 'station' => $s], $id === null ? 201 : 200);
        });
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($id, $request) {
            $s = Station::findOrFail($id);
            $this->stations->delete($s);
            AccessLog::record($request->user()->id, null, 'pos_station_removed', ['station' => $id, 'name' => $s->name]);

            return response()->json(['message' => 'Station removed.']);
        });
    }

    /** A new secret address for a self-checkout screen. Shown once; the old address stops working. */
    public function token(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $s = Station::findOrFail($id);
            $t = $this->stations->issueToken($s);
            AccessLog::record($request->user()->id, null, 'pos_station_address_made', ['station' => $s->id, 'name' => $s->name]);

            return ['message' => 'Open this address on the screen. It is shown once.', 'url' => $t['url']];
        });
    }

    public function saveBranch(Request $request, int $locationId): JsonResponse
    {
        $d = $request->validate(['paper_default' => 'nullable|string|max:10', 'paper_allowed' => 'nullable|array', 'paper_allowed.*' => 'string|max:10', 'require_shift' => 'nullable|boolean']);

        return $this->guard(fn () => response()->json(['message' => 'Branch receipt settings saved.', 'branch' => $this->stations->saveBranch($locationId, $d)]));
    }
}
