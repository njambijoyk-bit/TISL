<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * A SKU, a voucher number, or a numbering prefix or suffix must not contain the symbol /: these appear in web addresses
 * (/products/12-SKU, /orders/WNKJ-SO-00019), where a slash would be taken as a new part of the path.
 */
class NoSlash implements ValidationRule
{
    public function __construct(private string $what = 'This') {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (is_string($value) && str_contains($value, '/')) {
            $fail("{$this->what} cannot contain the symbol /.");
        }
    }
}
