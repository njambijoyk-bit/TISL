<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BookingSetting extends Model
{
    public $timestamps = false;  // single-row settings table, we manage updated_at manually

    protected $primaryKey = 'id';

    protected $fillable = [
        'slot_duration_minutes',
        'booking_lead_time_hours',
        'max_advance_booking_days',
        'working_hours',
        'blackout_dates',
        'bookings_open',
        'allow_weekend_bookings',
        'allow_holiday_bookings',
        'override_booking_required',
        'customer_can_cancel',
        'cancellation_window_hours',
        'cancellation_fee_type',
        'cancellation_fee',
        'cancellation_currency_code',
        'cancellation_policy_template',
        'cancellation_policy_version',
        'require_policy_acceptance',
        'email_customer_on_booking',
        'email_admin_on_booking',
        'email_customer_on_cancel',
        'email_admin_on_cancel',
        'updated_by',
        'updated_at',
    ];

    protected $casts = [
        'working_hours'              => 'array',
        'blackout_dates'             => 'array',
        'bookings_open'              => 'boolean',
        'allow_weekend_bookings'     => 'boolean',
        'allow_holiday_bookings'     => 'boolean',
        'override_booking_required'  => 'boolean',
        'customer_can_cancel'        => 'boolean',
        'require_policy_acceptance'  => 'boolean',
        'email_customer_on_booking'  => 'boolean',
        'email_admin_on_booking'     => 'boolean',
        'email_customer_on_cancel'   => 'boolean',
        'email_admin_on_cancel'      => 'boolean',
        'cancellation_fee'           => 'decimal:2',
        'updated_at'                 => 'datetime',
    ];

    // ── Singleton accessor ──────────────────────────────────────────────────

    public static function instance(): self
    {
        return self::firstOrCreate(['id' => 1], [
            'slot_duration_minutes'     => 60,
            'booking_lead_time_hours'   => 24,
            'max_advance_booking_days'  => 90,
            'bookings_open'             => true,
            'allow_weekend_bookings'    => false,
            'allow_holiday_bookings'    => false,
            'override_booking_required' => false,
            'customer_can_cancel'       => false,
            'cancellation_window_hours' => 24,
            'cancellation_fee_type'     => 'flat',
            'cancellation_fee'          => 0,
            'cancellation_currency_code'=> 'KES',
            'require_policy_acceptance' => true,
            'email_customer_on_booking' => true,
            'email_admin_on_booking'    => true,
            'email_customer_on_cancel'  => true,
            'email_admin_on_cancel'     => true,
        ]);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Render the cancellation policy template with live values from DB.
     */
    public function renderPolicy(): string
    {
        $currency = Currency::where('code', $this->cancellation_currency_code)->first();
        $symbol   = $currency?->symbol ?? $this->cancellation_currency_code;

        $fee = $this->cancellation_fee_type === 'percent'
            ? $this->cancellation_fee . '%'
            : $symbol . ' ' . number_format($this->cancellation_fee, 2);

        return str_replace(
            ['{cancellation_fee}', '{cancellation_window_hours}', '{currency}', '{currency_symbol}'],
            [$fee, $this->cancellation_window_hours, $this->cancellation_currency_code, $symbol],
            $this->cancellation_policy_template ?? ''
        );
    }

    /**
     * Check whether a given date is available for booking.
     */
    public function isDateAvailable(\Carbon\Carbon $date): bool
    {
        if (!$this->bookings_open) return false;

        if (!$this->allow_weekend_bookings && $date->isWeekend()) return false;

        $blackouts = $this->blackout_dates ?? [];
        if (in_array($date->toDateString(), $blackouts)) return false;

        $dayKey  = strtolower($date->format('D')); // mon, tue ...
        $hours   = $this->working_hours ?? [];
        $dayConf = $hours[$dayKey] ?? null;

        if (!$dayConf || empty($dayConf['enabled'])) return false;

        return true;
    }

    /**
     * Return time slots for a given date as array of ['start', 'end'] strings.
     */
    public function slotsForDate(\Carbon\Carbon $date): array
    {
        if (!$this->isDateAvailable($date)) return [];

        $dayKey  = strtolower($date->format('D'));
        $hours   = $this->working_hours[$dayKey] ?? null;
        if (!$hours) return [];

        $open    = \Carbon\Carbon::parse($date->toDateString() . ' ' . $hours['open']);
        $close   = \Carbon\Carbon::parse($date->toDateString() . ' ' . $hours['close']);
        $minutes = (int) $this->slot_duration_minutes;

        $slots = [];
        $cursor = $open->copy();
        while ($cursor->copy()->addMinutes($minutes)->lte($close)) {
            $slots[] = [
                'start' => $cursor->format('H:i'),
                'end'   => $cursor->copy()->addMinutes($minutes)->format('H:i'),
            ];
            $cursor->addMinutes($minutes);
        }

        return $slots;
    }

    // ── Relationships ────────────────────────────────────────────────────────

    public function updatedBy()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}