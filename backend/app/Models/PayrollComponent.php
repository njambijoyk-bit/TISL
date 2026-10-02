<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One earning, deduction or employer contribution, and how it is worked out. Nothing here is specific to a country: a percent of a base (with a cap on the base,
 * a minimum and maximum), a fixed amount, or progressive bands; optionally a relief taken off the result; optionally taken off before tax is worked out.
 */
class PayrollComponent extends Model
{
    public const KINDS = ['earning' => 'Earning (added to pay)', 'deduction' => 'Deduction (taken from the employee)', 'employer' => 'Employer contribution (a cost to the business)'];
    public const CALCS = ['fixed' => 'A fixed amount', 'percent' => 'A percentage', 'bands' => 'Bands (each slice at its own rate)'];
    public const BASES = ['basic' => 'Basic pay', 'gross' => 'Gross pay', 'taxable' => 'Taxable pay'];

    protected $fillable = ['code', 'name', 'kind', 'calc', 'base', 'value', 'bands', 'base_cap', 'min_amount', 'max_amount', 'relief', 'reduces_taxable', 'applies_to', 'ledger_id', 'expense_ledger_id',
        'jurisdiction', 'notes', 'sort_order', 'is_active'];

    protected $casts = ['value' => 'float', 'bands' => 'array', 'base_cap' => 'float', 'min_amount' => 'float', 'max_amount' => 'float', 'relief' => 'float', 'reduces_taxable' => 'boolean', 'is_active' => 'boolean', 'sort_order' => 'integer'];
}
