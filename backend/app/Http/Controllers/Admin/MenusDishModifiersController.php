<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Menus\Dish;
use App\Models\Menus\ModifierPolicy;
use App\Services\Books\BooksException;
use App\Services\Menus\DishModifiers;
use App\Services\Menus\MenusSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Menus → Dishes → Modifiers: what it costs to leave an ingredient out or ask for extra on a dish. */
class MenusDishModifiersController extends Controller
{
    public function __construct(private DishModifiers $modifiers)
    {
    }

    public function show(int $id): JsonResponse
    {
        $dish = Dish::findOrFail($id);
        if (! DishModifiers::installed()) {
            return response()->json(['ready' => false, 'dish_id' => $dish->id, 'name' => $dish->name, 'price' => (float) $dish->price, 'items' => [], 'policies' => [], 'vatable' => (bool) (MenusSettings::all()['modifier_fees_vatable'] ?? true)]);
        }

        return response()->json(['ready' => true, 'dish_id' => $dish->id, 'name' => $dish->name, 'price' => (float) $dish->price, 'items' => $this->modifiers->candidates($dish),
            'policies' => ModifierPolicy::where('is_active', true)->orderBy('sort_order')->orderBy('id')->get()->map(fn ($p) => ['id' => (int) $p->id, 'name' => $p->name, 'kind' => $p->kind, 'amount' => (float) $p->amount, 'is_default' => (bool) $p->is_default])->values(),
            'vatable' => (bool) (MenusSettings::all()['modifier_fees_vatable'] ?? true)]);
    }

    /** Body: items[{ingredient_id, kind, policy_id?}]. What is sent replaces what was there; no policy_id means the default one. */
    public function update(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['items' => 'present|array|max:200', 'items.*.ingredient_id' => 'required|integer', 'items.*.kind' => 'required|string|max:6', 'items.*.policy_id' => 'nullable|integer']);
        ksort($d['items']);

        try {
            $items = $this->modifiers->save(Dish::findOrFail($id), $d['items']);
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'Modifiers saved.', 'items' => $items]);
    }
}
