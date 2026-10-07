<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A hamper's or auction's own brochure choices (a product keeps its in products.brochure_meta). */
class BrochureItemMeta extends Model
{
    protected $table = 'brochure_item_meta';

    protected $fillable = ['item_type', 'item_id', 'meta'];

    protected $casts = ['meta' => 'array'];
}
