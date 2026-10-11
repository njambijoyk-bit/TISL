<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** A premium rule: hours worked at night, on certain weekdays or on public holidays are paid an extra percentage and/or an amount per hour on top of the normal hourly rate. */
class Premium extends Model
{
    public const KINDS = ['night' => 'Night hours', 'weekend' => 'Weekend days', 'holiday' => 'Public holidays'];

    protected $table = 'menus_premiums';

    protected $guarded = [];

    protected $casts = ['extra_pct' => 'decimal:2', 'flat_per_hour' => 'decimal:2', 'is_active' => 'boolean'];

    /** @return int[] the ISO weekdays of a weekend rule */
    public function days(): array
    {
        return array_values(array_filter(array_map('intval', explode(',', (string) $this->weekdays)), fn ($d) => $d >= 1 && $d <= 7));
    }
}
