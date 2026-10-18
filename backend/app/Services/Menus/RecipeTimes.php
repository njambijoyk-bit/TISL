<?php

namespace App\Services\Menus;

use App\Models\Menus\DishRecipe;
use App\Models\UnitOfMeasure;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\Schema;

/** How long a batch of a recipe is expected to take, by its size: the smallest row that is big enough. A batch bigger than every row has no estimate. */
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
     * @return ?int null when the recipe has no times, or the batch is bigger than its biggest row
     */
    public function expected(DishRecipe $r, float $amount, ?UnitOfMeasure $in = null): ?int
    {
        if (! self::installed()) {
            return null;
        }
        if ($in && $r->yield_unit_id && (int) $in->id !== (int) $r->yield_unit_id) {
            $own = $r->yieldUnit;
            if (! $own || $own->dimension !== $in->dimension) {
                throw new BooksException("This recipe is counted in {$own?->name}: write the batch in that or in a unit that measures the same.");
            }
            $amount = $in->convertTo($own, $amount);
        }
        $row = $r->times()->where('up_to_qty', '>=', round($amount, 4))->orderBy('up_to_qty')->first();

        return $row?->minutes;
    }
}
