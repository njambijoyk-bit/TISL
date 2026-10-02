<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** The one row of defaults that apply to every service: how late a cancellation or a move is "late". Amounts live on the fee ledgers. */
class ServiceSetting extends Model
{
    public $timestamps = false;

    protected $table = 'service_settings';

    protected $fillable = ['cancellation_window_hours', 'reschedule_window_hours', 'updated_by', 'updated_at'];

    protected $casts = ['cancellation_window_hours' => 'integer', 'reschedule_window_hours' => 'integer', 'updated_at' => 'datetime'];

    public const DEFAULTS = ['cancellation_window_hours' => 24, 'reschedule_window_hours' => 24];

    /** The settings row, or the built-in defaults until script 59 has been run. */
    public static function current(): self
    {
        if (! \Illuminate\Support\Facades\Schema::hasTable('service_settings')) {
            return new self(self::DEFAULTS);
        }

        return self::first() ?? self::create(self::DEFAULTS);
    }
}
