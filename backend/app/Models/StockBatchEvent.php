<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** What was done to a batch — quarantine, release, recall, clearance — and by whom. */
class StockBatchEvent extends Model
{
    public $timestamps = false;

    protected $table = 'stock_batch_events';

    protected $fillable = ['batch_id', 'action', 'note', 'meta', 'user_id', 'created_at'];

    protected $casts = ['meta' => 'array', 'created_at' => 'datetime'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
