<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Register the role middleware alias
        $middleware->alias([
            'account' => \App\Http\Middleware\CheckAccount::class,
            'permission' => \App\Http\Middleware\CheckPermission::class,
            'applicant' => \App\Http\Middleware\EnsureApplicant::class,
            'module' => \App\Http\Middleware\EnsureModuleActive::class,
            'exchange.key' => \App\Http\Middleware\ExchangeKeyAuth::class,
        ]);

        $middleware->append(\App\Http\Middleware\SecurityHeaders::class);   // nosniff, no referrer, HSTS over HTTPS, JSON may not be framed, sign-in answers are never cached

        // Behind a load balancer or CDN the visitor's real address arrives in X-Forwarded-For; trust it only from the proxies named here (TRUSTED_PROXIES=10.0.0.1,10.0.0.2 or * for all). Left empty, the address seen is the one that connected, and the sign-in limits count per real caller instead of per proxy.
        if ($proxies = env('TRUSTED_PROXIES')) {
            $middleware->trustProxies(at: $proxies === '*' ? '*' : array_map('trim', explode(',', $proxies)));
        }

        // ?currency=USD / X-Currency header -> display currency for every API response
        // ?location=<id> / X-Location header -> branch in context (multi-location)
        $middleware->api(prepend: [
            \App\Http\Middleware\CookieSession::class,   // the sign-in cookie becomes the Authorization header the rest of the app reads, once the CSRF code and origin check out
        ], append: [
            \App\Http\Middleware\SetDisplayCurrency::class,
            \App\Http\Middleware\SetLocationContext::class,
            \App\Http\Middleware\SlideSession::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // a change that came in on the sign-in cookie without the right CSRF code or origin is treated as not signed in; say why, so the website can fetch a fresh code and try once more
        $exceptions->render(function (\Illuminate\Auth\AuthenticationException $e, \Illuminate\Http\Request $request) {
            if ($request->is('api/*') && $request->attributes->get('csrf_failed')) {
                return response()->json(['message' => 'Your session needs refreshing. Please try again.', 'csrf' => true], 419);
            }
        });
    })->create();