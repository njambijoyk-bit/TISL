<?php

namespace App\Services\Notify;

/** A refusal with a reason the person can read (a failed connection test, keys that were deleted, a version that does not exist). */
class NotifyException extends \RuntimeException
{
}
