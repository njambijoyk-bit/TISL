<?php

namespace App\Services\Menus;

use App\Models\Menus\Chef;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\IngredientItem;
use App\Models\Menus\PrepLot;
use App\Models\Menus\PrepMove;
use App\Models\Menus\PrepRun;
use App\Models\Menus\PrepRunInput;
use App\Models\Menus\Serving;
use App\Models\Menus\StockMove;
use App\Models\Menus\StockUse;
use App\Models\UnitOfMeasure;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Making a batch of a recipe of its own ahead of time (the ugali, the stew base): the ingredients are used up (what the chef really used, not only what the recipe says), what came out goes
 * on the shelf as prepared stock costed at what the ingredients cost, and the books move the value from the ingredient accounts to Prepared Food Inventory. A batch can be undone while
 * all of what it made is still there.
 */
class PrepProduction
{
    private const EPS = 0.00005;

    public function __construct(private IngredientUse $use, private RecipeTimes $times)
    {
    }

    /** Has script 198 been run? */
    public static function installed(): bool
    {
        foreach (['menus_prep_runs', 'menus_prep_run_inputs', 'menus_prep_lots', 'menus_prep_moves'] as $t) {
            if (! Schema::hasTable($t)) {
                return false;
            }
        }

        return true;
    }

    /**
     * What a batch of this size would take, cost and last: the ingredients the recipe says (the ones inside the recipes it uses worked out), what is on the shelf, and the expected minutes.
     *
     * @return array{planned: float, unit: string, expected_minutes: ?int, inputs: array<int, array<string, mixed>>, cost: ?float, complete: bool, short: bool}
     */
    public function preview(DishRecipe $r, int $locationId, float $planned, ?UnitOfMeasure $in = null): array
    {
        $this->check($r);
        $planned = $this->inRecipeUnit($r, $planned, $in);
        $inputs = [];
        $total = 0.0;
        $complete = true;
        $short = false;
        foreach ($this->use->needs($r, $planned) as $id => $row) {
            $ing = $row['ingredient'];
            $have = round((float) $this->use->usable($ing, $locationId)->sum('qty_left'), 4);
            $uc = $this->use->unitCost($ing, $locationId);
            $cost = $uc === null ? null : round($row['qty'] * $uc, 4);
            $complete = $complete && $cost !== null;
            $total += $cost ?? 0.0;
            $short = $short || $have + self::EPS < $row['qty'];
            $inputs[] = ['ingredient_id' => (int) $id, 'name' => $ing->name, 'unit' => $ing->baseUnit?->code, 'expected' => round($row['qty'], 4), 'on_hand' => $have, 'short' => round(max(0.0, $row['qty'] - $have), 4), 'unit_cost' => $uc, 'cost' => $cost];
        }
        usort($inputs, fn ($a, $b) => strcmp($a['name'], $b['name']));

        return ['planned' => $planned, 'unit' => $r->yieldUnit?->code ?? 'portions', 'expected_minutes' => $this->times->expected($r, $planned), 'inputs' => $inputs,
            'cost' => $inputs ? round($total, 2) : null, 'complete' => $complete && $inputs !== [], 'short' => $short];
    }

    /**
     * Make a batch.
     *
     * @param array{qty?: mixed, unit_id?: ?int, date?: ?string, expiry_date?: ?string, chef_id?: ?int, started_at?: ?string, finished_at?: ?string, note?: ?string, client_key?: ?string,
     *              servings?: array<int, array{serving_id: int, count: int}>, inputs?: array<int, array{ingredient_id: int, qty: mixed}>} $o `qty` is the batch size (in `unit_id`, else the recipe's own unit); `output_qty` what really came out (default: the batch size)
     */
    public function run(DishRecipe $recipe, int $locationId, float $planned, array $o = [], ?User $by = null): PrepRun
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 198_menus_prepared_food.sql first.');
        }
        if (! empty($o['client_key']) && ($again = PrepRun::where('client_key', (string) $o['client_key'])->first())) {
            return $again->load('inputs');   // the same press arrived twice: it is the same batch
        }
        $this->check($recipe);
        if (! DB::table('locations')->where('id', $locationId)->exists()) {
            throw new BooksException('Choose the branch the batch was made at.');
        }
        $in = ! empty($o['unit_id']) ? UnitOfMeasure::find((int) $o['unit_id']) : null;
        $planned = $this->inRecipeUnit($recipe, $planned, $in);
        $unitLabel = $recipe->yieldUnit?->name ?? 'portions';
        $gave = isset($o['output_qty']) && $o['output_qty'] !== '' && $o['output_qty'] !== null;
        if ($gave && (float) $o['output_qty'] <= 0) {
            throw new BooksException("Say how much came out of the batch (in {$unitLabel}).");
        }
        $output = $gave ? $this->inRecipeUnit($recipe, (float) $o['output_qty'], $in) : $planned;
        if (! empty($o['chef_id'])) {
            $chef = Chef::find((int) $o['chef_id']);
            if (! $chef || ! $chef->is_active) {
                throw new BooksException('Choose a chef who is on the kitchen list, or leave it empty.');
            }
        }
        $on = ! empty($o['date']) ? Carbon::parse($o['date']) : today();
        $expiry = ! empty($o['expiry_date']) ? Carbon::parse($o['expiry_date']) : null;
        if ($expiry && $expiry->lt($on)) {
            throw new BooksException('The use-by date is before the day the batch was made.');
        }
        $cut = $this->servingsCut((array) ($o['servings'] ?? []));
        $started = ! empty($o['started_at']) ? Carbon::parse($o['started_at']) : null;
        $finished = ! empty($o['finished_at']) ? Carbon::parse($o['finished_at']) : null;
        if ($started && $finished && $finished->lt($started)) {
            throw new BooksException('The batch finished before it started: check the two times.');
        }

        return DB::transaction(function () use ($recipe, $locationId, $planned, $output, $o, $by, $on, $expiry, $started, $finished, $cut) {
            $run = PrepRun::create(['number' => 'TMP'.uniqid(), 'recipe_id' => $recipe->id, 'location_id' => $locationId, 'chef_id' => $o['chef_id'] ?? null, 'status' => 'posted', 'planned_qty' => $planned, 'qty' => $output,
                'unit_id' => $recipe->yield_unit_id, 'expected_minutes' => $this->times->expected($recipe, $planned), 'started_at' => $started, 'finished_at' => $finished, 'client_key' => ($o['client_key'] ?? null) ?: null,
                'note' => isset($o['note']) && trim((string) $o['note']) !== '' ? mb_substr(trim((string) $o['note']), 0, 255) : null, 'made_on' => $on->toDateString(), 'created_by' => $by?->id] + ($cut !== null ? ['servings_cut' => $cut] : []));
            $run->update(['number' => 'PB-'.str_pad((string) $run->id, 6, '0', STR_PAD_LEFT)]);

            [$expected, $actual] = $this->inputsFor($recipe, $planned, (array) ($o['inputs'] ?? []));
            $res = $this->use->consume($recipe, $planned, $locationId, ['type' => 'prep_run', 'id' => $run->id], $by, ['date' => $on->toDateString(), 'post' => false, 'needs' => $actual]);
            $cost = $res['cost'];
            if ($cost > 0) {
                $journal = $this->use->bookKinds($res['by_kind'], 'prepared', "Batch {$run->number} of {$recipe->title()}", $locationId, $on, $by);
                StockUse::whereKey($res['use_id'])->update(['journal_id' => $journal->id]);
            }
            $this->writeInputs($run, $res['use_id'], $expected, $actual);
            $unit = round($cost / $output, 6);
            $lot = PrepLot::create(['recipe_id' => $recipe->id, 'location_id' => $locationId, 'run_id' => $run->id, 'lot_no' => $run->number, 'made_on' => $on->toDateString(), 'expiry_date' => $expiry?->toDateString(),
                'unit_cost' => $unit, 'qty_in' => $output, 'qty_left' => $output, 'status' => 'ok']);
            PrepMove::create(['recipe_id' => $recipe->id, 'location_id' => $locationId, 'lot_id' => $lot->id, 'kind' => 'production', 'quantity' => $output, 'unit_cost' => $unit, 'run_id' => $run->id,
                'ref_type' => 'prep_run', 'ref_id' => $run->id, 'moved_on' => $on->toDateString(), 'created_by' => $by?->id]);
            $run->update(['cost' => $cost, 'unit_cost' => $unit, 'lot_id' => $lot->id, 'use_id' => $res['use_id']]);

            return $run->fresh()->load('inputs');
        });
    }

    /** Undo a batch while all of what it made is still on the shelf: the ingredients come back and the journal is cancelled. */
    public function cancel(PrepRun $run, ?User $by = null, ?string $reason = null): PrepRun
    {
        if ($run->status !== 'posted') {
            throw new BooksException("{$run->number} is already {$run->status}.");
        }

        return DB::transaction(function () use ($run, $by, $reason) {
            $lot = PrepLot::whereKey($run->lot_id)->lockForUpdate()->first();
            if ($lot && (float) $lot->qty_left + self::EPS < (float) $lot->qty_in) {
                throw new BooksException("Some of what {$run->number} made has already been used, so it can not be undone.");
            }
            if ($lot) {
                PrepMove::create(['recipe_id' => $run->recipe_id, 'location_id' => $run->location_id, 'lot_id' => $lot->id, 'kind' => 'production_reversal', 'quantity' => -(float) $lot->qty_left,
                    'unit_cost' => $lot->unit_cost, 'run_id' => $run->id, 'ref_type' => 'prep_run', 'ref_id' => $run->id, 'note' => $reason ?: 'Batch undone', 'moved_on' => today()->toDateString(), 'created_by' => $by?->id]);
                $lot->update(['qty_left' => 0]);
            }
            $this->use->reverse('prep_run', (int) $run->id, $by, $reason ?: 'The batch was undone');
            $run->update(['status' => 'cancelled', 'cancelled_at' => now()]);

            return $run->fresh();
        });
    }

    /**
     * What a batch was cut into: [{serving_id, count}] checked against the servings list, kept with the serving's name as it was.
     *
     * @param array<int, array{serving_id?: mixed, count?: mixed}> $rows
     * @return ?array<int, array{serving_id: int, name: string, count: int}> null when nothing was noted
     */
    private function servingsCut(array $rows): ?array
    {
        $rows = array_values(array_filter($rows, fn ($r) => ! empty($r['serving_id']) || ! empty($r['count'])));
        if (! $rows) {
            return null;
        }
        if (! MenusLists::installed() || ! Schema::hasColumn('menus_prep_runs', 'servings_cut')) {
            throw new BooksException('Run database script 199_menus_prepared_waste_counts.sql (and 193) first: until then the servings a batch was cut into can not be kept.');
        }
        $out = [];
        $seen = [];
        foreach ($rows as $i => $r) {
            $n = $i + 1;
            $serving = Serving::find((int) ($r['serving_id'] ?? 0));
            if (! $serving || ! $serving->is_active) {
                throw new BooksException("Servings row {$n}: choose one of the servings on your list (Menus, Configuration).");
            }
            $count = (float) ($r['count'] ?? 0);
            if ($count < 1 || floor($count) !== $count) {
                throw new BooksException("Servings row {$n}: say how many {$serving->name} servings, as a whole number.");
            }
            if (isset($seen[$serving->id])) {
                throw new BooksException("{$serving->name} is listed twice: add the numbers together.");
            }
            $seen[$serving->id] = true;
            $out[] = ['serving_id' => (int) $serving->id, 'name' => $serving->name, 'count' => (int) $count];
        }

        return $out;
    }

    /** Only a recipe of its own, switched on, with something in it, is made in a batch here. */
    public function check(DishRecipe $r): void
    {
        if ($r->dish_id) {
            throw new BooksException("{$r->title()} is a dish's recipe. A dish made ahead is made from its Stock page; prepared food is made from a recipe of its own.");
        }
        if (! $r->is_active) {
            throw new BooksException("The recipe {$r->title()} is switched off.");
        }
    }

    /** A batch size written in some unit, as an amount in the recipe's own unit. */
    private function inRecipeUnit(DishRecipe $r, float $qty, ?UnitOfMeasure $in): float
    {
        $qty = round($qty, 4);
        if ($qty <= 0) {
            throw new BooksException('Say how big the batch is.');
        }
        $own = $r->yieldUnit;
        if ($in && ! $own) {
            throw new BooksException("{$r->title()} is counted in portions: write the batch in portions.");
        }
        if ($in && $own && (int) $in->id !== (int) $own->id) {
            if ($in->dimension !== $own->dimension) {
                throw new BooksException("{$r->title()} is counted in {$own->name}: write the batch in that or in a unit that measures the same.");
            }
            $qty = round($in->convertTo($own, $qty), 4);
        }

        return $qty;
    }

    /**
     * What the recipe says and what was used, per ingredient in its base unit. An ingredient left out of `$given` was used as the recipe says.
     *
     * @param array<int, array{ingredient_id: int, qty: mixed}> $given
     * @return array{0: array<int, array{ingredient: \App\Models\Menus\Ingredient, qty: float}>, 1: array<int, array{ingredient: \App\Models\Menus\Ingredient, qty: float}>} expected, used
     */
    private function inputsFor(DishRecipe $recipe, float $planned, array $given): array
    {
        $expected = $this->use->needs($recipe, $planned);
        $says = [];
        foreach ($given as $g) {
            $id = (int) ($g['ingredient_id'] ?? 0);
            if (! isset($expected[$id])) {
                $name = \App\Models\Menus\Ingredient::whereKey($id)->value('name') ?? 'That ingredient';
                throw new BooksException("{$name} is not in this recipe, so it can not be entered as used.");
            }
            $q = round((float) ($g['qty'] ?? 0), 4);
            if ($q < 0) {
                throw new BooksException("{$expected[$id]['ingredient']->name}: the amount used can not be less than nothing.");
            }
            $says[$id] = $q;
        }
        $actual = [];
        foreach ($expected as $id => $row) {
            $qty = $says[$id] ?? $row['qty'];
            if ($qty > self::EPS) {
                $actual[$id] = ['ingredient' => $row['ingredient'], 'qty' => $qty];
            }
        }

        return [$expected, $actual];
    }

    /** Keep what the recipe said and what was used for each ingredient, with what each cost. */
    private function writeInputs(PrepRun $run, int $useId, array $expected, array $actual): void
    {
        $moves = StockMove::where('use_id', $useId)->where('kind', 'use')->get();
        $ingredientOf = IngredientItem::whereIn('id', $moves->pluck('item_id')->unique())->pluck('ingredient_id', 'id');
        $cost = [];
        foreach ($moves as $m) {
            $ing = (int) ($ingredientOf[$m->item_id] ?? 0);
            $cost[$ing] = ($cost[$ing] ?? 0.0) + abs((float) $m->quantity) * (float) $m->unit_cost;
        }
        foreach ($expected as $id => $row) {
            PrepRunInput::create(['run_id' => $run->id, 'ingredient_id' => $id, 'expected_qty' => round($row['qty'], 4), 'used_qty' => round($actual[$id]['qty'] ?? 0, 4), 'cost' => round($cost[$id] ?? 0, 2)]);
        }
    }
}
