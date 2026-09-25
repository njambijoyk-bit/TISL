<?php

namespace App\Models;

use App\Traits\LogsWithholdingActivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use InvalidArgumentException;

/**
 * The claimable side of a WithholdingCertificate: how much of the withheld
 * amount has been cleared/credited against TISL's own tax liability.
 * amount is fixed at creation; cleared_amount accumulates via
 * WithholdingCreditClearance rows (see applyClearance()).
 */
class WithholdingCredit extends Model
{
    use LogsWithholdingActivity;

    public const STATUS_HELD              = 'held';
    public const STATUS_PARTIALLY_CLEARED = 'partially_cleared';
    public const STATUS_CLEARED           = 'cleared';
    public const STATUS_WRITTEN_OFF       = 'written_off';

    protected $table = 'withholding_credits';

    protected $fillable = [
        'withholding_certificate_id',
        'customer_id',
        'amount',
        'cleared_amount',
        'status',
        'remitted_on',
        'remittance_reference',
    ];

    protected $casts = [
        'amount'         => 'decimal:2',
        'cleared_amount' => 'decimal:2',
        'remitted_on'    => 'date',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function certificate(): BelongsTo
    {
        return $this->belongsTo(WithholdingCertificate::class, 'withholding_certificate_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function clearances(): HasMany
    {
        return $this->hasMany(WithholdingCreditClearance::class);
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeHeld(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_HELD);
    }

    public function scopePartiallyCleared(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_PARTIALLY_CLEARED);
    }

    public function scopeCleared(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_CLEARED);
    }

    public function scopeWrittenOff(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_WRITTEN_OFF);
    }

    public function scopeOutstanding(Builder $query): Builder
    {
        return $query->whereIn('status', [self::STATUS_HELD, self::STATUS_PARTIALLY_CLEARED]);
    }

    public function scopeForCustomer(Builder $query, int $customerId): Builder
    {
        return $query->where('customer_id', $customerId);
    }

    // ========================================
    // HELPERS
    // ========================================

    public function remainingAmount(): float
    {
        return round((float) $this->amount - (float) $this->cleared_amount, 2);
    }

    public function isFullyCleared(): bool
    {
        return $this->remainingAmount() <= 0.0;
    }

    /**
     * Record a clearance against this credit: writes the ledger row,
     * bumps cleared_amount, and re-derives status. Mirrors the DB-level
     * CHECK (cleared_amount >= 0 AND cleared_amount <= amount).
     */
    public function applyClearance(
        float $amount,
        ?string $clearedOn = null,
        ?string $reference = null,
        ?string $notes = null,
        ?int $clearedBy = null
    ): WithholdingCreditClearance {
        if ($amount <= 0) {
            throw new InvalidArgumentException('Clearance amount must be positive.');
        }

        if ($amount > $this->remainingAmount() + 0.0001) {
            throw new InvalidArgumentException('Clearance amount exceeds the remaining balance on this credit.');
        }

        $clearance = $this->clearances()->create([
            'amount'     => $amount,
            'cleared_on' => $clearedOn ?? now()->toDateString(),
            'reference'  => $reference,
            'notes'      => $notes,
            'cleared_by' => $clearedBy,
        ]);

        $old = $this->only(['cleared_amount', 'status']);

        $this->cleared_amount = round((float) $this->cleared_amount + $amount, 2);
        $this->status = $this->isFullyCleared() ? self::STATUS_CLEARED : self::STATUS_PARTIALLY_CLEARED;
        $this->save();

        $this->recordActivity(
            'clearance_applied',
            $old,
            $this->only(['cleared_amount', 'status']),
            ['clearance_id' => $clearance->id, 'amount' => $amount]
        );

        return $clearance;
    }

    public function writeOff(?string $reason = null): void
    {
        $old = $this->only(['status']);

        $this->status = self::STATUS_WRITTEN_OFF;
        $this->save();

        $this->recordActivity('written_off', $old, $this->only(['status']), $reason ? ['reason' => $reason] : []);
    }
}
