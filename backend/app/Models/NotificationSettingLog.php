<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Http\Request;

/** Append-only: who did what to the notification settings or the messages, when and from where. Never holds a secret value. The app can not change or delete a row. */
class NotificationSettingLog extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = [];

    protected $casts = ['context' => 'array'];

    protected static function booted(): void
    {
        static::updating(fn () => false);
        static::deleting(fn () => false);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public static function write(string $event, ?User $by, ?string $part, ?int $versionId, string $summary, array $context = []): self
    {
        return static::create(['user_id' => $by?->id, 'event' => $event, 'part' => $part, 'version_id' => $versionId, 'summary' => mb_substr($summary, 0, 500),
            'context' => $context ?: null, 'ip' => app()->bound('request') ? app(Request::class)->ip() : null]);
    }
}
