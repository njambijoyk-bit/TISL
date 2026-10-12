<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A meal plan: a rotating weekly menu delivered on chosen days at a price for each delivery day. */
class Plan extends Model
{
    public const DAYS = [1 => 'Monday', 2 => 'Tuesday', 3 => 'Wednesday', 4 => 'Thursday', 5 => 'Friday', 6 => 'Saturday', 7 => 'Sunday'];

    protected $table = 'menus_plans';

    protected $guarded = [];

    protected $casts = ['day_price' => 'decimal:2', 'is_active' => 'boolean', 'cycle_weeks' => 'integer', 'min_days' => 'integer', 'cutoff_hours' => 'integer', 'requires_membership' => 'boolean', 'membership_plan_ids' => 'array'];

    public function days(): HasMany
    {
        return $this->hasMany(PlanDay::class, 'plan_id')->orderBy('week_no')->orderBy('weekday')->orderBy('sort_order')->orderBy('id');
    }

    /** @return int[] the weekdays the plan delivers */
    public function weekdays(): array
    {
        return array_values(array_filter(array_map('intval', explode(',', (string) $this->delivery_weekdays)), fn ($d) => $d >= 1 && $d <= 7));
    }
}
