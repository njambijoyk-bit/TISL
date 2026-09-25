<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\Pivot;

/**
 * Pivot for product_variants <-> product_option_values, keyed per option.
 * Composite primary key (variant_id, option_id) with no timestamps -
 * Eloquent doesn't support composite PKs for save()/find(), so this is
 * used via ProductVariant::optionValues()->using() and written through
 * attach()/detach()/sync(), which build queries off the two FKs directly
 * rather than a primary key.
 */
class ProductVariantOption extends Pivot
{
    protected $table = 'product_variant_options';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'variant_id',
        'option_id',
        'option_value_id',
    ];
}
