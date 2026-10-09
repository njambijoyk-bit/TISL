<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One message on one channel to one person, and what became of it (script 108). */
class NotificationDelivery extends Model
{
    public const STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed', 'to_send', 'skipped'];

    protected $guarded = [];

    protected $casts = ['sent_at' => 'datetime', 'delivered_at' => 'datetime', 'read_at' => 'datetime', 'attempts' => 'integer'];
}
