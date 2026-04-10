<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Support\Facades\URL;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        ResetPassword::createUrlUsing(function ($user, string $token) {
            return env('FRONTEND_URL', 'http://localhost:5173')
                . '/reset-password?token=' . $token
                . '&email=' . urlencode($user->email);
        });

        // Email verification URL — points to frontend, not a Laravel route
        VerifyEmail::createUrlUsing(function ($notifiable) {
            $frontendUrl = env('FRONTEND_URL', 'http://localhost:5173');

            $verifyUrl = URL::temporarySignedRoute(
                'api.verify.email',
                now()->addMinutes(60),
                [
                    'id'   => $notifiable->getKey(),
                    'hash' => sha1($notifiable->getEmailForVerification()),
                ]
            );

            // Extract query string from backend signed URL and pass to frontend
            $parsed = parse_url($verifyUrl);
            parse_str($parsed['query'] ?? '', $params);

            return $frontendUrl . '/verify-email?' . http_build_query([
                'id'         => $notifiable->getKey(),
                'hash'       => sha1($notifiable->getEmailForVerification()),
                'expires'    => $params['expires'] ?? '',
                'signature'  => $params['signature'] ?? '',
            ]);
        });
    }
}
