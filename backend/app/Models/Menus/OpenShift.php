<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A shift nobody holds yet (or one a chef gave back). Any chef who is free and set up for the station may claim it. */
class OpenShift extends Model
{
    protected $table = 'menus_open_shifts';

    protected $guarded = [];

    protected $casts = ['shift_date' => 'date:Y-m-d'];

    public function claims(): HasMany
    {
        return $this->hasMany(OpenClaim::class, 'open_id');
    }

    /** @return array{0: \Illuminate\Support\Carbon, 1: \Illuminate\Support\Carbon} */
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
