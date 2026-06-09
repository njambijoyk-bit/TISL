<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

class MimiBlockedActor extends Model
{
    protected $fillable = [
        'actor_type',
        'customer_id',
        'user_id',
        'ip_address',
        'reason',
        'blocked_by',
        'blocked_at',
        'expires_at',
        'is_active',
        'notes',
    ];

    protected $casts = [
        'is_active'  => 'boolean',
        'blocked_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    // ── Relationships ─────────────────────────────────────────────────────────

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function blockedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'blocked_by');
    }

    // ── Scopes ────────────────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('is_active', true)
            ->where(fn($q) =>
                $q->whereNull('expires_at')
                  ->orWhere('expires_at', '>', now())
            );
    }

    public function scopeForCustomer($query, int $customerId)
    {
        return $query->where('actor_type', 'customer')
                     ->where('customer_id', $customerId);
    }

    public function scopeForUser($query, int $userId)
    {
        return $query->where('actor_type', 'staff')
                     ->where('user_id', $userId);
    }

    public function scopeForIp($query, string $ip)
    {
        return $query->where('actor_type', 'guest_ip')
                     ->where('ip_address', $ip);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    public function isExpired(): bool
    {
        return $this->expires_at && $this->expires_at->isPast();
    }

    public function isPermanent(): bool
    {
        return is_null($this->expires_at);
    }

    public function deactivate(): void
    {
        $this->update(['is_active' => false]);
    }
}
