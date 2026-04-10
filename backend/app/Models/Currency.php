<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class Currency extends Model
{
    protected $fillable = [
        'code',
        'name',
        'symbol',
        'conversion_rate', // derived (relative to base)
        'anchor_rate',     // constant-ish (relative to anchor like USD)
        'is_base',
        'is_active',
    ];

    protected $casts = [
        'conversion_rate' => 'decimal:8',
        'anchor_rate' => 'decimal:8',
        'is_base' => 'boolean',
        'is_active' => 'boolean',
    ];

    public static function getBaseCurrency()
    {
        return self::where('is_base', true)->first();
    }

    /**
     * Recalculate conversion_rate for all currencies based on a base currency.
     * conversion_rate = currency.anchor_rate / base.anchor_rate
     */
    public static function recalcRatesForBase(self $base): void
    {
        $baseAnchor = (float) $base->anchor_rate;

        if ($baseAnchor <= 0) {
            throw new \Exception("Base currency anchor_rate must be > 0");
        }

        $all = self::lockForUpdate()->get();

        foreach ($all as $cur) {
            $curAnchor = (float) $cur->anchor_rate;
            $cur->conversion_rate = $curAnchor / $baseAnchor;
            $cur->is_base = ($cur->id === $base->id);
            $cur->save();
        }
    }

    public static function setBaseCurrency($currencyId)
    {
        return DB::transaction(function () use ($currencyId) {
            $newBase = self::lockForUpdate()->findOrFail($currencyId);

            // Ensure base always has valid anchor_rate
            if ((float)$newBase->anchor_rate <= 0) {
                throw new \Exception("Selected base currency has invalid anchor_rate");
            }

            self::recalcRatesForBase($newBase);

            // Reload fresh base row
            return self::findOrFail($currencyId);
        });
    }

    /** Convert amount from this currency to another */
    public function convertTo(self $toCurrency, float $amount): float
    {
        $from = (float) $this->conversion_rate; // in base
        $to = (float) $toCurrency->conversion_rate; // in base

        if ($from <= 0) throw new \Exception("Invalid from conversion_rate");

        // amount(in this currency) -> base -> target currency
        $amountInBase = $amount * $from;
        return $amountInBase / $to;
    }

    public function formatAmount(float $amount): string
    {
        return $this->symbol . ' ' . number_format($amount, 2);
    }

    public static function rateToKes(string $currencyCode): float
{
    $kes = self::where('code', 'KES')->where('is_active', true)->first();
    if (!$kes || (float)$kes->anchor_rate <= 0) {
        throw new \Exception("KES currency missing or has invalid anchor_rate");
    }

    if ($currencyCode === 'KES') return 1.0;

    $cur = self::where('code', $currencyCode)->where('is_active', true)->first();
    if (!$cur || (float)$cur->anchor_rate <= 0) {
        throw new \Exception("Currency {$currencyCode} missing or has invalid anchor_rate");
    }

    // 1 unit of currency in KES
    return (float)$cur->anchor_rate / (float)$kes->anchor_rate;
}

}
