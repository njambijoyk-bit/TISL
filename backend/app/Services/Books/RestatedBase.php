<?php

namespace App\Services\Books;

use App\Models\Books\Voucher;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Amounts in the BASE currency of today.
 *
 * A voucher keeps its own currency and the base figure it was posted with. When the base currency is changed, those stored
 * figures are in the OLD base, so adding them to new-base figures gives nonsense (KES 56,203 read as USD 56,203). These
 * fragments give each voucher's amount in today's base:
 *   - a voucher in today's base currency: its own amount;
 *   - another currency whose stored figure is within a factor of two of today's rate: the figure as posted (rates drift);
 *   - another currency whose stored figure is far from today's rate: it was made under another base, so its own amount × today's rate.
 * The decision is per voucher, so every line of a voucher is treated alike and it still balances.
 * Queries must join `currencies` as the alias given here — see join().
 */
class RestatedBase
{
    public static function join(Builder $q, string $v = 'v', string $cu = 'cu'): Builder
    {
        return $q->leftJoin("currencies as {$cu}", "{$cu}.id", '=', "{$v}.currency_id");
    }

    /** SQL: is the voucher's stored base figure still in today's base (and so trusted as posted)? */
    private static function trusted(string $v, string $cu): string
    {
        return "({$v}.total_amount > 0 AND {$v}.base_total > 0 AND {$cu}.conversion_rate > 0 AND {$v}.base_total / ({$v}.total_amount * {$cu}.conversion_rate) BETWEEN 0.5 AND 2)";
    }

    /** SQL: one entry's amount in today's base. */
    public static function entry(string $e = 'e', string $v = 'v', string $cu = 'cu'): string
    {
        $t = self::trusted($v, $cu);

        return "(CASE WHEN {$cu}.id IS NULL THEN {$e}.base_amount WHEN {$cu}.is_base = 1 THEN {$e}.amount WHEN {$t} THEN {$e}.base_amount "
            . "WHEN {$cu}.conversion_rate > 0 AND {$v}.total_amount > 0 THEN {$e}.amount * {$cu}.conversion_rate ELSE {$e}.base_amount END)";
    }

    /** SQL: a voucher's whole total in today's base. */
    public static function total(string $v = 'v', string $cu = 'cu'): string
    {
        $t = self::trusted($v, $cu);

        return "(CASE WHEN {$cu}.id IS NULL THEN {$v}.base_total WHEN {$cu}.is_base = 1 THEN {$v}.total_amount WHEN {$t} THEN {$v}.base_total "
            . "WHEN {$cu}.conversion_rate > 0 AND {$v}.total_amount > 0 THEN {$v}.total_amount * {$cu}.conversion_rate ELSE {$v}.base_total END)";
    }

    /** SQL: the rate that turns the voucher's own currency into today's base. */
    public static function rate(string $v = 'v', string $cu = 'cu'): string
    {
        $t = self::trusted($v, $cu);

        return "(CASE WHEN {$cu}.id IS NULL THEN COALESCE({$v}.exchange_rate, 1) WHEN {$cu}.is_base = 1 THEN 1 WHEN {$t} THEN COALESCE({$v}.exchange_rate, 1) "
            . "WHEN {$cu}.conversion_rate > 0 THEN {$cu}.conversion_rate ELSE COALESCE({$v}.exchange_rate, 1) END)";
    }

    /** PHP twin of entry(): [amount in today's base, was it restated?]. $cur is currencies keyed by id (is_base, conversion_rate). */
    public static function amount(float $amount, float $storedBase, $currencyId, array $cur, float $voucherTotal, float $voucherBase): array
    {
        $c = $currencyId !== null ? ($cur[$currencyId] ?? null) : null;
        if (! $c) {
            return [$storedBase, false];
        }
        if ((int) $c->is_base === 1) {
            return [$amount, abs($amount - $storedBase) > 0.01];
        }
        $rate = (float) $c->conversion_rate;
        if ($voucherTotal > 0 && $voucherBase > 0 && $rate > 0) {
            $ratio = $voucherBase / ($voucherTotal * $rate);
            if ($ratio >= 0.5 && $ratio <= 2.0) {
                return [$storedBase, false];
            }

            return [round($amount * $rate, 2), true];
        }

        return [$storedBase, false];
    }

    /** How many live vouchers are shown at today's rate instead of as posted — the reports say so when it is not nil. */
    public static function restatedCount(): int
    {
        $q = self::join(DB::table('vouchers as v'))->where('v.status', Voucher::POSTED)->whereNotNull('cu.id');
        $t = self::trusted('v', 'cu');

        return (int) $q->whereRaw("((cu.is_base = 1 AND ABS(v.base_total - v.total_amount) > 0.01) OR (cu.is_base = 0 AND NOT {$t} AND v.total_amount > 0 AND cu.conversion_rate > 0))")->count();
    }
}
