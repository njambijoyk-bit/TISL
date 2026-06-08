<?php

// ════════════════════════════════════════════════════════════════════════════
// app/Models/CustomerNote.php
// ════════════════════════════════════════════════════════════════════════════

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerNote extends Model
{
    protected $table = 'customer_notes';

    protected $fillable = [
        'customer_id',
        'note',
    ];

    protected $casts = [
        'note' => 'string',
    ];

    // Max characters enforced at app layer — matches backend validation
    const MAX_LENGTH = 2000;

    // ── Relationships ──────────────────────────────────────────────────────

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    // ── Scopes ─────────────────────────────────────────────────────────────

    /** Only rows where the customer has an active (non-null) note */
    public function scopeActive($query)
    {
        return $query->whereNotNull('note');
    }
}


// ════════════════════════════════════════════════════════════════════════════
// app/Models/AdminSavedNote.php
// ════════════════════════════════════════════════════════════════════════════

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AdminSavedNote extends Model
{
    protected $table      = 'admin_saved_notes';
    public    $timestamps = false; // table uses saved_at, not created_at/updated_at

    protected $fillable = [
        'customer_id',
        'saved_by',
        'note_snapshot',
        'internal_tag',
        'saved_at',
    ];

    protected $casts = [
        'saved_at' => 'datetime',
    ];

    // ── Relationships ──────────────────────────────────────────────────────

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function savedBy()
    {
        return $this->belongsTo(User::class, 'saved_by');
    }
}