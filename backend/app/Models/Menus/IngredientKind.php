<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** What an ingredient is for: the kind says whether things of it go into recipes, are sold as they are, are given as free extras, are packaging, or are used up by the kitchen (gloves), and which account its cost is charged to when used. Kept by the admin (Menus, Ingredients, Kinds). */
class IngredientKind extends Model
{
    /** The yes/no uses a kind has, with what each means. */
    public const USES = [
        'in_recipes' => 'Used in recipes',
        'sold_as_is' => 'Sold as it is',
        'free_extra' => 'Given free with a dish',
        'packaging' => 'Packaging for takeaway',
        'used_up' => 'Used up by the kitchen',
    ];

    /** The kind a new ingredient gets when none is chosen. */
    public const DEFAULT_CODE = 'cooking';

    protected $table = 'menus_ingredient_kinds';

    protected $fillable = ['code', 'name', 'in_recipes', 'sold_as_is', 'free_extra', 'packaging', 'used_up', 'expense_ledger_id', 'stock_ledger_id', 'sort_order'];

    protected $casts = ['in_recipes' => 'boolean', 'sold_as_is' => 'boolean', 'free_extra' => 'boolean', 'packaging' => 'boolean', 'used_up' => 'boolean', 'sort_order' => 'integer'];

    /** The account the cost is charged to when stock of this kind is used (empty until script 191). */
    public function expenseLedger(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Books\Ledger::class, 'expense_ledger_id');
    }

    /** The account the stock is carried on while it is on the shelf (empty until script 192). */
    public function stockLedger(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Books\Ledger::class, 'stock_ledger_id');
    }

    /** Used up on purpose rather than sold or cooked (supplies, packaging): a count that finds less is the using, not a loss. */
    public function consumable(): bool
    {
        return (bool) ($this->used_up || $this->packaging);
    }

    public function ingredients(): HasMany
    {
        return $this->hasMany(Ingredient::class, 'kind_id');
    }
}
