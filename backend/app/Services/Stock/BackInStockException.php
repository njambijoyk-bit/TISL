<?php

namespace App\Services\Stock;

/** Something a person can be told and fix: "it is in stock now", "too many alerts", "switched off", "which option?" (then `options` lists them). */
class BackInStockException extends \RuntimeException
{
    /** @param  array<int, array{id: int, name: string}>  $options */
    public function __construct(string $message, public array $options = [])
    {
        parent::__construct($message);
    }
}
