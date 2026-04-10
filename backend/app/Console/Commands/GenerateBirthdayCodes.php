<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Services\PromoCodeService;

class GenerateBirthdayCodes extends Command
{
    protected $signature   = 'promo:birthday
                                {--dry-run : Preview without creating codes}';
    protected $description = 'Generate birthday promo codes for customers whose birthday is in 7 days';

    public function handle(PromoCodeService $service): int
    {
        $this->info('🎂 Generating birthday promo codes...');

        if ($this->option('dry-run')) {
            $this->warn('DRY RUN — no codes will be created.');
        }

        if ($this->option('dry-run')) {
            $targetDate = now()->addDays(7);
            $count = \App\Models\Customer::whereNotNull('birthday')
                ->whereMonth('birthday', $targetDate->month)
                ->whereDay('birthday',   $targetDate->day)
                ->where('status', 'active')
                ->count();
            $this->info("Would generate codes for {$count} customer(s).");
            return self::SUCCESS;
        }

        $stats = $service->generateBirthdayCodes();

        $this->table(
            ['Generated', 'Skipped', 'Errors'],
            [[$stats['generated'], $stats['skipped'], $stats['errors']]]
        );

        if ($stats['errors'] > 0) {
            $this->warn("⚠ {$stats['errors']} error(s) occurred. Check logs.");
        }

        $this->info('✓ Done.');
        return self::SUCCESS;
    }
}