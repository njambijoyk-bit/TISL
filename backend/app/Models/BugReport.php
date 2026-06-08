<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class BugReport extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'report_number',
        'customer_id',
        'user_id',
        'guest_name',
        'guest_email',
        'tracking_token',
        'title',
        'description',
        'page_url',
        'screenshot_url',
        'priority',
        'status',
        'dev_note_id',
        'resolved_at',
    ];

    protected $casts = [
        'resolved_at' => 'datetime',
        'created_at'  => 'datetime',
        'updated_at'  => 'datetime',
        'deleted_at'  => 'datetime',
    ];

    // ── Relationships ──────────────────────────────────────────

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function devNote()
    {
        return $this->belongsTo(DevNote::class);
    }

    public function statusHistory()
    {
        return $this->hasMany(BugReportStatusHistory::class)->orderBy('created_at', 'asc');
    }

    // ── Scopes ────────────────────────────────────────────────

    public function scopeOpen($query)
    {
        return $query->where('status', 'open');
    }

    public function scopeByPriority($query, string $priority)
    {
        return $query->where('priority', $priority);
    }

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    // ── Helpers ───────────────────────────────────────────────

    public static function generateReportNumber(): string
    {
        $year  = now()->year;
        $max   = static::whereYear('created_at', $year)->max('report_number');
        $seq   = $max ? ((int) substr($max, -5)) + 1 : 1;
        return 'BR-' . $year . '-' . str_pad($seq, 5, '0', STR_PAD_LEFT);
    }

    public static function generateTrackingToken(): string
    {
        return (string) Str::uuid();
    }

    public function isGuest(): bool
    {
        return is_null($this->customer_id) && is_null($this->user_id);
    }

    public function reporterLabel(): string
    {
        if ($this->customer_id && $this->customer) {
            return $this->customer->full_name ?? 'Customer #' . $this->customer_id;
        }
        if ($this->user_id && $this->user) {
            return $this->user->name ?? 'Staff #' . $this->user_id;
        }
        return $this->guest_name ?? 'Anonymous Guest';
    }
}