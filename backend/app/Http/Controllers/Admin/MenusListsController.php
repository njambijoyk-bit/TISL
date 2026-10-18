<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\Books\BooksException;
use App\Services\Menus\MenusLists;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Menus → Configuration: the servings, audiences and modifier policies the restaurant keeps. */
class MenusListsController extends Controller
{
    public function __construct(private MenusLists $lists)
    {
    }

    public function index(): JsonResponse
    {
        if (! MenusLists::installed()) {
            return response()->json(['ready' => false, 'servings' => [], 'audiences' => [], 'policies' => [], 'policy_kinds' => MenusLists::POLICY_KINDS]);
        }

        return response()->json(['ready' => true] + $this->lists->all());
    }

    /** Body: name, is_active?; for policies also kind (free | fixed | percent), amount, is_default. */
    public function save(Request $request, string $type, ?int $id = null): JsonResponse
    {
        $d = $request->validate(['name' => 'required|string|max:60', 'is_active' => 'nullable|boolean', 'kind' => 'nullable|string|max:8', 'amount' => 'nullable|numeric|min:0', 'is_default' => 'nullable|boolean']);

        return $this->guard(function () use ($type, $d, $id) {
            $row = $this->lists->save($type, $d, $id);

            return response()->json(['message' => "{$row->name} saved.", 'id' => $row->id], $id === null ? 201 : 200);
        });
    }

    public function destroy(string $type, int $id): JsonResponse
    {
        return $this->guard(function () use ($type, $id) {
            $this->lists->delete($type, $id);

            return response()->json(['message' => 'Removed.']);
        });
    }

    /** Body: ids[] in the order to show them. */
    public function order(Request $request, string $type): JsonResponse
    {
        $d = $request->validate(['ids' => 'required|array|max:200', 'ids.*' => 'integer']);

        return $this->guard(function () use ($type, $d) {
            $this->lists->reorder($type, $d['ids']);

            return response()->json(['message' => 'Order saved.']);
        });
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
