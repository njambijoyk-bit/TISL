<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

/** Permission for one person to open one offering, from a date until a date, because of an invoice, a membership or a person at the desk. */
class Access extends Model
{
    public const SOURCES = ['invoice' => 'Paid enrolment', 'membership' => 'Membership', 'staff' => 'Given by staff'];

    protected $table = 'course_access';

    protected $guarded = [];

    protected $casts = ['starts_at' => 'datetime', 'ends_at' => 'datetime', 'revoked_at' => 'datetime'];

    public function active(?\Illuminate\Support\Carbon $at = null): bool
    {
        $at ??= now();

        return ! $this->revoked_at && $this->starts_at->lte($at) && (! $this->ends_at || $this->ends_at->gt($at));
    }
}
