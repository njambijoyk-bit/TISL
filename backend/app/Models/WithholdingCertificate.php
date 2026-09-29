<?php

namespace App\Models;

use App\Traits\LogsWithholdingActivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Proves that tax was actually withheld on a specific payment (as opposed
 * to TaxLegitimacyCertificate, which proves a customer is authorized to
 * withhold at all). One row per withheld transaction.
 */
class WithholdingCertificate extends Model
{
    use LogsWithholdingActivity;

    public const STATUS_PENDING  = 'pending';
    public const STATUS_ISSUED   = 'issued';
    public const STATUS_RECEIVED = 'received';
    public const STATUS_VOID     = 'void';   // its voucher was cancelled

    protected $table = 'withholding_certificates';

    protected $fillable = [
        'tax_application_id',
        'customer_id',
        'authorizing_certificate_id',
        'certificate_number',
        'gross_amount',
        'withheld_amount',
        'net_amount',
        'status',
        'issued_at',
        'document_path',
        'voucher_id',
        'direction',
        'party_ledger_id',
        'tax_rate_id',
        'currency_id',
        'exchange_rate',
        'cleared_amount',
        'credit_status',
    ];

    protected $casts = [
        'gross_amount'    => 'decimal:2',
        'withheld_amount' => 'decimal:2',
        'net_amount'      => 'decimal:2',
        'issued_at'       => 'date',
        'cleared_amount'  => 'decimal:2',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function taxApplication(): BelongsTo
    {
        return $this->belongsTo(TaxApplication::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** The standing withholding-agent appointment that authorized this deduction. */
    public function authorizingCertificate(): BelongsTo
    {
        return $this->belongsTo(TaxLegitimacyCertificate::class, 'authorizing_certificate_id');
    }

    /** The Receipt / Payment voucher this certificate was generated from. */
    public function voucher(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Books\Voucher::class, 'voucher_id');
    }

    public function partyLedger(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Books\Ledger::class, 'party_ledger_id');
    }

    public function clearances(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(WithholdingCreditClearance::class, 'certificate_id');
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_PENDING);
    }

    public function scopeIssued(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_ISSUED);
    }

    public function scopeReceived(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_RECEIVED);
    }

    public function scopeForCustomer(Builder $query, int $customerId): Builder
    {
        return $query->where('customer_id', $customerId);
    }

    // ========================================
    // HELPERS
    // ========================================

    public function isPending(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }

    public function isIssued(): bool
    {
        return $this->status === self::STATUS_ISSUED;
    }

    public function isReceived(): bool
    {
        return $this->status === self::STATUS_RECEIVED;
    }

    public function markIssued(?string $documentPath = null): void
    {
        $old = $this->only(['status', 'issued_at', 'document_path']);

        $this->status = self::STATUS_ISSUED;
        $this->issued_at ??= now()->toDateString();

        if ($documentPath !== null) {
            $this->document_path = $documentPath;
        }

        $this->save();

        $this->recordActivity('issued', $old, $this->only(['status', 'issued_at', 'document_path']));
    }

    public function markReceived(): void
    {
        $old = $this->only(['status']);

        $this->status = self::STATUS_RECEIVED;
        $this->save();

        $this->recordActivity('received', $old, $this->only(['status']));
    }

    /** Sanity check: net should equal gross minus withheld. */
    public function amountsBalance(): bool
    {
        return bccomp((string) $this->net_amount, bcsub((string) $this->gross_amount, (string) $this->withheld_amount, 2), 2) === 0;
    }
}
