<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One dated exchange rate: 1 unit of the currency in base, from `effective_from`. */
class CurrencyRate extends Model
{
    public $timestamps = false;

    protected $fillable = ['currency_id', 'rate', 'effective_from', 'created_at'];

    protected $casts = ['rate' => 'decimal:8', 'effective_from' => 'datetime', 'created_at' => 'datetime'];
}
