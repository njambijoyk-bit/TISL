<?php

namespace App\Models\Menus;

use App\Models\UnitOfMeasure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * "Wheat flour": the smallest thing Menus knows, with no product behind it. Stock is kept in its base unit (g); an alternate unit of the same kind (kg) is for buying
 * and counting. Its variants (Exe, Pembe, Soko) are what is bought and stocked; the kitchen takes from them by the pick rule.
 */
class Ingredient extends Model
{
    public const PICK_RULES = ['preferred' => 'The preferred one first', 'cheapest' => 'The cheapest first', 'first_expiring' => 'The one that expires first'];

    protected $table = 'menus_ingredients';

    protected $fillable = ['name', 'base_unit_id', 'alt_unit_id', 'pick_rule', 'allergens', 'tags', 'notes', 'is_active', 'purchase_ledger_id'];

    protected $casts = ['allergens' => 'array', 'tags' => 'array', 'is_active' => 'boolean'];

    public function baseUnit(): BelongsTo
    {
        return $this->belongsTo(UnitOfMeasure::class, 'base_unit_id');
    }

    public function altUnit(): BelongsTo
    {
        return $this->belongsTo(UnitOfMeasure::class, 'alt_unit_id');
    }

    /**
     * The account this ingredient is bought under: its own, else the one chosen in Menus, Configuration, else null (the books' default purchase account is used). Its tax setting decides the
     * VAT on a purchase; the stock itself is carried on Food Ingredients Inventory.
     */
    public function purchaseAccountId(): ?int
    {
        $own = $this->purchase_ledger_id ?? null;

        return $own ? (int) $own : (\App\Services\Menus\MenusSettings::all()['purchase_ledger_id'] ?? null);
    }

    public function variants(): HasMany
    {
        return $this->hasMany(IngredientItem::class, 'ingredient_id')->orderBy('preference')->orderBy('id');
    }

    /** An amount typed in the base or the alternate unit, in the base unit (stock is kept in it). */
    public function toBase(float $qty, string $unit = 'base'): float
    {
        if ($unit === 'alt') {
            $this->loadMissing('baseUnit', 'altUnit');
            if (! $this->altUnit) {
                throw new \App\Services\Books\BooksException("{$this->name} has no alternate unit.");
            }

            return round($this->altUnit->convertTo($this->baseUnit, $qty), 6);
        }

        return round($qty, 6);
    }
}
