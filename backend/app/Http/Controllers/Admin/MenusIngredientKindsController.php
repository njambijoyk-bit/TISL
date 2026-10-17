<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Menus\IngredientKind;
use App\Services\Books\BooksException;
use App\Services\Menus\IngredientKinds;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Menus → Ingredients → Kinds: what an ingredient is for (cooked with, sold as it is, a free extra, packaging), and which kinds there are. */
class MenusIngredientKindsController extends Controller
{
    public function __construct(private IngredientKinds $kinds)
    {
    }

    public function index(): JsonResponse
    {
        if (! IngredientKinds::installed()) {
            return response()->json(['ready' => false, 'kinds' => [], 'uses' => IngredientKinds::uses(), 'ledgers_ready' => false]);
        }
        return response()->json(['ready' => true, 'ledgers_ready' => IngredientKinds::ledgered()] + $this->kinds->list());
    }

    /** Body: name, in_recipes?, sold_as_is?, free_extra?, packaging?, used_up?, expense_ledger_id (the account the cost is charged to when used). */
    public function store(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $k = $this->kinds->save($this->validated($request));

            return response()->json(['message' => "{$k->name} added.", 'id' => $k->id], 201);
        });
    }

    public function update(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $k = $this->kinds->save($this->validated($request), IngredientKind::findOrFail($id));

            return response()->json(['message' => "{$k->name} saved."]);
        });
    }

    public function destroy(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $this->kinds->delete(IngredientKind::findOrFail($id));

            return response()->json(['message' => 'Removed.']);
        });
    }

    /** Body: ids[] in the order to show them. */
    public function order(Request $request): JsonResponse
    {
        $d = $request->validate(['ids' => 'required|array|max:100', 'ids.*' => 'integer']);
        $this->kinds->reorder($d['ids']);

        return response()->json(['message' => 'Order saved.']);
    }

    private function validated(Request $request): array
    {
        return $request->validate(['name' => 'required|string|max:60', 'in_recipes' => 'nullable|boolean', 'sold_as_is' => 'nullable|boolean', 'free_extra' => 'nullable|boolean', 'packaging' => 'nullable|boolean', 'used_up' => 'nullable|boolean', 'expense_ledger_id' => 'nullable|integer']);
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
