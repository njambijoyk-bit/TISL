<?php

namespace App\Http\Middleware;

use App\Services\CurrencyConversionService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Lets the client choose which currency prices are displayed in, via
 * ?currency=USD or an X-Currency: USD header. Unknown/inactive codes are
 * ignored and prices fall back to the base currency.
 */
class SetDisplayCurrency
{
    public function __construct(private CurrencyConversionService $currencies) {}

    public function handle(Request $request, Closure $next): Response
    {
        $code = $request->query('currency') ?? $request->header('X-Currency');

        $this->currencies->setDisplayCurrency($this->currencies->findByCode($code));

        return $next($request);
    }
}
