<?php

namespace App\Models;

use App\Models\Books\LedgerGroup;
use App\Traits\LogsTaxActivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A tax type is not a table of its own: it is a tax-behaviour group directly under
 * Duties & Taxes. Its code, mode (additive | withheld), compounding, active flag and
 * the ledgers that carry its opening balance are columns of that group.
 */
class TaxType extends LedgerGroup
{
    use LogsTaxActivity;

    public const MODE_ADDITIVE = 'additive'; // added on top of the price (VAT-style)
    public const MODE_WITHHELD = 'withheld'; // deducted from the amount paid out

    protected $appends = ['group_id'];

    protected static function booted(): void
    {
        static::addGlobalScope('tax_types', function (Builder $q) {
            $q->where('ledger_groups.behaviour', 'tax')
                ->whereIn('ledger_groups.parent_id', fn ($g) => $g->select('id')->from('ledger_groups as d')->where('d.name', 'Duties & Taxes'));
        });

        static::creating(function (self $t) {
            $duties = LedgerGroup::where('name', 'Duties & Taxes')->firstOrFail();
            $t->parent_id = $duties->id;
            $t->nature = $duties->nature;
            $t->behaviour = 'tax';
            $t->is_primary = false;
            $t->is_system = true;
            $t->affects_gross_profit = false;
            $t->sort_order = $t->sort_order ?: 50;
        });
    }

    /** The group is the tax type — kept for code that still asks for its group. */
    public function getGroupIdAttribute(): ?int
    {
        return $this->id;
    }

    public function rates(): HasMany
    {
        return $this->hasMany(TaxRate::class, 'group_id');
    }

    public function rules(): HasMany
    {
        return $this->hasMany(TaxRule::class, 'tax_type_id');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('ledger_groups.is_active', true);
    }

    public function scopeAdditive(Builder $query): Builder
    {
        return $query->where('ledger_groups.application_mode', self::MODE_ADDITIVE);
    }

    public function scopeWithheld(Builder $query): Builder
    {
        return $query->where('ledger_groups.application_mode', self::MODE_WITHHELD);
    }

    public function isAdditive(): bool
    {
        return $this->application_mode === self::MODE_ADDITIVE;
    }

    public function isWithheld(): bool
    {
        return $this->application_mode === self::MODE_WITHHELD;
    }

    public function isCompound(): bool
    {
        return (bool) $this->is_compound;
    }

    public static function findByCode(string $code): ?self
    {
        return static::where('code', $code)->first();
    }
}
