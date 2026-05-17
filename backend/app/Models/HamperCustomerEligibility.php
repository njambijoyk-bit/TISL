<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HamperCustomerEligibility extends Model
{
    protected $table = 'hamper_customer_eligibility'; 
    
    protected $fillable = [
        'hamper_id',
        'customer_id',
        'status',
        'added_by',
        'note',
        'reactivated_by',
        'reactivated_at',
    ];

    protected $casts = [
        'reactivated_at' => 'datetime',
    ];

    // ── Relationships ─────────────────────────────────────────────────────────

    public function hamper(): BelongsTo
    {
        return $this->belongsTo(Hamper::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function addedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'added_by');
    }

    public function reactivatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reactivated_by');
    }

    // ── Scopes ────────────────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeBlocked($query)
    {
        return $query->whereIn('status', ['blacklisted', 'suspended']);
    }

    // ── Accessors ─────────────────────────────────────────────────────────────

    public function getIsBlockedAttribute(): bool
    {
        return in_array($this->status, ['blacklisted', 'suspended']);
    }

    public function getRequiresAdminToReactivateAttribute(): bool
    {
        return $this->status === 'blacklisted';
    }

    public function getStatusLabelAttribute(): string
    {
        return match ($this->status) {
            'active'      => 'Active',
            'suspended'   => 'Suspended',
            'blacklisted' => 'Blacklisted',
            default       => ucfirst($this->status),
        };
    }
}