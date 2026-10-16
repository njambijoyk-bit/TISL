<?php

namespace App\Models\Menus;

use App\Services\Books\BooksException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A variant of an ingredient: "Exe 2 kg", "Pembe 24 kg". It uses the ingredient's units; its pack size (kept in the base unit) lets stock be counted in packs. */
class IngredientItem extends Model
{
    protected $table = 'menus_ingredient_items';

    protected $fillable = ['ingredient_id', 'name', 'code', 'pack_size', 'track_expiry', 'preference', 'is_allowed', 'is_active', 'reorder_level'];

    protected $casts = ['pack_size' => 'decimal:6', 'track_expiry' => 'boolean', 'preference' => 'integer', 'is_allowed' => 'boolean', 'is_active' => 'boolean', 'reorder_level' => 'decimal:4'];

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class, 'ingredient_id');
    }

    /** An amount typed in packs, the alternate unit or the base unit, in the base unit (stock is kept in it). */
    public function toBase(string $unit, float $qty): float
    {
        $ing = $this->ingredient;
        if ($unit === 'base') {
            return round($qty, 4);
        }
        if ($unit === 'alt') {
            if (! $ing->altUnit) {
                throw new BooksException("{$ing->name} has no alternate unit. Enter it in {$ing->baseUnit->code}, or give the ingredient an alternate unit first.");
            }

            return round($ing->altUnit->convertTo($ing->baseUnit, $qty), 4);
        }
        if ($unit === 'pack') {
            if (! $this->pack_size || (float) $this->pack_size <= 0) {
                throw new BooksException("{$this->name} has no pack size, so it can not be counted in packs. Give it one under Ingredients, or enter the quantity in {$ing->baseUnit->code}.");
            }

            return round($qty * (float) $this->pack_size, 4);
        }
        throw new BooksException('Enter the quantity in packs, in the alternate unit or in the base unit.');
    }

    /**
     * The ways an amount of this variant can be typed: packs (when it has a pack size), the bigger unit (when the ingredient has one) and the base unit.
     * `per` is how many base units one of it is.
     *
     * @return array<int, array{unit: string, label: string, per: float}>
     */
    public function unitChoices(): array
    {
        $this->loadMissing('ingredient.baseUnit', 'ingredient.altUnit');
        $ing = $this->ingredient;
        $out = [];
        if ($this->pack_size && (float) $this->pack_size > 0) {
            $out[] = ['unit' => 'pack', 'label' => 'pack', 'per' => (float) $this->pack_size];
        }
        if ($ing?->altUnit && $ing->baseUnit) {
            $out[] = ['unit' => 'alt', 'label' => (string) $ing->altUnit->code, 'per' => round($ing->altUnit->convertTo($ing->baseUnit, 1), 6)];
        }
        $out[] = ['unit' => 'base', 'label' => (string) ($ing?->baseUnit?->code ?? ''), 'per' => 1.0];

        return $out;
    }
}
