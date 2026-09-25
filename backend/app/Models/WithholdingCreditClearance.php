<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One ledger line per clearance applied to a WithholdingCredit. Append-only
 * - written exclusively through WithholdingCredit::applyClearance(), never
 * edited or deleted directly. Not wrapped in LogsWithholdingActivity: the
 * parent WithholdingCredit already logs "clearance_applied" with this row's
 * id in context, so logging this table too would duplicate the trail.
 */
class WithholdingCreditClearance extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'withholding_credit_clearances';

    protected $fillable = [
        'withholding_credit_id',
        'amount',
        'cleared_on',
        'reference',
        'notes',
        'cleared_by',
    ];

    protected $casts = [
        'amount'     => 'decimal:2',
        'cleared_on' => 'date',
        'created_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::updating(fn () => false);
        static::deleting(fn () => false);
    }

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function credit(): BelongsTo
    {
        return $this->belongsTo(WithholdingCredit::class, 'withholding_credit_id');
    }

    public function clearedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cleared_by');
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeForCredit(Builder $query, int $creditId): Builder
    {
        return $query->where('withholding_credit_id', $creditId);
    }
}
