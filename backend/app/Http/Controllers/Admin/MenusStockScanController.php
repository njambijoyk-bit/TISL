<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\Codes\CodeException;
use App\Services\Menus\StockScan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Menus → scanning at the stock screens: what a scanned code is, and learning a supplier's barcode. */
class MenusStockScanController extends Controller
{
    public function __construct(private StockScan $scan)
    {
    }

    public function scan(Request $request): JsonResponse
    {
        $d = $request->validate(['code' => 'required|string|max:300']);

        return response()->json(['code' => trim($d['code'])] + $this->scan->scan(trim($d['code'])));
    }

    public function setCode(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['code' => 'required|string|max:64']);
        try {
            $this->scan->learn($id, trim($d['code']), $request->user()?->id);
        } catch (CodeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'The code is saved: scanning it finds this item now.'] + $this->scan->scan(trim($d['code'])));
    }
}
