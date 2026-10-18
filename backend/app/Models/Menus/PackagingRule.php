<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** What packaging goes with a side or a dish (script 208). */
class PackagingRule extends Model
{
    public const SCOPES = ['per_dish' => 'For each dish', 'per_order' => 'Once for the order'];

    public const RECEIPT = ['auto' => 'Shown when charged', 'always' => 'Always shown', 'never' => 'Never shown'];

    protected $table = 'menus_packaging_rules';

    protected $fillable = ['side_id', 'dish_id', 'item_id', 'scope', 'quantity', 'compulsory', 'charged', 'receipt'];

    protected $casts = ['quantity' => 'integer', 'compulsory' => 'boolean', 'charged' => 'boolean'];

    public function item(): BelongsTo
    {
        return $this->belongsTo(IngredientItem::class, 'item_id');
    }
}
