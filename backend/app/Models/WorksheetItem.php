<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WorksheetItem extends Model
{
    protected $fillable = [
        'worksheet_id',
        'source',
        'product_id',
        'name',
        'sku',
        'quantity',
        'unit_of_measure',
        'unit_price',
        'unit_price_kes',
        'line_total',
        'line_total_kes',
        'price_overridden',
        'original_price',
        'sort_order',
        'notes',
    ];

    protected $casts = [
        'quantity'        => 'decimal:2',
        'unit_price'      => 'decimal:2',
        'unit_price_kes'  => 'decimal:2',
        'line_total'      => 'decimal:2',
        'line_total_kes'  => 'decimal:2',
        'original_price'  => 'decimal:2',
        'price_overridden'=> 'boolean',
        'sort_order'      => 'integer',
    ];

    // ── Relationships ────────────────────────────────────────────────────────

    public function worksheet()
    {
        return $this->belongsTo(BookingWorksheet::class, 'worksheet_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    public function isFromSystem(): bool
    {
        return $this->source === 'system';
    }

    /**
     * Recalculate line_total and KES equivalents.
     * Call after quantity or unit_price changes.
     */
    public function recalcLines(?float $exchangeRate = null): void
    {
        $rate      = $exchangeRate ?? (float) ($this->worksheet?->exchange_rate_to_kes ?? 1.0);
        $lineTotal = round((float) $this->quantity * (float) $this->unit_price, 2);

        $this->update([
            'line_total'     => $lineTotal,
            'unit_price_kes' => round((float) $this->unit_price * $rate, 2),
            'line_total_kes' => round($lineTotal * $rate, 2),
        ]);
    }

    /**
     * Populate item from a system Product, snapshotting price.
     */
    public static function fromProduct(Product $product, float $qty = 1, ?float $overridePrice = null): array
    {
        $price = $overridePrice ?? (float) $product->price;

        return [
            'source'           => 'system',
            'product_id'       => $product->id,
            'name'             => $product->name,
            'sku'              => $product->sku,
            'quantity'         => $qty,
            'unit_of_measure'  => $product->unit_of_measure ?? 'each',
            'unit_price'       => $price,
            'price_overridden' => $overridePrice !== null,
            'original_price'   => $overridePrice !== null ? (float) $product->price : null,
        ];
    }
}