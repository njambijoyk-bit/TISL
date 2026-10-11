<?php

namespace App\Models\Menus;

use App\Models\UnitOfMeasure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** "Wheat flour": what a recipe asks for. The kitchen takes it from the stock items (variants) listed under it. */
class IngredientFamily extends Model
{
    public const PICK_RULES = ['preferred' => 'The preferred one first', 'cheapest' => 'The cheapest first', 'first_expiring' => 'The one that expires first'];

    protected $table = 'menus_ingredient_families';

    protected $fillable = ['name', 'unit_id', 'pick_rule', 'allergens', 'tags', 'notes', 'is_active'];

    protected $casts = ['allergens' => 'array', 'tags' => 'array', 'is_active' => 'boolean'];

    public function unit(): BelongsTo
    {
        return $this->belongsTo(UnitOfMeasure::class, 'unit_id');
    }

    public function variants(): HasMany
    {
        return $this->hasMany(IngredientVariant::class, 'family_id')->orderBy('rank')->orderBy('id');
    }
}
