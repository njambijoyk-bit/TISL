<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

/** The one row of Engagement Engine settings: the master switch, what counts as "bought", and the report settings. Who may do what is in engagement_rules. */
class EngagementSetting extends Model
{
    public $timestamps = false;

    protected $table = 'engagement_settings';

    protected $fillable = ['enabled', 'preset', 'paid_required', 'delivered_required', 'service_completed_counts', 'service_late_fee_counts', 'service_noshow_counts', 'service_free_cancel_counts',
        'auto_hide_reports', 'notify_author', 'notify_approvers', 'blocked_words', 'updated_by', 'updated_at'];

    protected $casts = ['enabled' => 'boolean', 'paid_required' => 'boolean', 'delivered_required' => 'boolean', 'service_completed_counts' => 'boolean', 'service_late_fee_counts' => 'boolean',
        'service_noshow_counts' => 'boolean', 'service_free_cancel_counts' => 'boolean', 'auto_hide_reports' => 'integer', 'notify_author' => 'boolean', 'blocked_words' => 'array', 'updated_at' => 'datetime'];

    public const DEFAULTS = ['enabled' => true, 'preset' => 'verified_buyers', 'paid_required' => true, 'delivered_required' => false, 'service_completed_counts' => true, 'service_late_fee_counts' => false,
        'service_noshow_counts' => false, 'service_free_cancel_counts' => false, 'auto_hide_reports' => 0, 'notify_author' => true, 'notify_approvers' => 'daily', 'blocked_words' => []];

    /** True once script 86 has been run. */
    public static function ready(): bool
    {
        return Schema::hasTable('engagement_settings');
    }

    /** The settings row, or the built-in defaults until script 86 has been run. */
    public static function current(): self
    {
        if (! self::ready()) {
            return new self(self::DEFAULTS);
        }

        return self::find(1) ?? tap(new self(self::DEFAULTS + ['updated_at' => now()]), fn ($s) => $s->forceFill(['id' => 1])->save());
    }
}
