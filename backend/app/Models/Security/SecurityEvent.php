<?php

namespace App\Models\Security;

use Illuminate\Database\Eloquent\Model;

/** One line of the security log. Lines are only ever added. */
class SecurityEvent extends Model
{
    public $timestamps = false;

    protected $table = 'security_events';

    protected $fillable = ['subject_type', 'subject_id', 'event', 'severity', 'email_tried', 'ip', 'user_agent', 'detail', 'created_at'];

    protected $casts = ['detail' => 'array', 'created_at' => 'datetime'];
}
