<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\Books\BooksException;
use App\Services\Menus\PackagingPrices;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Menus, Configuration, Packaging prices: the price of one unit of each packaging item. */
class MenusPackagingController extends Controller
{
    public function __construct(private PackagingPrices $prices)
    {
    }

    public function index(): JsonResponse
    {
        return response()->json($this->prices->all());
    }

    /** Body: prices[{item_id, price?, currency_id?, ledger_id?, is_active?}]. An empty price takes the item off the list. */
    public function save(Request $request): JsonResponse
    {
        $d = $request->validate(['prices' => 'present|array|max:500', 'prices.*.item_id' => 'required|integer', 'prices.*.price' => 'nullable|numeric|min:0', 'prices.*.currency_id' => 'nullable|integer', 'prices.*.ledger_id' => 'nullable|integer', 'prices.*.is_active' => 'nullable|boolean']);
        ksort($d['prices']);

        try {
            return response()->json(['message' => 'Packaging prices saved.'] + $this->prices->save($d['prices']));
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}
