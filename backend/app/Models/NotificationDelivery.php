<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One message on one channel to one person, and what became of it (script 108). */
class NotificationDelivery extends Model
{
    /** Has script 110 been run (the column automatic WhatsApp needs)? Without it messages wait for a person, as before. */
    public static function hasPayload(): bool
    {
        return \Illuminate\Support\Facades\Schema::hasColumn('notification_deliveries', 'payload');
    }

    public const STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed', 'to_send', 'skipped'];

    protected $guarded = [];

    protected $casts = ['payload' => 'array', 'sent_at' => 'datetime', 'delivered_at' => 'datetime', 'read_at' => 'datetime', 'attempts' => 'integer'];
}
