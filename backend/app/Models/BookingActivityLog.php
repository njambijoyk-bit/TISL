<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BookingActivityLog extends Model
{
    public $timestamps = false;
    public $updatable  = false;

    protected $fillable = [
        'booking_id',
        'worksheet_id',
        'action',
        'subject_type',
        'subject_id',
        'performed_by',
        'performed_by_role',
        'before',
        'after',
        'ip_address',
        'user_agent',
        'created_at',
    ];

    protected $casts = [
        'before'     => 'array',
        'after'      => 'array',
        'created_at' => 'datetime',
    ];

    // ── Relationships ────────────────────────────────────────────────────────

    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }

    public function worksheet()
    {
        return $this->belongsTo(BookingWorksheet::class, 'worksheet_id');
    }

    public function performed_by()
    {
        return $this->belongsTo(User::class, 'performed_by');
    }

    // ── Scopes ───────────────────────────────────────────────────────────────

    public function scopeForAction($query, string $action)
    {
        return $query->where('action', $action);
    }

    public function scopeByUser($query, int $userId)
    {
        return $query->where('performed_by', $userId);
    }

    // ── Boot ─────────────────────────────────────────────────────────────────

    protected static function boot()
    {
        parent::boot();
        static::creating(function (self $log) {
            $log->created_at = now();
        });
    }
}