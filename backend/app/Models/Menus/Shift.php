<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A chef working part of a day at a branch. A draft is the manager's plan; a published shift is what the chef has been told. */
class Shift extends Model
{
    protected $table = 'menus_shifts';

    protected $guarded = [];

    protected $casts = ['shift_date' => 'date:Y-m-d', 'published_at' => 'datetime'];

    public function chef(): BelongsTo
    {
        return $this->belongsTo(Chef::class);
    }

    /** The date and time this shift starts and ends, in the shop's time zone. @return array{0: \Illuminate\Support\Carbon, 1: \Illuminate\Support\Carbon} */
    public function span(): array
    {
        $tz = (string) config('app.timezone', 'Africa/Nairobi');
        $day = $this->shift_date->format('Y-m-d');

        return [\Illuminate\Support\Carbon::parse($day.' '.substr((string) $this->starts_at, 0, 5), $tz), \Illuminate\Support\Carbon::parse($day.' '.substr((string) $this->ends_at, 0, 5), $tz)];
    }

    public function hours(): float
    {
        [$a, $b] = $this->span();

        return round($a->diffInMinutes($b) / 60, 2);
    }
}
