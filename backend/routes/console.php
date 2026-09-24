<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use App\Console\Commands\VaultArchiveCommand;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// ── Promo code automation ─────────────────────────────────────────────────────
Schedule::command('promo:birthday')->dailyAt('08:00');
Schedule::command('promo:winback')->dailyAt('09:00');
Schedule::command('promo:expire')->dailyAt('23:00');
Schedule::command('auctions:close')->everyMinute();
Schedule::command('algorithm:compute-scores')->dailyAt('03:00');

Schedule::command('loyalty:expire-points')->monthly();

// ── Vault Archiver ────────────────────────────────────────────────────────────
Schedule::command('vault:archive')
    ->dailyAt('02:00')
    ->withoutOverlapping()
    ->runInBackground()
    ->onFailure(fn() => \Illuminate\Support\Facades\Log::error('Vault archiver scheduled run failed.'))
    ->onSuccess(fn() => \Illuminate\Support\Facades\Log::info('Vault archiver completed successfully.'));