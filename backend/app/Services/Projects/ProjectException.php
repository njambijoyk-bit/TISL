<?php

namespace App\Services\Projects;

/** Something a person asked of Projects that cannot be done, said in words they can act on. `status` is the HTTP status the screen gets. */
class ProjectException extends \RuntimeException
{
    /** @param array<string, mixed> $extra more for the screen, sent beside the message (why it is closed, when it opens) */
    public function __construct(string $message, public readonly int $status = 422, public readonly array $extra = [])
    {
        parent::__construct($message);
    }
}
