<?php

namespace App\Models;

use App\Models\Books\Voucher;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * The claimable side of a withholding certificate — a customer held tax back from us, so we hold a
 * receivable (the type's "Receivable" ledger) until it is set against our own tax or refunded.
 * It is not a table of its own: it is the credit_* part of the certificate a receipt generated, and
 * every clearance / write-off is a Journal voucher (see WithholdingRegisterService).
 */
class WithholdingCredit extends Model
{
    public const STATUS_HELD              = 'held';
    public const STATUS_PARTIALLY_CLEARED = 'partially_cleared';
    public const STATUS_CLEARED           = 'cleared';
    public const STATUS_WRITTEN_OFF       = 'written_off';

    protected $table = 'withholding_certificates';

    protected $appends = ['amount', 'status', 'certificate'];

    protected $hidden = ['withheld_amount', 'credit_status'];

    protected $casts = ['cleared_amount' => 'decimal:2', 'withheld_amount' => 'decimal:2', 'gross_amount' => 'decimal:2', 'net_amount' => 'decimal:2'];

    protected static function booted(): void
    {
        static::addGlobalScope('credits', fn (Builder $q) => $q->where('withholding_certificates.direction', 'receivable')->whereNotNull('withholding_certificates.credit_status'));
    }

    public function getAmountAttribute(): string { return (string) $this->attributes['withheld_amount']; }
    public function getStatusAttribute(): ?string { return $this->attributes['credit_status'] ?? null; }

    /** The certificate this credit belongs to (the same record, in the shape the credit screens expect). */
    public function getCertificateAttribute(): array
    {
        return ['id' => $this->id, 'certificate_number' => $this->attributes['certificate_number'] ?? null, 'status' => $this->attributes['status'] ?? null,
            'withheld_amount' => $this->attributes['withheld_amount'] ?? null, 'gross_amount' => $this->attributes['gross_amount'] ?? null, 'voucher_id' => $this->attributes['voucher_id'] ?? null];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function voucher(): BelongsTo
    {
        return $this->belongsTo(Voucher::class, 'voucher_id');
    }

    public function partyLedger(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Books\Ledger::class, 'party_ledger_id');
    }

    public function clearances(): HasMany
    {
        return $this->hasMany(WithholdingCreditClearance::class, 'certificate_id');
    }

    public function scopeOutstanding(Builder $query): Builder
    {
        return $query->whereIn('withholding_certificates.credit_status', [self::STATUS_HELD, self::STATUS_PARTIALLY_CLEARED]);
    }

    public function scopeForCustomer(Builder $query, int $customerId): Builder
    {
        return $query->where('withholding_certificates.customer_id', $customerId);
    }

    public function remainingAmount(): float
    {
        return round((float) $this->attributes['withheld_amount'] - (float) $this->cleared_amount, 2);
    }
}
