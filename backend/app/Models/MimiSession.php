<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MimiSession extends Model
{
    public $timestamps = false;
    
    protected $fillable = [
        'session_token',
        'actor_type',
        'customer_id',
        'user_id',
        'actor_display_name',
        'customer_number',
        'customer_age',
        'customer_tier',
        'customer_type',
        'ip_address',
        'user_agent',
        'is_blocked',
        'block_reason',
        'blocked_at',
        'blocked_by',
        'started_at',
        'last_active_at',
        'ended_at',
        'message_count',
        'failed_count',
        'status',
    ];

    protected $casts = [
        'is_blocked'     => 'boolean',
        'started_at'     => 'datetime',
        'last_active_at' => 'datetime',
        'ended_at'       => 'datetime',
        'blocked_at'     => 'datetime',
        'message_count'  => 'integer',
        'failed_count'   => 'integer',
        'customer_age'   => 'integer',
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

    public function blockedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'blocked_by');
    }

    public function queryLogs(): HasMany
    {
        return $this->hasMany(MimiQueryLog::class, 'session_id');
    }

    // ── Scopes ────────────────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeForCustomer($query, int $customerId)
    {
        return $query->where('customer_id', $customerId);
    }

    public function scopeForIp($query, string $ip)
    {
        return $query->where('ip_address', $ip);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function isBlocked(): bool
    {
        return $this->is_blocked || $this->status === 'blocked';
    }

    public function isGuest(): bool
    {
        return $this->actor_type === 'guest';
    }

    public function isStaff(): bool
    {
        return $this->actor_type === 'staff';
    }

    public function isCustomer(): bool
    {
        return $this->actor_type === 'customer';
    }
}
