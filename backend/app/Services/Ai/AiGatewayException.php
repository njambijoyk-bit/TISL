<?php

namespace App\Services\Ai;

/** A model call that failed. `retryable` = another key (or a moment later) may work: busy, over quota, a server error, no connection. */
class AiGatewayException extends \RuntimeException
{
    public function __construct(string $message, public readonly int $status = 0, public readonly bool $retryable = false, public readonly string $kind = 'error')
    {
        parent::__construct($message);
    }
}
