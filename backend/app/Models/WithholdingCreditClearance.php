<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One clearance (or write-off) of a withholding credit. Each is backed by a Journal voucher; when that
 * voucher is cancelled the row is voided, never deleted.
 */
class WithholdingCreditClearance extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'withholding_clearances';

    protected $fillable = ['certificate_id', 'voucher_id', 'kind', 'amount', 'cleared_on', 'reference', 'notes', 'cleared_by', 'voided_at'];

    protected $casts = ['amount' => 'decimal:2', 'cleared_on' => 'date', 'created_at' => 'datetime', 'voided_at' => 'datetime'];

    protected static function booted(): void
    {
        static::deleting(fn () => false);
    }

    public function credit(): BelongsTo
    {
        return $this->belongsTo(WithholdingCredit::class, 'certificate_id');
    }

    public function voucher(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Books\Voucher::class, 'voucher_id');
    }

    public function clearedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cleared_by');
    }
}
