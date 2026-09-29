<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;

class FinancialYear extends Model
{
    protected $table = 'financial_years';

    protected $fillable = ['name', 'start_date', 'end_date', 'is_closed', 'closed_by', 'closed_at'];

    protected $casts = ['start_date' => 'date:Y-m-d', 'end_date' => 'date:Y-m-d', 'is_closed' => 'boolean', 'closed_at' => 'datetime'];

    public static function containing($date): ?self
    {
        return static::where('start_date', '<=', $date)->where('end_date', '>=', $date)->first();
    }
}
