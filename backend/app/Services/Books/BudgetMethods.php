<?php

namespace App\Services\Books;

/**
 * The ways a budget row's months are filled, on the server: the same rules as the budget screen (frontend budgetMethods.js), used when a budget is made from a template.
 * Amounts are rounded to cents; a yearly figure that does not divide evenly puts the odd cents on the last month so the months add up to it.
 */
final class BudgetMethods
{
    /** Methods that can run with nothing but their own params and the months. */
    public const SELF_CONTAINED = ['fixed', 'annual', 'seasonal', 'quantity'];

    private static function cents(mixed $n): float
    {
        return round((float) $n, 2);
    }

    private static function num(mixed $v): float
    {
        return $v === '' || $v === null || ! is_numeric($v) ? 0.0 : (float) $v;
    }

    /** @param float[] $weights @return float[] pieces of $total in proportion to the weights, adding up to it exactly */
    public static function spread(mixed $total, array $weights): array
    {
        $sum = array_sum(array_map([self::class, 'num'], $weights));
        if (! $weights || $sum <= 0) {
            return array_map(fn () => 0.0, $weights);
        }
        $out = array_map(fn ($w) => self::cents(self::num($total) * self::num($w) / $sum), $weights);
        $last = count($out) - 1;
        $out[$last] = self::cents($out[$last] + self::cents(self::num($total) - array_sum($out)));

        return $out;
    }

    /**
     * @param  string[]  $months  'YYYY-MM' of the budget
     * @param  array<string, float>|null  $other  another row's months, for 'percent'
     * @param  array<string, float>|null  $history  last year's actuals keyed by this budget's months, for 'history'
     * @return array<string, float>|null null when the method cannot run (it needs another row or last year's figures, or is manual)
     */
    public static function fill(string $method, ?array $params, array $months, ?array $other = null, ?array $history = null): ?array
    {
        $p = $params ?? [];
        if ($method === 'fixed') {
            return array_fill_keys($months, self::cents($p['amount'] ?? 0));
        }
        if ($method === 'annual') {
            return array_combine($months, self::spread($p['total'] ?? 0, array_fill(0, count($months), 1)));
        }
        if ($method === 'seasonal') {
            $shares = array_map(fn ($ym) => self::num($p['shares'][substr($ym, 5)] ?? 100 / 12), $months);

            return array_combine($months, self::spread($p['total'] ?? 0, $shares));
        }
        if ($method === 'quantity') {
            return array_fill_keys($months, self::cents(self::num($p['quantity'] ?? 0) * self::num($p['rate'] ?? 0)));
        }
        if ($method === 'percent') {
            if ($other === null) {
                return null;
            }

            return array_combine($months, array_map(fn ($ym) => self::cents(self::num($other[$ym] ?? 0) * self::num($p['percent'] ?? 0) / 100), $months));
        }
        if ($method === 'history') {
            if ($history === null) {
                return null;
            }

            return array_combine($months, array_map(fn ($ym) => self::cents(self::num($history[$ym] ?? 0) * (1 + self::num($p['growth'] ?? 0) / 100)), $months));
        }

        return null;
    }
}
