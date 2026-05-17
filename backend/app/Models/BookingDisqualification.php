<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BookingDisqualification extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'customer_id',
        'booking_id',
        'reason',
        'disqualified_by',
        'disqualified_at',
        'is_active',
        'reactivated_by',
        'reactivated_at',
        'reactivation_notes',
    ];

    protected $casts = [
        'disqualified_at' => 'datetime',
        'reactivated_at'  => 'datetime',
        'is_active'       => 'boolean',
    ];

    // ── Relationships ────────────────────────────────────────────────────────

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }

    public function disqualifiedBy()
    {
        return $this->belongsTo(User::class, 'disqualified_by');
    }

    public function reactivatedBy()
    {
        return $this->belongsTo(User::class, 'reactivated_by');
    }

    // ── Scopes ───────────────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeForCustomer($query, int $customerId)
    {
        return $query->where('customer_id', $customerId);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    public static function isCustomerDisqualified(int $customerId): bool
    {
        return self::where('customer_id', $customerId)
            ->where('is_active', true)
            ->exists();
    }

    public function reactivate(int $reactivatedBy, ?string $notes = null): void
    {
        $this->update([
            'is_active'          => false,
            'reactivated_by'     => $reactivatedBy,
            'reactivated_at'     => now(),
            'reactivation_notes' => $notes,
        ]);
    }
}