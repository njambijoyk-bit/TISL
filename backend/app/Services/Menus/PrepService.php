<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\IngredientFamily;
use App\Models\Recipe;
use App\Services\Books\BooksException;
use App\Services\Stock\BatchService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The prep list: what to make and what to have for a day. Each dish's expected sales are the average of the same weekday over the last weeks it was open (a little more as a buffer),
 * or what is already booked for that day if that is more. A dish made ahead needs making up to that number; the ingredients all of it needs are added up, compared with the shelf
 * and shown short where they do not reach.
 */
class PrepService
{
    public function __construct(private RecipeLines $lines, private IngredientResolver $resolver, private BatchService $batches)
    {
    }

    /**
     * @return array{date: string, weekday: string, weeks: int, buffer: int, dishes: array, ingredients: array, ready: bool}
     */
    public function forecast(Carbon $date, int $locationId, int $weeks = 4, int $buffer = 10): array
    {
        $weeks = max(1, min(12, $weeks));
        $buffer = max(0, min(100, $buffer));
        $sold = $this->average($date, $locationId, $weeks);
        $booked = $this->booked($date, $locationId);
        $dishes = [];
        $need = [];
        foreach (Dish::with('recipe.items')->where('is_active', true)->whereIn('id', array_unique(array_merge(array_keys($sold), array_keys($booked))))->orderBy('name')->get() as $d) {
            $avg = (float) ($sold[$d->id] ?? 0);
            $book = (float) ($booked[$d->id] ?? 0);
            $expect = (int) ceil(max($avg * (1 + $buffer / 100), $book));
            if ($expect <= 0) {
                continue;
            }
            $r = $d->recipe && $d->recipe->is_active ? $d->recipe : null;
            $ahead = $r && ! $r->deduct_on_sale;
            $shelf = $ahead ? round($this->batches->sellable((int) $d->variant_id, $locationId), 4) : null;
            $make = $ahead ? max(0.0, $expect - $shelf) : 0.0;
            $dishes[] = ['dish_id' => $d->id, 'name' => $d->name, 'average' => round($avg, 1), 'booked' => $book, 'expect' => $expect, 'mode' => ! $r ? 'no_recipe' : ($ahead ? 'ahead' : 'to_order'),
                'on_shelf' => $shelf, 'to_make' => $make, 'batches' => $ahead && $make > 0 ? (int) ceil($make / max(0.0001, (float) $r->yield_qty)) : null];
            if ($r) {
                $portions = $ahead ? $make : (float) $expect;   // made ahead: only what is still to be made uses ingredients; to order: all of it
                if ($portions > 0) {
                    $this->addDemand($need, $r, $portions / max(0.0001, (float) $r->yield_qty));
                }
            }
        }

        return ['date' => $date->toDateString(), 'weekday' => $date->format('l'), 'weeks' => $weeks, 'buffer' => $buffer, 'dishes' => $dishes, 'ingredients' => $this->shortfalls($need, $locationId), 'ready' => true];
    }

    /** Ingredient demand for a day, by key, for the reorder suggestions. @return array<string, array{family_id: ?int, variant_id: ?int, qty: float}> */
    public function demandFor(Carbon $date, int $locationId, int $weeks = 4, int $buffer = 10): array
    {
        $f = $this->forecast($date, $locationId, $weeks, $buffer);
        $out = [];
        foreach ($f['ingredients'] as $i) {
            $out[$i['key']] = ['family_id' => $i['family_id'], 'variant_id' => $i['variant_id'], 'qty' => $i['need']];
        }

        return $out;
    }

    /** @param array<string, array{family_id: ?int, variant_id: ?int, qty: float}> $need */
    private function addDemand(array &$need, Recipe $r, float $factor): void
    {
        try {
            foreach ($this->lines->demand($r, $factor) as $d) {
                $key = $d['family_id'] ? 'f'.$d['family_id'] : 'v'.$d['variant_id'];
                $need[$key] = ['family_id' => $d['family_id'], 'variant_id' => $d['variant_id'], 'qty' => round(($need[$key]['qty'] ?? 0) + $d['qty'], 4)];
            }
        } catch (BooksException) {
            // an ingredient of this recipe was removed: the recipe has to be fixed before it can be planned
        }
    }

    /** @param array<string, array{family_id: ?int, variant_id: ?int, qty: float}> $need @return array<int, array<string, mixed>> */
    private function shortfalls(array $need, int $loc): array
    {
        $families = IngredientFamily::with('unit')->whereIn('id', array_filter(array_column($need, 'family_id')))->get()->keyBy('id');
        $variants = DB::table('product_variants as v')->join('products as p', 'p.id', '=', 'v.product_id')->whereIn('v.id', array_filter(array_column($need, 'variant_id')))->get(['v.id', 'p.name', 'v.name as variant'])->keyBy('id');
        $out = [];
        foreach ($need as $key => $n) {
            if ($n['family_id']) {
                $f = $families[$n['family_id']] ?? null;
                if (! $f) {
                    continue;
                }
                $have = round($this->resolver->available($f, $loc), 4);
                $name = $f->name;
                $unit = $f->unit?->code ?? '';
            } else {
                $have = round($this->batches->sellable((int) $n['variant_id'], $loc), 4);
                $name = trim(($variants[$n['variant_id']]->name ?? 'item').' '.($variants[$n['variant_id']]->variant ?? ''));
                $unit = '';
            }
            $out[] = ['key' => $key, 'family_id' => $n['family_id'], 'variant_id' => $n['variant_id'], 'name' => $name, 'unit' => $unit, 'need' => round($n['qty'], 4), 'on_hand' => $have, 'short' => round(max(0.0, $n['qty'] - $have), 4)];
        }
        usort($out, fn ($a, $b) => [$b['short'] > 0, $a['name']] <=> [$a['short'] > 0, $b['name']]);

        return $out;
    }

    /** Average per dish on this weekday over the last weeks that the branch was open (had any order that weekday). @return array<int, float> dish id => portions */
    public function average(Carbon $date, int $locationId, int $weeks): array
    {
        if (! Schema::hasTable('menus_orders')) {
            return [];
        }
        $from = $date->copy()->subWeeks($weeks)->startOfDay();
        $rows = DB::table('menus_order_lines as l')->join('menus_orders as o', 'o.id', '=', 'l.order_id')->where('o.location_id', $locationId)->where('o.status', '!=', 'cancelled')->whereIn('o.payment', ['paid', 'later', 'open'])
            ->where('o.created_at', '>=', $from)->where('o.created_at', '<', $date->copy()->startOfDay())->get(['l.dish_id', 'l.quantity', 'o.created_at']);
        $days = [];
        $sum = [];
        foreach ($rows as $r) {
            $d = Carbon::parse($r->created_at);
            if ($d->dayOfWeek !== $date->dayOfWeek) {
                continue;
            }
            $days[$d->toDateString()] = true;
            $sum[$r->dish_id] = ($sum[$r->dish_id] ?? 0) + (float) $r->quantity;
        }
        $open = max(1, count($days));

        return array_map(fn ($q) => $q / $open, $sum);
    }

    /** What is already ordered for that day (not cancelled). @return array<int, float> dish id => portions */
    public function booked(Carbon $date, int $locationId): array
    {
        if (! Schema::hasTable('menus_orders')) {
            return [];
        }
        $rows = DB::table('menus_order_lines as l')->join('menus_orders as o', 'o.id', '=', 'l.order_id')->where('o.location_id', $locationId)->whereNotIn('o.status', ['cancelled', 'completed'])->whereNotIn('o.payment', ['failed'])
            ->whereBetween('o.fulfil_at', [$date->copy()->startOfDay(), $date->copy()->endOfDay()])->get(['l.dish_id', 'l.quantity']);
        $out = [];
        foreach ($rows as $r) {
            $out[$r->dish_id] = ($out[$r->dish_id] ?? 0) + (float) $r->quantity;
        }
        foreach ($this->jobs($date, $locationId) as $dish => $qty) {   // cakes and catering whose deposit is in
            $out[$dish] = ($out[$dish] ?? 0) + $qty;
        }

        return $out;
    }

    /** Dishes in cake and catering jobs that are booked (deposit paid) for that day and not yet ready. @return array<int, float> dish id => portions (script 143) */
    private function jobs(Carbon $date, int $locationId): array
    {
        if (! Schema::hasTable('menus_requests') || ! Schema::hasTable('menus_request_lines')) {
            return [];
        }
        $rows = DB::table('menus_request_lines as l')->join('menus_requests as r', 'r.id', '=', 'l.request_id')->where('r.location_id', $locationId)->whereIn('r.status', ['confirmed', 'preparing'])
            ->whereNotNull('l.dish_id')->whereBetween('r.event_at', [$date->copy()->startOfDay(), $date->copy()->endOfDay()])->get(['l.dish_id', 'l.quantity']);
        $out = [];
        foreach ($rows as $r) {
            $out[$r->dish_id] = ($out[$r->dish_id] ?? 0) + (float) $r->quantity;
        }

        return $out;
    }
}
