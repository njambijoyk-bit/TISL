<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** "Choose a side", "Size", "Extras": a set of choices on one dish. */
class OptionGroup extends Model
{
    public const KINDS = ['single' => 'Pick one', 'multiple' => 'Pick several'];

    protected $table = 'menus_option_groups';

    protected $fillable = ['dish_id', 'name', 'kind', 'min_choices', 'max_choices', 'sort_order'];

    protected $casts = ['min_choices' => 'integer', 'max_choices' => 'integer', 'sort_order' => 'integer'];

    /** Has script 204 been run: can a group be marked as replaced by a slot? */
    public static function hasSlotColumn(): bool
    {
        return \Illuminate\Support\Facades\Schema::hasColumn('menus_option_groups', 'slot_id');
    }

    /** The groups still offered when ordering: not replaced by a slot. */
    public function scopeOffered($q)
    {
        return self::hasSlotColumn() ? $q->whereNull('slot_id') : $q;
    }

    public function options(): HasMany
    {
        return $this->hasMany(Option::class, 'group_id')->orderBy('sort_order')->orderBy('id');
    }
}
