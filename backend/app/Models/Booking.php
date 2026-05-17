<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Booking extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'booking_number',
        'service_id',
        'customer_id',
        'project_id',
        'created_by',
        'location_type',
        'location_address',
        'scheduled_type',
        'scheduled_at',
        'scheduled_end_at',
        'duration_minutes',
        'is_recurring',
        'recurrence_rule',
        'recurring_billing_mode',
        'status',
        'cancelled_by',
        'cancelled_at',
        'cancellation_reason',
        'cancellation_fee_applied',
        'policy_accepted',
        'policy_accepted_at',
        'policy_version',
        'is_disqualified',
        'customer_notes',
        'admin_notes',
    ];

    protected $casts = [
        'scheduled_at'             => 'datetime',
        'scheduled_end_at'         => 'datetime',
        'cancelled_at'             => 'datetime',
        'policy_accepted_at'       => 'datetime',
        'is_recurring'             => 'boolean',
        'policy_accepted'          => 'boolean',
        'is_disqualified'          => 'boolean',
        'recurrence_rule'          => 'array',
        'cancellation_fee_applied' => 'decimal:2',
        'duration_minutes'         => 'integer',
    ];

    // ── Boot ────────────────────────────────────────────────────────────────

    protected static function boot()
    {
        parent::boot();

        static::creating(function (Booking $booking) {
            if (empty($booking->booking_number)) {
                $booking->booking_number = self::generateNumber($booking->created_by);
            }
        });
    }

    public static function generateNumber(int $userId): string
    {
        $date = now()->format('ymd');           // 251213
        $rand = str_pad(rand(1000, 9999), 4, '0', STR_PAD_LEFT);
        return "BK-{$date}>{$userId}?{$rand}";
    }

    // ── Relationships ────────────────────────────────────────────────────────

    public function service()
    {
        return $this->belongsTo(Service::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function cancelledBy()
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    public function staff()
    {
        return $this->hasMany(BookingStaff::class);
    }

    public function worksheets()
    {
        return $this->hasMany(BookingWorksheet::class);
    }

    public function orders()
    {
        return $this->belongsToMany(Order::class, 'booking_orders')
                    ->withPivot('occurrence_date', 'notes')
                    ->withTimestamps();
    }

    public function disqualifications()
    {
        return $this->hasMany(BookingDisqualification::class);
    }

    public function activityLogs()
    {
        return $this->hasMany(BookingActivityLog::class)->orderByDesc('created_at');
    }

    // ── Scopes ───────────────────────────────────────────────────────────────

    public function scopeForCustomer($query, int $customerId)
    {
        return $query->where('customer_id', $customerId);
    }

    public function scopeForDate($query, string $date)
    {
        return $query->whereDate('scheduled_at', $date);
    }

    public function scopeForDateRange($query, string $from, string $to)
    {
        return $query->whereBetween('scheduled_at', [$from, $to]);
    }

    public function scopeUpcoming($query)
    {
        return $query->where('scheduled_at', '>=', now())
                     ->whereNotIn('status', ['cancelled', 'completed', 'no_show']);
    }

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    public function isPending(): bool    { return $this->status === 'pending'; }
    public function isConfirmed(): bool  { return $this->status === 'confirmed'; }
    public function isCompleted(): bool  { return $this->status === 'completed'; }
    public function isCancelled(): bool  { return $this->status === 'cancelled'; }
    public function isInProgress(): bool { return $this->status === 'in_progress'; }

    public function canBeCancelledByCustomer(): bool
    {
        $settings = BookingSetting::instance();
        if (!$settings->customer_can_cancel) return false;
        if ($this->isCancelled() || $this->isCompleted()) return false;

        // Check within cancellation window
        if ($this->scheduled_at && $settings->cancellation_window_hours > 0) {
            return now()->diffInHours($this->scheduled_at, false) >= $settings->cancellation_window_hours;
        }

        return true;
    }

    public function latestWorksheet()
    {
        return $this->worksheets()->latest()->first();
    }

    /**
     * Check if this service requires booking and whether the global override is active.
     */
    public function requiresBooking(): bool
    {
        $settings = BookingSetting::instance();
        if ($settings->override_booking_required) return true;
        return (bool) $this->service?->booking_required;
    }

    /**
     * Check if the customer linked to this booking is currently disqualified.
     */
    public function customerIsDisqualified(): bool
    {
        return BookingDisqualification::where('customer_id', $this->customer_id)
            ->where('is_active', true)
            ->exists();
    }
}