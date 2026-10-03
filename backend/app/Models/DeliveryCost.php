<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** What a manifest cost to run (fuel, courier, driver pay): one row per cost, posted as a Payment voucher. */
class DeliveryCost extends Model
{
    protected $fillable = ['manifest_id', 'category', 'amount', 'expense_ledger_id', 'paid_ledger_id', 'voucher_id', 'payee', 'notes', 'paid_on', 'created_by', 'cancelled_at'];

    protected $casts = ['amount' => 'decimal:2', 'paid_on' => 'date:Y-m-d', 'cancelled_at' => 'datetime'];

    public const CATEGORIES = ['fuel' => 'Fuel', 'courier' => 'Courier fee', 'driver_pay' => 'Driver pay', 'other' => 'Other'];
}
