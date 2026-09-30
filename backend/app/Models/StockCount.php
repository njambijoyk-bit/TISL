<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockCount extends Model
{

    protected $table = 'stock_counts';

    protected $fillable = ['number', 'location_id', 'status', 'note', 'created_by', 'posted_by', 'posted_at', 'voucher_id'];

    protected $casts = ['posted_at' => 'datetime'];

    public function lines(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(StockCountLine::class, 'count_id');
    }
}
