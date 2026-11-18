<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Notify\Notifier;

/**
 * Projects tells people things through the Core notifier and nowhere else: this module holds no mail or WhatsApp code.
 * A message that cannot be sent never stops the work that caused it.
 */
class ProjectNotices
{
    public const ACCESS = 'project_access';
    public const SECURITY = 'project_security';
    public const FOLLOW_UP = 'project_follow_up';
    public const TASK = 'project_task';
    public const KEY_DATE = 'project_key_date';
    public const TIMESHEET = 'project_timesheet';
    public const MESSAGE = 'project_message';
    public const FOLLOW = 'project_follow';
    public const MEETING = 'project_meeting';
    public const PEOPLE = 'project_people';
    public const CASEBOOK = 'project_casebook';
    public const MEETING_INVITE = 'project_meeting_invite';

    /** @param iterable<User>|User|null $to */
    public static function tell(iterable|User|null $to, string $type, string $title, string $message, ?string $path = null, ?string $linkText = null): void
    {
        $people = $to instanceof User ? [$to] : ($to ?? []);
        foreach ($people as $person) {
            try {
                app(Notifier::class)->send($person, $type, $title, $message, $path ? ['action_url' => $path, 'action_text' => $linkText ?? 'Open it'] : []);
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }
}
