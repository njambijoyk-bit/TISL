<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A day-end count of one cash ledger against the books. */
class CashCount extends Model
{
    protected $table = 'cash_counts';

    protected $fillable = ['ledger_id', 'count_date', 'counted', 'book_balance', 'difference', 'reason', 'adjust_voucher_id', 'counted_by'];

    protected $casts = ['counted' => 'decimal:2', 'book_balance' => 'decimal:2', 'difference' => 'decimal:2', 'count_date' => 'date:Y-m-d'];

    public function ledger(): BelongsTo
    {
        return $this->belongsTo(Ledger::class);
    }
}
