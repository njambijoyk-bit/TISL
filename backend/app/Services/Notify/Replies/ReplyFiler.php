<?php

namespace App\Services\Notify\Replies;

/**
 * What a module registers to take replies to the messages it sent (docs/PROJECTS_STAGE6_SPEC.md, build 6.5). A route is a row of
 * `notification_reply_routes`: module, subject_type, subject_id, contact (the address or number it was sent to), contact_ref (the module's own
 * reference for that person) and channel.
 */
interface ReplyFiler
{
    /**
     * File a reply against what the route points at. @param array{channel: string, from: string, from_name: ?string, subject: ?string, body: string, received_at: string} $reply
     * @return bool false when the thing it points at is gone or no longer takes replies (the reply then waits)
     */
    public function file(object $route, array $reply): bool;

    /** Does what the route points at still take replies (a WhatsApp message is filed only into something open)? */
    public function isOpen(object $route): bool;

    /** A line for the waiting list: what the route points at, in words. */
    public function describe(object $route): ?string;
}
