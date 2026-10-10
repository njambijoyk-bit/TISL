<?php

namespace App\Services\Security\Passkeys;

use RuntimeException;

/** Something about a passkey did not check out. The message is safe to show the person; `reason` is for the log. */
class PasskeyException extends RuntimeException
{
    public function __construct(string $message, public readonly string $reason = 'invalid', public readonly int $httpStatus = 422, ?\Throwable $previous = null)
    {
        parent::__construct($message, 0, $previous);
    }
}
