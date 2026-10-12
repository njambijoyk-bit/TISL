<?php

namespace App\Models\Memberships;

use Illuminate\Database\Eloquent\Model;

/** One thing a plan gives. The type says which module runs it; the config is that module's settings for it. */
class PlanBenefit extends Model
{
    protected $table = 'membership_plan_benefits';

    protected $guarded = [];

    protected $casts = ['config' => 'array'];
}
