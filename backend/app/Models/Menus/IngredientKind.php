<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** What an ingredient is for: the kind says whether things of it go into recipes, are sold as they are, are given as free extras, or are packaging. Kept by the admin (Menus, Ingredients, Kinds). */
class IngredientKind extends Model
{
    /** The yes/no uses a kind has, with what each means. */
    public const USES = [
        'in_recipes' => 'Used in recipes',
        'sold_as_is' => 'Sold as it is',
        'free_extra' => 'Given free with a dish',
        'packaging' => 'Packaging for takeaway',
    ];

    /** The kind a new ingredient gets when none is chosen. */
    public const DEFAULT_CODE = 'cooking';

    protected $table = 'menus_ingredient_kinds';

    protected $fillable = ['code', 'name', 'in_recipes', 'sold_as_is', 'free_extra', 'packaging', 'sort_order'];

    protected $casts = ['in_recipes' => 'boolean', 'sold_as_is' => 'boolean', 'free_extra' => 'boolean', 'packaging' => 'boolean', 'sort_order' => 'integer'];

    public function ingredients(): HasMany
    {
        return $this->hasMany(Ingredient::class, 'kind_id');
    }
}
