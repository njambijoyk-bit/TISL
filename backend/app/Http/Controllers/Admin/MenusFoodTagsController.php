<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Menus\FoodTag;
use App\Services\Books\BooksException;
use App\Services\Menus\FoodTagCatalog;
use App\Services\Menus\FoodTagService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Menus → Allergens: the allergens a dish can declare and the "what it is" tags, and which diet badges each one rules out. */
class MenusFoodTagsController extends Controller
{
    public function __construct(private FoodTagService $tags)
    {
    }

    public function index(): JsonResponse
    {
        if (! FoodTagCatalog::installed()) {
            return response()->json(['ready' => false, 'allergens' => [], 'tags' => [], 'diets' => \App\Services\Menus\DietBadges::LABELS, 'kinds' => FoodTag::KINDS]);
        }

        return response()->json(['ready' => true] + $this->tags->list());
    }

    /** Body: kind (allergen | tag), label, rules_out[]. */
    public function store(Request $request): JsonResponse
    {
        $d = $request->validate(['kind' => 'required|string|max:8', 'label' => 'required|string|max:60', 'rules_out' => 'nullable|array', 'rules_out.*' => 'string|max:20']);

        return $this->guard(function () use ($d) {
            $t = $this->tags->save($d);

            return response()->json(['message' => "{$t->label} added.", 'id' => $t->id], 201);
        });
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['label' => 'required|string|max:60', 'rules_out' => 'nullable|array', 'rules_out.*' => 'string|max:20']);

        return $this->guard(function () use ($d, $id) {
            $t = $this->tags->save($d, FoodTag::findOrFail($id));

            return response()->json(['message' => "{$t->label} saved."]);
        });
    }

    public function destroy(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $this->tags->delete(FoodTag::findOrFail($id));

            return response()->json(['message' => 'Removed.']);
        });
    }

    /** Body: kind, ids[] in the order to show them. */
    public function order(Request $request): JsonResponse
    {
        $d = $request->validate(['kind' => 'required|in:allergen,tag', 'ids' => 'required|array|max:200', 'ids.*' => 'integer']);
        $this->tags->reorder($d['kind'], $d['ids']);

        return response()->json(['message' => 'Order saved.']);
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
