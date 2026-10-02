<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

/** Working hours, grace period and working days. Built-in defaults until script 63 is run. */
class AttendanceSetting extends Model
{
    protected $fillable = ['work_start', 'work_end', 'grace_minutes', 'workdays', 'updated_by'];

    public const DEFAULTS = ['work_start' => '08:00:00', 'work_end' => '17:00:00', 'grace_minutes' => 15, 'workdays' => '1,2,3,4,5'];

    public static function current(): self
    {
        if (! Schema::hasTable('attendance_settings')) {
            return new self(self::DEFAULTS);
        }

        return self::first() ?? self::create(self::DEFAULTS);
    }

    /** @return int[] 0 = Sunday */
    public function days(): array
    {
        return array_map('intval', array_filter(explode(',', (string) $this->workdays), fn ($d) => $d !== ''));
    }
}
