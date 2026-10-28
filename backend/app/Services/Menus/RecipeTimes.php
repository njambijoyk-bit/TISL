<?php

namespace App\Services\Menus;

use App\Models\Menus\DishRecipe;
use App\Models\UnitOfMeasure;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\Schema;

/**
 * How long a batch of a recipe is expected to take, by its size: the smallest row that is big enough. A batch bigger than every row has no estimate. A recipe with no rows at all uses its prep
 * and cook minutes for a batch of any size.
 */
class RecipeTimes
{
    public const MAX_ROWS = 12;

    private static ?bool $installed = null;

    /** Has script 196 been run? */
    public static function installed(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasTable('menus_recipe_times');
        }

        return self::$installed ??= Schema::hasTable('menus_recipe_times');
    }

    /**
     * Check and tidy the rows a person typed: each an amount and the minutes, smallest first, no amount twice.
     *
     * @param array<int, array{up_to?: mixed, minutes?: mixed}> $rows
     * @return array<int, array{up_to_qty: float, minutes: int}>
     */
    public static function clean(array $rows): array
    {
        $out = [];
        foreach (array_values($rows) as $i => $r) {
            $n = $i + 1;
            $empty = ($r['up_to'] ?? '') === '' && ($r['minutes'] ?? '') === '';
            if ($empty) {
                continue;
            }
            $qty = round((float) ($r['up_to'] ?? 0), 4);
            $min = (int) ($r['minutes'] ?? 0);
            if ($qty <= 0) {
                throw new BooksException("Time row {$n}: say how big a batch it is for (more than nothing).");
            }
            if ($min < 1 || $min > 6000) {
                throw new BooksException("Time row {$n}: the minutes must be between 1 and 6000.");
            }
            if (isset($out[(string) $qty])) {
                throw new BooksException('Two time rows are for the same batch size. Keep one.');
            }
            $out[(string) $qty] = ['up_to_qty' => $qty, 'minutes' => $min];
        }
        if (count($out) > self::MAX_ROWS) {
            throw new BooksException('Keep the times to '.self::MAX_ROWS.' rows or fewer.');
        }
        ksort($out, SORT_NUMERIC);

        return array_values($out);
    }

    /**
     * The minutes a batch of `$amount` is expected to take. `$in` is the unit the amount is written in when it is not the recipe's own (grams for a recipe counted in kilograms).
     *
     * @return ?int null when the recipe has no times at all (no rows, no prep or cook minutes)
     */
    public function expected(DishRecipe $r, float $amount, ?UnitOfMeasure $in = null): ?int
    {
        return $this->estimate($r, $amount, $in)['minutes'];
    }

    /**
     * The expected minutes with how they were worked out. A batch up to a row's size takes that row's minutes. A batch bigger than every row is worked out from the last rows: the minutes grow the
     * way they do between the two biggest rows (with one row, in proportion to its size), and never come out less than the biggest row. A recipe with no rows uses its prep and cook minutes.
     *
     * @return array{minutes: ?int, estimated: bool, basis: ?string}
     */
    public function estimate(DishRecipe $r, float $amount, ?UnitOfMeasure $in = null): array
    {
        $own = ((int) $r->prep_minutes) + ((int) $r->cook_minutes);   // a recipe with no times by size takes its prep and cook minutes, whatever the size
        if (! self::installed()) {
            return $own > 0 ? ['minutes' => $own, 'estimated' => false, 'basis' => null] : ['minutes' => null, 'estimated' => false, 'basis' => null];
        }
        if ($in && $r->yield_unit_id && (int) $in->id !== (int) $r->yield_unit_id) {
            $unit = $r->yieldUnit;
            if (! $unit || $unit->dimension !== $in->dimension) {
                throw new BooksException("This recipe is counted in {$unit?->name}: write the batch in that or in a unit that measures the same.");
            }
            $amount = $in->convertTo($unit, $amount);
        }
        $rows = $r->times()->orderBy('up_to_qty')->get();
        if ($rows->isEmpty()) {
            return ['minutes' => $own > 0 ? $own : null, 'estimated' => false, 'basis' => null];
        }
        $amount = round($amount, 4);
        $row = $rows->first(fn ($t) => (float) $t->up_to_qty >= $amount);
        if ($row) {
            return ['minutes' => (int) $row->minutes, 'estimated' => false, 'basis' => null];
        }
        $label = $r->yieldUnit?->code ?? 'portions';
        $n = fn ($v) => rtrim(rtrim(number_format((float) $v, 4, '.', ''), '0'), '.');
        $last = $rows->last();
        if ($rows->count() >= 2) {
            $prev = $rows[$rows->count() - 2];
            $slope = ((int) $last->minutes - (int) $prev->minutes) / max(0.0001, (float) $last->up_to_qty - (float) $prev->up_to_qty);
            $minutes = (int) $last->minutes + max(0.0, $slope) * ($amount - (float) $last->up_to_qty);
            $basis = "worked out from {$n($prev->up_to_qty)} {$label} ({$prev->minutes} min) and {$n($last->up_to_qty)} {$label} ({$last->minutes} min)";
        } else {
            $minutes = (int) $last->minutes * $amount / max(0.0001, (float) $last->up_to_qty);
            $basis = "worked out from {$n($last->up_to_qty)} {$label} ({$last->minutes} min)";
        }

        return ['minutes' => max((int) $last->minutes, (int) round($minutes)), 'estimated' => true, 'basis' => $basis];
    }
}
