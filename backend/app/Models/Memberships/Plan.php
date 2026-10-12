<?php

namespace App\Models\Memberships;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A membership plan: a price for a period, and what it gives. */
class Plan extends Model
{
    public const UNITS = ['day' => 'day', 'week' => 'week', 'month' => 'month', 'year' => 'year'];
    public const STATUSES = ['draft' => 'Draft', 'published' => 'Published', 'archived' => 'Archived'];

    protected $table = 'membership_plans';

    protected $guarded = [];

    protected $casts = ['price' => 'decimal:2', 'joining_fee' => 'decimal:2', 'auto_renew' => 'boolean', 'all_branches' => 'boolean', 'branch_ids' => 'array', 'period_count' => 'integer', 'trial_days' => 'integer', 'grace_days' => 'integer', 'capacity' => 'integer'];

    public function benefits(): HasMany
    {
        return $this->hasMany(PlanBenefit::class, 'plan_id')->orderBy('sort_order')->orderBy('id');
    }
}
