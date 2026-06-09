<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MimiQueryLog extends Model
{
    public $timestamps = false; 

    protected $fillable = [
        'session_id',
        'actor_type',
        'customer_id',
        'user_id',
        'ip_address',
        'query',
        'response',
        'response_status',
        'error_message',
        'http_status_code',
        'is_harmful',
        'harm_category',
        'is_flagged',
        'flagged_by',
        'flagged_reason',
        'query_length',
        'response_length',
        'response_time_ms',
        'queried_at',
    ];

    protected $casts = [
        'is_harmful'       => 'boolean',
        'is_flagged'       => 'boolean',
        'query_length'     => 'integer',
        'response_length'  => 'integer',
        'response_time_ms' => 'integer',
        'http_status_code' => 'integer',
        'queried_at'       => 'datetime',
    ];

    // ── Relationships ─────────────────────────────────────────────────────────

    public function session(): BelongsTo
    {
        return $this->belongsTo(MimiSession::class, 'session_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function flaggedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'flagged_by');
    }

    // ── Scopes ────────────────────────────────────────────────────────────────

    public function scopeHarmful($query)
    {
        return $query->where('is_harmful', true);
    }

    public function scopeFlagged($query)
    {
        return $query->where('is_flagged', true);
    }

    public function scopeFailed($query)
    {
        return $query->whereIn('response_status', ['api_error', 'connection_error', 'rate_limited']);
    }

    public function scopeSuccessful($query)
    {
        return $query->where('response_status', 'success');
    }

    public function scopeForActor($query, string $actorType, ?int $actorId = null)
    {
        $query->where('actor_type', $actorType);
        if ($actorId && $actorType === 'customer') {
            $query->where('customer_id', $actorId);
        } elseif ($actorId && $actorType === 'staff') {
            $query->where('user_id', $actorId);
        }
        return $query;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    public function wasSuccessful(): bool
    {
        return $this->response_status === 'success';
    }

    public function wasBlocked(): bool
    {
        return $this->response_status === 'blocked';
    }
}
