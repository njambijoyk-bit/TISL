<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\Pivot;

/**
 * Pivot for tax_rules <-> tax_districts.
 * Changes are logged at rule level via TaxRule::syncDistricts().
 */
class TaxRuleDistrict extends Pivot
{
    protected $table = 'tax_rule_districts';

    public $incrementing = true;

    public $timestamps = false;
}
