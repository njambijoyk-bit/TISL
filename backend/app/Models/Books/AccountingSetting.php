<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;

/** The single settings row (id = 1). */
class AccountingSetting extends Model
{
    public $incrementing = false;

    public $timestamps = false;

    protected $table = 'accounting_settings';

    protected $fillable = [
        'edit_window_days', 'locked_before', 'walkin_ledger_id', 'default_sales_ledger_id',
        'default_purchase_ledger_id', 'sales_returns_ledger_id', 'purchase_returns_ledger_id',
        'shipping_income_ledger_id', 'discount_ledger_id', 'rounding_ledger_id',
        'default_payment_method_id', 'updated_by', 'updated_at',
    ];

    protected $casts = ['locked_before' => 'date:Y-m-d', 'updated_at' => 'datetime'];

    public static function current(): self
    {
        return static::find(1) ?? static::create(['id' => 1, 'edit_window_days' => 30]);
    }
}
