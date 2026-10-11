<?php

namespace App\Services\Security\StepUp;

use RuntimeException;

/** A step-up answer that is refused, with something plain to tell the person and a short reason code. */
final class StepUpException extends RuntimeException
{
    public function __construct(string $message, public readonly string $reason, public readonly int $httpStatus = 422, ?\Throwable $previous = null)
    {
        parent::__construct($message, 0, $previous);
    }
}
