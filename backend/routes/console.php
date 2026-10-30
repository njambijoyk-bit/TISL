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
Schedule::command('books:template-drafts')->dailyAt('06:00')->withoutOverlapping();   // repeating voucher templates that are due leave a draft in the inbox (nothing is posted)
Schedule::command('tenders:pq-reminders')->dailyAt('07:30')->withoutOverlapping();   // 30 days before a pre-qualification runs out
Schedule::command('promo:winback')->dailyAt('09:00');
Schedule::command('promo:expire')->dailyAt('23:00');
Schedule::command('auctions:close')->everyMinute();
Schedule::command('algorithm:compute-scores')->dailyAt('03:00');

Schedule::command('loyalty:expire-points')->dailyAt('02:00');
Schedule::command('giftvouchers:expire')->dailyAt('01:00');
Schedule::command('preorders:notify-delays')->dailyAt('09:20')->withoutOverlapping();   // paid preorders past their promised date
Schedule::call(fn () => \App\Services\Notify\SystemHealth::beat(\App\Services\Notify\SystemHealth::SCHEDULER))->everyMinute()->name('health-scheduler-beat');   // proof the scheduler is running (shown on Settings → Notifications)
Schedule::job(new \App\Jobs\QueueHeartbeat)->everyMinute()->name('health-queue-beat');   // proof a queue worker is running
Schedule::command('reminders:send')->hourlyAt(17)->withoutOverlapping();   // cart reminders and price-drop alerts (each off until the company switches it on)
Schedule::command('security:prune')->dailyAt('03:20')->withoutOverlapping();   // routine sign-in lines are kept 90 days, alerts two years
Schedule::command('notifications:prune')->dailyAt('03:30')->withoutOverlapping();   // delivery-log text older than 12 months is blanked
Schedule::call(fn () => app(\App\Services\Stock\BackInStock::class)->expireOld())->dailyAt('03:40')->name('stock-alerts-expire');   // "tell me when it is back" requests nobody acted on for a year
Schedule::command('events:remind')->everyFifteenMinutes()->withoutOverlapping();   // "tomorrow: your event" (only when the company has switched it on)
Schedule::command('events:release-holds')->everyMinute()->withoutOverlapping();   // ticket seats held for someone who did not pay go back on sale
Schedule::command('menus:chef-certs')->dailyAt('07:35')->withoutOverlapping();   // chefs' certificates that run out within a month, or have
Schedule::command('pos:sweep-self')->everyFiveMinutes()->withoutOverlapping();   // self-checkout orders whose M-Pesa payment never arrived are closed (after the prompt has had time to resolve)
Schedule::command('menus:sweep-orders')->everyFiveMinutes()->withoutOverlapping();   // online food orders whose payment never arrived are cancelled
Schedule::command('courses:live-reminders')->everyTenMinutes()->withoutOverlapping();   // courses: students are reminded of a live class a day before and within the hour before it starts
Schedule::command('courses:attendance-warnings')->hourlyAt(50)->withoutOverlapping();   // courses: students behind on attendance are told once
Schedule::command('courses:sweep')->hourlyAt(40)->withoutOverlapping();   // courses: unpaid enrolments are released, late instalments hold access back, payments are reminded
Schedule::command('memberships:sweep')->hourlyAt(20)->withoutOverlapping();   // memberships: renewals are invoiced, late ones go past due and lapse, payments are reminded
Schedule::command('menus:plans-run')->hourlyAt(25)->withoutOverlapping();   // meal plans: weeks billed ahead, unpaid weeks lapse, reminders, and each day's meals go to the kitchen after their cut-off
Schedule::command('menus:rota-watch')->everyTenMinutes()->withoutOverlapping();   // a rostered chef who has not signed in; swaps whose shift has started run out
Schedule::command('menus:rota-overtime')->dailyAt('05:40')->withoutOverlapping();   // chefs' overtime of the last weeks becomes entries for a manager to approve (only when the settings ask for approval)
Schedule::command('menus:rota-plan')->dailyAt('06:10')->withoutOverlapping();   // weekly patterns plan the coming weeks of the chef rota as drafts
Schedule::command('stock:expire')->dailyAt('00:10')->withoutOverlapping();   // expired batches, auto write-offs, expiry warnings

// ── Data backups ────────────────────────────────────────────────────────────
// Runs hourly; the command decides whether the configured frequency/time is due.
Schedule::command('backup:run')
    ->hourly()
    ->withoutOverlapping()
    ->runInBackground();

// ── Vault Archiver ────────────────────────────────────────────────────────────
Schedule::command('vault:archive')
    ->dailyAt('02:00')
    ->withoutOverlapping()
    ->runInBackground()
    ->onFailure(fn() => \Illuminate\Support\Facades\Log::error('Vault archiver scheduled run failed.'))
    ->onSuccess(fn() => \Illuminate\Support\Facades\Log::info('Vault archiver completed successfully.'));
Schedule::call(fn () => \App\Services\Security\EmailSignInLink::prune())->daily()->name('security-prune-email-links');   // emailed sign-in links that ran out yesterday
Schedule::command('security:release-resets')->everyFiveMinutes()->withoutOverlapping();   // carries out the "reset sign-in methods" requests whose waiting day is over
