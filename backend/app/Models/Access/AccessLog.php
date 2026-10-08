<?php

namespace App\Models\Access;

use Illuminate\Database\Eloquent\Model;

/** Who changed whose roles or access, and what the engine would have refused while it was only logging. */
class AccessLog extends Model
{
    protected $table = 'access_log';
    public $timestamps = false;
    protected $fillable = ['actor_id', 'subject_user_id', 'action', 'details', 'ip', 'created_at'];
    protected $casts = ['details' => 'array', 'created_at' => 'datetime'];

    public static function record(?int $actor, ?int $subject, string $action, array $details = []): void
    {
        try {
            static::create(['actor_id' => $actor, 'subject_user_id' => $subject, 'action' => $action, 'details' => $details ?: null, 'ip' => request()?->ip(), 'created_at' => now()]);
        } catch (\Throwable) {
            // the log must never stop the action it describes
        }
    }
}
