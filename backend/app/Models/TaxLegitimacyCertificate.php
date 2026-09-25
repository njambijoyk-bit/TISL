<?php

namespace App\Models;

use App\Traits\LogsTaxActivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Support\Carbon;

/**
 * Proof backing a 0%/zero-rated/exempt tax rate (certificate_type = exemption)
 * or a customer's standing authorization to withhold tax
 * (certificate_type = withholding_agent).
 */
class TaxLegitimacyCertificate extends Model
{
    use LogsTaxActivity;

    public const TYPE_EXEMPTION         = 'exemption';
    public const TYPE_WITHHOLDING_AGENT = 'withholding_agent';

    public const STATUS_PENDING  = 'pending_verification';
    public const STATUS_VERIFIED = 'verified';
    public const STATUS_EXPIRED  = 'expired';
    public const STATUS_REVOKED  = 'revoked';

    protected $table = 'tax_legitimacy_certificates';

    protected $fillable = [
        'certificate_number',
        'certificate_type',
        'issuing_authority',
        'classification',
        'holder_type',
        'holder_id',
        'issued_at',
        'valid_until',
        'status',
        'verified_by',
        'verified_at',
        'document_path',
    ];

    protected $casts = [
        'issued_at'   => 'date',
        'valid_until' => 'date',
        'verified_at' => 'datetime',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function holder(): MorphTo
    {
        return $this->morphTo();
    }

    public function verifiedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }

    public function applicability(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(TaxApplicability::class, 'tax_legitimacy_certificate_id');
    }

    public function withholdingCertificates(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(WithholdingCertificate::class, 'authorizing_certificate_id');
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeExemption(Builder $query): Builder
    {
        return $query->where('certificate_type', self::TYPE_EXEMPTION);
    }

    public function scopeWithholdingAgent(Builder $query): Builder
    {
        return $query->where('certificate_type', self::TYPE_WITHHOLDING_AGENT);
    }

    public function scopeVerified(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_VERIFIED);
    }

    public function scopeForHolder(Builder $query, Model $holder): Builder
    {
        return $query->where('holder_type', $holder->getMorphClass())
            ->where('holder_id', $holder->getKey());
    }

    /** Verified and currently within its validity window. */
    public function scopeCurrentlyValid(Builder $query, $on = null): Builder
    {
        $date = $on ? Carbon::parse($on)->toDateString() : now()->toDateString();

        return $query->verified()
            ->where('issued_at', '<=', $date)
            ->where(function ($q) use ($date) {
                $q->whereNull('valid_until')->orWhere('valid_until', '>=', $date);
            });
    }

    // ========================================
    // HELPERS
    // ========================================

    public function isVerified(): bool
    {
        return $this->status === self::STATUS_VERIFIED;
    }

    public function isExpired(): bool
    {
        return $this->valid_until !== null && $this->valid_until->isPast();
    }

    /** Verified, unexpired/unrevoked, and within its date window right now (or on a given date). */
    public function isValid($on = null): bool
    {
        if (! $this->isVerified()) {
            return false;
        }

        $date = $on ? Carbon::parse($on) : now();

        if ($this->issued_at !== null && $date->lt($this->issued_at)) {
            return false;
        }

        return $this->valid_until === null || $date->lte($this->valid_until);
    }

    public function verify(int $userId): void
    {
        $old = $this->only(['status', 'verified_by', 'verified_at']);

        $this->status      = self::STATUS_VERIFIED;
        $this->verified_by = $userId;
        $this->verified_at = now();
        $this->save();

        $this->recordActivity('verified', $old, $this->only(['status', 'verified_by', 'verified_at']));
    }

    public function revoke(?string $reason = null): void
    {
        $old = $this->only(['status']);

        $this->status = self::STATUS_REVOKED;
        $this->save();

        $this->recordActivity('revoked', $old, $this->only(['status']), $reason ? ['reason' => $reason] : []);
    }
}
