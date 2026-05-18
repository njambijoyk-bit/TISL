<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HamperItem extends Model
{
    // hamper_items table has no created_at / updated_at columns
    public $timestamps = false;

    protected $fillable = [
        'hamper_id',
        'product_id',
        'quantity',
        'snapshot',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'snapshot' => 'array',
    ];

    // ── Relationships ─────────────────────────────────────────────────────────

    public function hamper(): BelongsTo
    {
        return $this->belongsTo(Hamper::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Build a frozen snapshot of a product at the time it is added to a hamper.
     */
    public static function buildSnapshot(Product $product): array
    {
        return [
            'id'          => $product->id,
            'name'        => $product->name,
            'sku'         => $product->sku,
            'price'       => $product->price,
            'brand_name'  => $product->brand?->name,
            'main_image'  => $product->main_image_url ?? $product->main_image,
            'description' => $product->short_description,
        ];
    }
}
