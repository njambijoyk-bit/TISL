<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockJob extends Model
{
    protected $table = 'stock_jobs';

    protected $fillable = ['number', 'title', 'customer_id', 'location_id', 'status', 'note', 'invoice_voucher_id', 'created_by', 'completed_at'];

    protected $casts = ['completed_at' => 'datetime'];

    public function lines(): HasMany
    {
        return $this->hasMany(StockJobLine::class, 'job_id');
    }
}
