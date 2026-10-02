<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\Stock\StockReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Stock Summary, Location Summary, item monthly movement and the Stock Query card. Read-only. */
class StockReportController extends Controller
{
    public function __construct(private StockReportService $reports) {}

    private function filters(Request $r): array
    {
        return $r->validate(['from' => 'nullable|date', 'to' => 'nullable|date', 'location_id' => 'nullable|integer', 'item_type' => 'nullable|string|max:40', 'q' => 'nullable|string|max:80']);
    }

    public function summary(Request $request): JsonResponse
    {
        return response()->json($this->reports->summary($this->filters($request)));
    }

    public function monthly(Request $request): JsonResponse
    {
        $r = $request->validate(['item_type' => 'required|string|max:40', 'item_id' => 'required|integer'] + ['from' => 'nullable|date', 'to' => 'nullable|date', 'location_id' => 'nullable|integer']);

        return response()->json($this->reports->monthly($r['item_type'], (int) $r['item_id'], $r));
    }

    public function movements(Request $request): JsonResponse
    {
        $r = $request->validate(['item_type' => 'required|string|max:40', 'item_id' => 'required|integer'] + ['from' => 'nullable|date', 'to' => 'nullable|date', 'location_id' => 'nullable|integer']);

        return response()->json($this->reports->movements($r['item_type'], (int) $r['item_id'], $r));
    }

    public function query(Request $request): JsonResponse
    {
        $r = $request->validate(['item_type' => 'required|string|max:40', 'item_id' => 'required|integer', 'location_id' => 'nullable|integer']);

        return response()->json($this->reports->query($r['item_type'], (int) $r['item_id'], $r));
    }

    /** Find an item to open in the Stock Query: searches every kind of stocked item. */
    public function find(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $out = [];
        if (strlen($q) >= 2) {
            foreach (\App\Services\Stock\Items\StockItemRegistry::all() as $type => $src) {
                $ids = $src->search($q, 15);
                foreach ($src->describe($ids) as $id => $d) {
                    $out[] = ['item_type' => $type, 'item_id' => (int) $id, 'name' => $d['name'], 'sku' => $d['sku'], 'group' => $d['group'], 'kind' => $src->label()];
                }
            }
        }

        return response()->json(['rows' => array_slice($out, 0, 30), 'locations' => \Illuminate\Support\Facades\DB::table('locations')->where('is_active', 1)->orderBy('name')->get(['id', 'name'])->all()]);
    }
}
