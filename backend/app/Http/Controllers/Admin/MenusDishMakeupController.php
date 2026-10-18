<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Menus\Audience;
use App\Models\Menus\Dish;
use App\Models\Menus\DishSlot;
use App\Models\Menus\Serving;
use App\Models\Menus\Side;
use App\Services\Books\BooksException;
use App\Services\Menus\DishMakeup;
use App\Services\Menus\DishSlotsFromSides;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Menus → Dishes → Make-up: the sizes a dish is sold in and their prices, who it is for, and the slots filled with sides. */
class MenusDishMakeupController extends Controller
{
    public function __construct(private DishMakeup $makeup, private DishSlotsFromSides $fromSides)
    {
    }

    public function show(int $id): JsonResponse
    {
        $dish = Dish::findOrFail($id);
        if (! DishMakeup::installed()) {
            return response()->json(['ready' => false, 'dish_id' => $dish->id, 'name' => $dish->name, 'price' => (float) $dish->price, 'servings' => [], 'audience_ids' => [], 'slots' => [], 'sides' => [], 'serving_list' => [], 'audience_list' => [], 'kinds' => DishSlot::KINDS]);
        }

        return response()->json(['ready' => true, 'name' => $dish->name] + $this->makeup->show($dish) + [
            'sides' => Side::where('is_active', true)->orderBy('sort_order')->orderBy('name')->get(['id', 'name'])->map(fn ($s) => ['id' => (int) $s->id, 'name' => $s->name])->values(),
            'serving_list' => Serving::where('is_active', true)->orderBy('sort_order')->orderBy('id')->get(['id', 'name'])->map(fn ($s) => ['id' => (int) $s->id, 'name' => $s->name])->values(),
            'audience_list' => Audience::where('is_active', true)->orderBy('sort_order')->orderBy('id')->get(['id', 'name'])->map(fn ($s) => ['id' => (int) $s->id, 'name' => $s->name])->values(),
            'kinds' => DishSlot::KINDS,
        ]);
    }

    /** Body: servings[{serving_id, price}], audience_ids[], slots[{name, kind, min?, max?, choices[{side_id, upcharge?, is_default?}]}]. Each part sent replaces what was there. */
    public function update(Request $request, int $id): JsonResponse
    {
        $d = $request->validate([
            'servings' => 'nullable|array|max:40', 'servings.*.serving_id' => 'required|integer', 'servings.*.price' => 'nullable|numeric',
            'audience_ids' => 'nullable|array|max:40', 'audience_ids.*' => 'integer',
            'slots' => 'nullable|array|max:'.DishMakeup::MAX_SLOTS, 'slots.*.name' => 'nullable|string|max:60', 'slots.*.kind' => 'nullable|string|max:12', 'slots.*.min' => 'nullable|integer', 'slots.*.max' => 'nullable|integer',
            'slots.*.choices' => 'nullable|array|max:'.DishMakeup::MAX_CHOICES, 'slots.*.choices.*.side_id' => 'nullable|integer', 'slots.*.choices.*.upcharge' => 'nullable|numeric', 'slots.*.choices.*.is_default' => 'nullable|boolean',
        ]);
        foreach (['servings', 'slots'] as $key) {   // the validator hands rows back in rule order: keep the order they were sent in
            if (isset($d[$key])) {
                ksort($d[$key]);
            }
        }
        foreach (array_keys($d['slots'] ?? []) as $i) {
            if (isset($d['slots'][$i]['choices'])) {
                ksort($d['slots'][$i]['choices']);
            }
        }

        try {
            $made = $this->makeup->save(Dish::findOrFail($id), $d);
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'Saved.', 'makeup' => $made]);
    }

    /** What building make-ups from the sides and the set meals would do now (nothing is changed). */
    public function buildPreview(): JsonResponse
    {
        return response()->json($this->fromSides->preview());
    }

    /** Give each dish with a side its own slot and turn set-meal groups of choices into slots; the old groups are kept and marked as replaced. */
    public function buildRun(): JsonResponse
    {
        try {
            $r = $this->fromSides->run();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        $says = [];
        $r['own'] && $says[] = $r['own'].' dish'.($r['own'] === 1 ? '' : 'es').' given a slot of their own side';
        $r['groups'] && $says[] = $r['groups'].' set-meal group'.($r['groups'] === 1 ? '' : 's').' turned into slots';
        $r['skipped'] && $says[] = $r['skipped'].' left as they are';

        return response()->json(['message' => $says ? 'Done: '.implode(', ', $says).'.' : 'Nothing to do: every dish already has what it can be given.'] + $r);
    }
}
