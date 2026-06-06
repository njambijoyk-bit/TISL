<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReconciliationLine extends Model
{
    protected $fillable = [
        'session_id',
        'subject_table',
        'subject_id',
        'financial_note_id',
        'meta',                // JSON — ledger-specific context (payment_number, etc.)
        'expected_amount',
        'actual_amount',
        'disputed_amount',
        'status',
        'reviewed_by',
        'reviewed_at',
        'dispute_note',
        'resolution_note',
    ];

    protected $casts = [
        'meta'            => 'array',
        'expected_amount' => 'decimal:2',
        'actual_amount'   => 'decimal:2',
        'disputed_amount' => 'decimal:2',
        'variance'        => 'decimal:2',
        'reviewed_at'     => 'datetime',
    ];

    // ── Relationships ────────────────────────────────────────────

    public function session()
    {
        return $this->belongsTo(ReconciliationSession::class, 'session_id');
    }

    public function note()
    {
        return $this->belongsTo(FinancialNote::class, 'financial_note_id');
    }

    public function reviewedBy()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    // ── Scopes ───────────────────────────────────────────────────

    public function scopePending($q)     { return $q->where('status', 'pending'); }
    public function scopeDisputed($q)    { return $q->where('status', 'disputed'); }
    public function scopeConfirmed($q)   { return $q->where('status', 'confirmed'); }
    public function scopeWithVariance($q){ return $q->whereColumn('actual_amount', '!=', 'expected_amount'); }

    // ── Helpers ──────────────────────────────────────────────────

    public function confirm(int $userId, ?float $actualAmount = null): void
    {
        $this->update([
            'status'        => 'confirmed',
            'actual_amount' => $actualAmount ?? $this->expected_amount,
            'disputed_amount' => null, 
            'reviewed_by'   => $userId,
            'reviewed_at'   => now(),
        ]);
    }

    public function dispute(int $userId, string $note, ?float $disputedAmount = null): void
    {
        $this->update([
            'status'          => 'disputed',
            'dispute_note'    => $note,
            'disputed_amount' => $disputedAmount,
            'reviewed_by'     => $userId,
            'reviewed_at'     => now(),
        ]);
    }

    public function writeOff(int $userId, string $resolution): void
    {
        $this->update([
            'status'          => 'written_off',
            'resolution_note' => $resolution,
            'reviewed_by'     => $userId,
            'reviewed_at'     => now(),
        ]);
    }

    public function scopeVoided($q) { return $q->where('status', 'voided'); }

    public function void(int $userId, string $reason): void
    {
        $this->update([
            'status'          => 'voided',
            'resolution_note' => $reason,
            'reviewed_by'     => $userId,
            'reviewed_at'     => now(),
        ]);
    }

    public function hasVariance(): bool
    {
        if (is_null($this->actual_amount) || is_null($this->expected_amount)) return false;
        return bccomp((string)$this->actual_amount, (string)$this->expected_amount, 2) !== 0;
    }
}