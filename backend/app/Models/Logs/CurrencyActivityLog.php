<?php

namespace App\Models\Logs;

/**
 * Append-only log for everything currency: rate and base changes on
 * currencies, customer currency assignments / changes, and saved
 * conversions (the full snapshot, so any of them can be reversed later).
 */
class CurrencyActivityLog extends ActivityLog
{
    protected $table = 'currency_activity_logs';
}
