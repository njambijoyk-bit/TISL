<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\Books\BooksException;
use App\Services\Menus\PackagingPrices;
use App\Services\Menus\PackagingRules;
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

    /** The packaging rules of a side or a dish, and the items they can use. */
    public function rules(string $owner, int $id): JsonResponse
    {
        try {
            return response()->json(app(PackagingRules::class)->show($owner, $id));
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /** Body: rules[{item_id, scope, quantity, compulsory, charged, receipt}]. What is sent replaces the rules for items of the packaging kind. */
    public function saveRules(Request $request, string $owner, int $id): JsonResponse
    {
        $d = $request->validate(['rules' => 'present|array|max:60', 'rules.*.item_id' => 'required|integer', 'rules.*.scope' => 'nullable|string|max:9', 'rules.*.quantity' => 'nullable|integer', 'rules.*.compulsory' => 'nullable|boolean',
            'rules.*.charged' => 'nullable|boolean', 'rules.*.receipt' => 'nullable|string|max:6']);
        ksort($d['rules']);

        try {
            return response()->json(['message' => 'Packaging rules saved.'] + app(PackagingRules::class)->save($owner, $id, $d['rules']));
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
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
