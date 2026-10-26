<?php

namespace App\Services\BulkImport;

use RuntimeException;

/** A record the import refuses, with a stable code the screen can show next to the message. */
class RowProblem extends RuntimeException
{
    public const REQUIRED = 'required';
    public const INVALID = 'invalid_value';
    public const NOT_ALLOWED = 'not_allowed';
    public const EXISTS = 'already_exists';
    public const MISSING_REF = 'unknown_reference';
    public const DUPLICATE = 'duplicate_in_file';
    public const CONFLICT = 'conflicting_values';
    public const REJECTED = 'rejected';

    /** @param ?int $row the file row to blame when it is not the record's first one (a bad line of a recipe) */
    public function __construct(string $message, public readonly string $codeName = self::REJECTED, public readonly ?string $column = null, public readonly ?int $row = null)
    {
        parent::__construct($message);
    }
}
