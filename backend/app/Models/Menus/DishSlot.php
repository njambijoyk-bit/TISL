<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A place in a dish that is filled with sides: always included, choose one, choose any, a free extra or a paid extra. */
class DishSlot extends Model
{
    public const KINDS = ['fixed' => 'Always included', 'choose_one' => 'Choose one', 'choose_any' => 'Choose any', 'free_extra' => 'Free extra', 'paid_extra' => 'Paid extra'];

    protected $table = 'menus_dish_slots';

    protected $fillable = ['dish_id', 'name', 'kind', 'min_choices', 'max_choices', 'sort_order'];

    protected $casts = ['min_choices' => 'integer', 'max_choices' => 'integer', 'sort_order' => 'integer'];

    public function choices(): HasMany
    {
        return $this->hasMany(DishSlotChoice::class, 'slot_id')->orderBy('sort_order')->orderBy('id');
    }
}
