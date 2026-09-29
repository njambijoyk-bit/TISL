<?php

namespace App\Services\Books;

use RuntimeException;

/** A business-rule failure in the books (unbalanced voucher, locked period, no stock…). Surfaces as a 422 with the message. */
class BooksException extends RuntimeException
{
}
