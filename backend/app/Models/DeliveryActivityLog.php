<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

// ============================================================
// DeliveryActivityLog.php
// ============================================================
class DeliveryActivityLog extends Model
{
    public $timestamps = false; // only created_at

    protected $fillable = [
        'loggable_type',
        'loggable_id',
        'action',
        'performed_by',
        'performer_name',
        'severity',
        'payload',
    ];

    protected $casts = [
        'payload'    => 'array',
        'created_at' => 'datetime',
    ];

    // ── Relationships ────────────────────────────────────────

    public function performer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'performed_by');
    }

    public function loggable()
    {
        return $this->morphTo();
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeForEntity($query, string $type, int $id)
    {
        return $query->where('loggable_type', $type)->where('loggable_id', $id);
    }

    public function scopeCritical($query)
    {
        return $query->where('severity', 'critical');
    }
}
