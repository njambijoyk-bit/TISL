<?php

namespace App\Services\BulkImport\Formats;

use RuntimeException;

/** The file itself can not be read (wrong format, broken, too big), before any row is looked at. */
class FileProblem extends RuntimeException
{
    public function __construct(string $message, public readonly string $codeName = 'unreadable_file')
    {
        parent::__construct($message);
    }
}
