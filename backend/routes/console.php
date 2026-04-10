<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// ── Promo code automation ─────────────────────────────────────────────────────
Schedule::command('promo:birthday')->dailyAt('08:00');
Schedule::command('promo:winback')->dailyAt('09:00');
Schedule::command('promo:expire')->dailyAt('23:00');