<?php

namespace App\Services\Insight;

use App\Models\UnitOfMeasure;

/** Units from the units table: how many of the dimension's base unit each one is, and prices across them. */
class UnitMath
{
    /** Every active unit in the same dimension as $code, with its factor to the dimension's base unit. */
    public static function family(string $code): array
    {
        $u = UnitOfMeasure::where('code', $code)->first();
        if (! $u) {
            return [];
        }

        return UnitOfMeasure::where('dimension', $u->dimension)->where('is_active', true)->orderBy('to_base_factor')->get()
            ->map(fn ($x) => ['code' => $x->code, 'name' => $x->name, 'factor' => (float) $x->to_base_factor])->all();
    }

    /** The price per unit in every unit of the family, given a price per unit of $code. */
    public static function priceAcross(float $pricePerUnit, string $code): array
    {
        $fam = collect(self::family($code));
        $from = $fam->firstWhere('code', $code);
        if (! $from || $from['factor'] <= 0) {
            return [];
        }
        $perBase = $pricePerUnit / $from['factor'];

        return $fam->map(fn ($u) => ['code' => $u['code'], 'name' => $u['name'], 'factor' => $u['factor'], 'price' => round($perBase * $u['factor'], 4)])->all();
    }
}
