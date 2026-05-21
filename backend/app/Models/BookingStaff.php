<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BookingStaff extends Model
{
    public $timestamps = false;

    protected $table = 'booking_staff';

    protected $fillable = [
        'booking_id',
        'user_id',
        'role',
        'task_description',
        'assigned_by',
        'assigned_at',
        'status',
    ];

    protected $casts = [
        'assigned_at' => 'datetime',
    ];

    // ── Relationships ────────────────────────────────────────────────────────

    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function assigned_by()
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    public function isLead(): bool
    {
        return $this->role === 'lead';
    }

    public function hasAccepted(): bool
    {
        return $this->status === 'accepted';
    }

    public function hasDeclined(): bool
    {
        return $this->status === 'declined';
    }
}