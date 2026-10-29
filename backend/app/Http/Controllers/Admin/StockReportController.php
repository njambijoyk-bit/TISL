<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The item search the stock reports' pickers use. The reports themselves are on the report engine. Read-only. */
class StockReportController extends Controller
{
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
