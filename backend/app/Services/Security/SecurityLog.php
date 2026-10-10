<?php

namespace App\Services\Security;

use App\Models\Security\SecurityEvent;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

/** The one log of sign-in events. Writing to it must never get in the way of what it records: a failure here is swallowed, and before database script 123 is run it does nothing. */
final class SecurityLog
{
    public const INFO = 'info';
    public const NOTICE = 'notice';
    public const WARNING = 'warning';
    public const ALERT = 'alert';

    private static ?bool $ready = null;

    public static function ready(): bool
    {
        return self::$ready ??= Schema::hasTable('security_events');
    }

    public static function forget(): void
    {
        self::$ready = null;
    }

    /** @param array<string, mixed> $detail */
    public static function record(string $event, ?Model $subject = null, ?Request $request = null, array $detail = [], string $severity = self::INFO, ?string $emailTried = null): void
    {
        try {
            if (! self::ready()) {
                return;
            }
            SecurityEvent::create(['subject_type' => $subject ? self::kind($subject) : null, 'subject_id' => $subject?->getKey(), 'event' => $event, 'severity' => $severity,
                'email_tried' => $emailTried ? mb_substr(strtolower(trim($emailTried)), 0, 190) : null, 'ip' => $request?->ip(), 'user_agent' => $request?->userAgent() ? mb_substr($request->userAgent(), 0, 255) : null,
                'detail' => $detail ?: null, 'created_at' => now()]);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** 'user' for a login account, 'applicant' for a job applicant. */
    public static function kind(Model $subject): string
    {
        return class_basename($subject) === 'Applicant' ? 'applicant' : 'user';
    }
}
