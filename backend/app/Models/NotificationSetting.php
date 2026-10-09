<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** The one row of LIVE notification settings (script 108). Read and changed only through App\Services\Notify\NotifySettings, which keeps a version and a log line for every change. */
class NotificationSetting extends Model
{
    protected $table = 'notification_settings';

    public $incrementing = false;

    protected $guarded = [];

    protected $casts = ['general' => 'array', 'types' => 'array', 'versions' => 'array'];

    protected $hidden = ['email_enc', 'whatsapp_enc'];
}
