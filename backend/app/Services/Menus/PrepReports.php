<?php

namespace App\Services\Menus;

use App\Models\Menus\DishRecipe;
use App\Models\Menus\PrepLot;
use App\Models\Menus\PrepMove;
use App\Models\Menus\PrepRun;
use Illuminate\Support\Carbon;

/**
 * Reports on prepared food, read from the batches and the movements on the shelf (nothing is stored for them).
 *   reconcile   for each recipe at a branch over some days: what was on the shelf at the start, what was made, served, thrown away, what a count found, and what is left; the closing figure is also
 *               compared with the shelf as it is now, so a difference is shown, never hidden. No approval step, no sign-off.
 *   chefs       the batches of each recipe by who made them: how long they took, what each unit cost in minutes, what came out against what was planned, how closely the recipe was followed
 *               and how many servings were cut from each kilogram.
 */
class PrepReports
{
    private const EPS = 0.00005;

    /**
     * @return array{from: string, to: string, rows: array<int, array<string, mixed>>}
     */
    public function reconcile(int $locationId, string $from, string $to): array
    {
        $moves = PrepMove::where('location_id', $locationId)->whereDate('moved_on', '<=', $to)->get();
        $recipes = DishRecipe::with('yieldUnit')->whereIn('id', $moves->pluck('recipe_id')->unique())->get()->keyBy('id');
        $rows = [];
        foreach ($moves->groupBy('recipe_id') as $recipeId => $all) {
            $before = $all->filter(fn ($m) => $m->moved_on->toDateString() < $from);
            $in = $all->filter(fn ($m) => $m->moved_on->toDateString() >= $from);
            $sum = fn ($set, array $kinds) => round((float) $set->whereIn('kind', $kinds)->sum('quantity'), 4);
            $value = fn ($set, array $kinds) => round((float) $set->whereIn('kind', $kinds)->sum(fn ($m) => (float) $m->quantity * (float) $m->unit_cost), 2);
            $opening = round((float) $before->sum('quantity'), 4);
            $made = $sum($in, ['production', 'production_reversal']);
            $served = -$sum($in, ['served', 'served_reversal']);
            $waste = -$sum($in, ['waste', 'waste_reversal']);
            $count = $sum($in, ['count']);
            $closing = round($opening + $made - $served - $waste + $count, 4);
            if (abs($opening) < self::EPS && $in->isEmpty()) {
                continue;
            }
            $r = $recipes[$recipeId] ?? null;
            $row = ['recipe_id' => (int) $recipeId, 'name' => $r?->title() ?? 'A recipe', 'unit' => $r?->yieldUnit?->code ?? 'portions', 'opening' => $opening, 'made' => $made, 'served' => round($served, 4),
                'waste' => round($waste, 4), 'count' => $count, 'closing' => $closing, 'made_value' => $value($in, ['production', 'production_reversal']), 'waste_value' => -$value($in, ['waste', 'waste_reversal']),
                'count_value' => $value($in, ['count']), 'shelf_now' => null, 'differs' => false];
            if ($to >= today()->toDateString()) {   // the closing figure should be what is on the shelf now
                $now = round((float) PrepLot::where('recipe_id', $recipeId)->where('location_id', $locationId)->sum('qty_left'), 4);
                $row['shelf_now'] = $now;
                $row['differs'] = abs($now - $closing) > 0.0001;
            }
            $rows[] = $row;
        }
        usort($rows, fn ($a, $b) => strcmp($a['name'], $b['name']));

        return ['from' => $from, 'to' => $to, 'rows' => $rows];
    }

    /**
     * @return array{from: string, to: string, rows: array<int, array<string, mixed>>}
     */
    public function chefs(int $locationId, string $from, string $to, ?int $recipeId = null): array
    {
        $runs = PrepRun::with(['recipe.yieldUnit', 'chef', 'inputs'])->where('status', 'posted')->where('location_id', $locationId)->whereDate('made_on', '>=', $from)->whereDate('made_on', '<=', $to)
            ->when($recipeId, fn ($q) => $q->where('recipe_id', $recipeId))->get();
        $rows = [];
        foreach ($runs->groupBy(fn (PrepRun $r) => $r->recipe_id.'|'.($r->chef_id ?? 0)) as $group) {
            /** @var \Illuminate\Support\Collection<int, PrepRun> $group */
            $first = $group->first();
            $timed = $group->filter(fn (PrepRun $r) => $r->actualMinutes() !== null && $r->actualMinutes() >= 0);
            $withExpected = $timed->filter(fn (PrepRun $r) => $r->expected_minutes !== null);
            $made = round((float) $group->sum('qty'), 4);
            $planned = (float) $group->sum('planned_qty');
            $timedMade = (float) $timed->sum('qty');
            $cut = $group->filter(fn (PrepRun $r) => $r->servings_cut);
            $cutMade = (float) $cut->sum('qty');
            $ratios = $group->map(function (PrepRun $r) {
                $in = $r->inputs->filter(fn ($i) => (float) $i->expected_qty > self::EPS);

                return $in->isEmpty() ? null : $in->avg(fn ($i) => (float) $i->used_qty / (float) $i->expected_qty);
            })->filter(fn ($x) => $x !== null);
            $rows[] = [
                'recipe_id' => (int) $first->recipe_id, 'recipe' => $first->recipe?->title() ?? 'A recipe', 'unit' => $first->recipe?->yieldUnit?->code ?? 'portions',
                'chef_id' => $first->chef_id ? (int) $first->chef_id : null, 'chef' => $first->chef?->display_name ?? 'Nobody named', 'batches' => $group->count(), 'made' => $made,
                'minutes_avg' => $timed->isEmpty() ? null : round((float) $timed->avg(fn (PrepRun $r) => $r->actualMinutes()), 1),
                'minutes_per_unit' => $timedMade > self::EPS ? round((float) $timed->sum(fn (PrepRun $r) => $r->actualMinutes()) / $timedMade, 2) : null,
                'expected_avg' => $withExpected->isEmpty() ? null : round((float) $withExpected->avg('expected_minutes'), 1),
                'over_minutes' => $withExpected->isEmpty() ? null : round((float) $withExpected->avg(fn (PrepRun $r) => $r->actualMinutes() - $r->expected_minutes), 1),
                'yield_pct' => $planned > self::EPS ? round($made / $planned * 100, 1) : null,
                'recipe_followed_pct' => $ratios->isEmpty() ? null : round((float) $ratios->avg() * 100, 1),
                'servings_per_unit' => $cutMade > self::EPS ? round((float) $cut->sum(fn (PrepRun $r) => array_sum(array_column((array) $r->servings_cut, 'count'))) / $cutMade, 2) : null,
                'cost_per_unit' => $made > self::EPS ? round((float) $group->sum('cost') / $made, 4) : null,
            ];
        }
        usort($rows, fn ($a, $b) => [$a['recipe'], $a['chef']] <=> [$b['recipe'], $b['chef']]);

        return ['from' => $from, 'to' => $to, 'rows' => $rows];
    }

    /** The days between two dates, oldest first, at most 31. @return string[] */
    public static function days(string $from, string $to): array
    {
        $out = [];
        for ($d = Carbon::parse($from); $d->lte(Carbon::parse($to)) && count($out) < 31; $d->addDay()) {
            $out[] = $d->toDateString();
        }

        return $out;
    }
}
