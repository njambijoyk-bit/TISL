<?php

namespace App\Services\Projects;

/** Something a person asked of Projects that cannot be done, said in words they can act on. `status` is the HTTP status the screen gets. */
class ProjectException extends \RuntimeException
{
    public function __construct(string $message, public readonly int $status = 422)
    {
        parent::__construct($message);
    }
}
