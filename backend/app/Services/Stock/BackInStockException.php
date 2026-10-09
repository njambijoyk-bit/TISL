<?php

namespace App\Services\Stock;

/** Something a person can be told and fix: "it is in stock now", "too many alerts", "switched off". */
class BackInStockException extends \RuntimeException
{
}
