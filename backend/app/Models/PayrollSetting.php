<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

/** The few payroll defaults: the overtime multiplier, whether absence is deducted, and the two ledgers every run posts to. */
class PayrollSetting extends Model
{
    protected $fillable = ['overtime_multiplier', 'deduct_absence', 'salaries_expense_ledger_id', 'salaries_payable_ledger_id', 'updated_by',
        'gratuity_days_per_year', 'gratuity_min_years', 'gratuity_divisor', 'gratuity_prorate'];

    protected $casts = ['overtime_multiplier' => 'float', 'deduct_absence' => 'boolean', 'gratuity_days_per_year' => 'float', 'gratuity_min_years' => 'integer', 'gratuity_divisor' => 'integer', 'gratuity_prorate' => 'boolean'];

    public static function current(): self
    {
        if (! Schema::hasTable('payroll_settings')) {
            return new self(['overtime_multiplier' => 1.5, 'deduct_absence' => true]);
        }

        return self::first() ?? self::create(['overtime_multiplier' => 1.5, 'deduct_absence' => true]);
    }
}
