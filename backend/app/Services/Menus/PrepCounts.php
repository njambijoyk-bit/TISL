<?php

namespace App\Services\Menus;

use App\Models\Menus\DishRecipe;
use App\Models\Menus\PrepCount;
use App\Models\Menus\PrepCountLine;
use App\Models\Menus\PrepLot;
use App\Models\Menus\PrepMove;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Counting the prepared food on the shelf. What is there is compared with what the batches say should be: a shortage comes off the oldest batches, a surplus goes on the shelf as a batch of
 * its own (costed at what the recipe's batches cost). One journal books the net: Dr Food Waste Expense, Cr Prepared Food Inventory for a loss, the other way round for a gain.
 */
class PrepCounts
{
    private const EPS = 0.00005;

    public function __construct(private IngredientUse $use)
    {
    }

    /** Has script 199 been run (and 198)? */
    public static function installed(): bool
    {
        return PrepProduction::installed() && Schema::hasTable('menus_prep_counts') && Schema::hasTable('menus_prep_count_lines');
    }

    /** What the batches say is on the shelf of a recipe at a branch. */
    public function expected(int $recipeId, int $locationId): float
    {
        return round((float) PrepLot::where('recipe_id', $recipeId)->where('location_id', $locationId)->where('qty_left', '>', 0)->sum('qty_left'), 4);
    }

    /**
     * @param array<int, array{recipe_id: int, counted: mixed}> $lines only the recipes that were counted; the amount is in the recipe's own unit (or portions)
     * @param array{date?: ?string, note?: ?string} $o
     */
    public function record(int $locationId, array $lines, array $o = [], ?User $by = null): PrepCount
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 199_menus_prepared_waste_counts.sql first.');
        }
        if (! DB::table('locations')->where('id', $locationId)->exists()) {
            throw new BooksException('Choose the branch you counted at.');
        }
        $on = ! empty($o['date']) ? Carbon::parse($o['date']) : today();
        if ($on->gt(today())) {
            throw new BooksException('That day has not come yet.');
        }
        $clean = [];
        foreach (array_values($lines) as $i => $l) {
            if (($l['counted'] ?? '') === '' || ($l['counted'] ?? null) === null) {
                continue;   // not counted
            }
            $recipe = DishRecipe::with('yieldUnit')->find((int) ($l['recipe_id'] ?? 0));
            if (! $recipe || $recipe->dish_id) {
                throw new BooksException('Row '.($i + 1).': choose a recipe of its own.');
            }
            $counted = round((float) $l['counted'], 4);
            if ($counted < 0) {
                throw new BooksException("{$recipe->title()}: the amount counted can not be less than nothing.");
            }
            if (isset($clean[$recipe->id])) {
                throw new BooksException("{$recipe->title()} is counted twice.");
            }
            $clean[$recipe->id] = [$recipe, $counted];
        }
        if (! $clean) {
            throw new BooksException('Enter what you counted for at least one recipe.');
        }

        return DB::transaction(function () use ($locationId, $clean, $o, $by, $on) {
            $count = PrepCount::create(['number' => 'TMP'.uniqid(), 'location_id' => $locationId, 'counted_on' => $on->toDateString(), 'note' => isset($o['note']) && trim((string) $o['note']) !== '' ? mb_substr(trim((string) $o['note']), 0, 255) : null, 'created_by' => $by?->id]);
            $count->update(['number' => 'PC-'.str_pad((string) $count->id, 6, '0', STR_PAD_LEFT)]);
            $net = 0.0;
            foreach ($clean as [$recipe, $counted]) {
                $lots = PrepLot::where('recipe_id', $recipe->id)->where('location_id', $locationId)->where('qty_left', '>', 0)->lockForUpdate()->get()
                    ->sortBy(fn (PrepLot $b) => [$b->expiry_date?->toDateString() ?? '9999-12-31', (int) $b->id])->values();
                $expected = round((float) $lots->sum('qty_left'), 4);
                $variance = round($counted - $expected, 4);
                $value = 0.0;
                if ($variance < -self::EPS) {
                    $left = -$variance;
                    foreach ($lots as $b) {
                        if ($left <= self::EPS) {
                            break;
                        }
                        $take = round(min((float) $b->qty_left, $left), 4);
                        PrepLot::whereKey($b->id)->update(['qty_left' => DB::raw('qty_left - '.number_format($take, 4, '.', ''))]);
                        $this->move($recipe, $locationId, $b->id, -$take, (float) $b->unit_cost, $count, $on, $by);
                        $value -= $take * (float) $b->unit_cost;
                        $left = round($left - $take, 4);
                    }
                } elseif ($variance > self::EPS) {
                    $unit = $this->unitCost($recipe, $locationId, $lots);
                    $lot = PrepLot::create(['recipe_id' => $recipe->id, 'location_id' => $locationId, 'run_id' => null, 'lot_no' => $count->number, 'made_on' => $on->toDateString(), 'expiry_date' => null,
                        'unit_cost' => $unit, 'qty_in' => $variance, 'qty_left' => $variance, 'status' => 'ok']);
                    $this->move($recipe, $locationId, $lot->id, $variance, $unit, $count, $on, $by);
                    $value += $variance * $unit;
                }
                $value = round($value, 2);
                $net += $value;
                PrepCountLine::create(['count_id' => $count->id, 'recipe_id' => $recipe->id, 'expected' => $expected, 'counted' => $counted, 'variance' => $variance, 'value_change' => $value]);
            }
            $net = round($net, 2);
            $journal = null;
            if (abs($net) >= 0.01) {
                $journal = $net < 0
                    ? $this->use->book(FoodLedgers::waste(), FoodLedgers::prepared(), -$net, "Count {$count->number}: prepared food short", $locationId, $on, $by)
                    : $this->use->book(FoodLedgers::prepared(), FoodLedgers::waste(), $net, "Count {$count->number}: prepared food found", $locationId, $on, $by);
            }
            $count->update(['value_change' => $net, 'journal_id' => $journal?->id]);

            return $count->fresh()->load('lines');
        });
    }

    /** What a unit found in a count is worth: what the recipe's batches on the shelf cost on average, else what the latest batch cost. */
    private function unitCost(DishRecipe $recipe, int $loc, $lots): float
    {
        $qty = (float) $lots->sum('qty_left');
        if ($qty > self::EPS) {
            return round((float) $lots->sum(fn ($b) => (float) $b->qty_left * (float) $b->unit_cost) / $qty, 6);
        }
        $last = PrepLot::where('recipe_id', $recipe->id)->where('location_id', $loc)->orderByDesc('made_on')->orderByDesc('id')->value('unit_cost');

        return $last === null ? 0.0 : round((float) $last, 6);
    }

    private function move(DishRecipe $recipe, int $loc, int $lotId, float $qty, float $unit, PrepCount $count, Carbon $on, ?User $by): void
    {
        PrepMove::create(['recipe_id' => $recipe->id, 'location_id' => $loc, 'lot_id' => $lotId, 'kind' => 'count', 'quantity' => $qty, 'unit_cost' => $unit, 'ref_type' => 'prep_count', 'ref_id' => $count->id,
            'note' => "Count {$count->number}", 'moved_on' => $on->toDateString(), 'created_by' => $by?->id]);
    }
}
