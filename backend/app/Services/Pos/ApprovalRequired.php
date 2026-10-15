<?php

namespace App\Services\Pos;

use App\Services\Books\BooksException;

/** The till must ask a supervisor (name and PIN) before this goes ahead. $purpose says which approval: discount, return or void. */
class ApprovalRequired extends BooksException
{
    public function __construct(public readonly string $purpose, string $message)
    {
        parent::__construct($message);
    }
}
