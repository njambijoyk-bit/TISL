<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A student enrolled in an offering. The money is in the books: this keeps the ids and a copy of what has been paid. */
class Enrolment extends Model
{
    public const STATUSES = ['pending' => 'Waiting for payment', 'active' => 'Enrolled', 'completed' => 'Completed', 'cancelled' => 'Cancelled', 'refunded' => 'Refunded'];

    protected $table = 'course_enrolments';

    protected $guarded = [];

    protected $casts = ['total' => 'decimal:2', 'paid_total' => 'decimal:2', 'discount_pct' => 'decimal:2', 'access_paused' => 'boolean', 'expires_at' => 'datetime', 'activated_at' => 'datetime', 'cancelled_at' => 'datetime', 'refunded_at' => 'datetime'];

    public function lines(): HasMany
    {
        return $this->hasMany(EnrolmentLine::class, 'enrolment_id')->orderBy('id');
    }

    public function instalments(): HasMany
    {
        return $this->hasMany(Instalment::class, 'enrolment_id')->orderBy('seq');
    }

    public function balance(): float
    {
        return max(0.0, round((float) $this->total - (float) $this->paid_total, 2));
    }

    /** Counts as a place taken. */
    public function holdsPlace(): bool
    {
        return in_array($this->status, ['pending', 'active', 'completed'], true);
    }
}
