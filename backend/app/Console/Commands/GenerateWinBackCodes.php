<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Services\PromoCodeService;

class GenerateWinBackCodes extends Command
{
    protected $signature   = 'promo:winback
                                {--dry-run : Preview without creating codes}
                                {--days=180 : Number of inactive days threshold}';
    protected $description = 'Generate win-back promo codes for customers inactive for 6+ months';

    public function handle(PromoCodeService $service): int
    {
        $days = (int) $this->option('days');
        $this->info("👋 Generating win-back codes for customers inactive {$days}+ days...");

        if ($this->option('dry-run')) {
            $this->warn('DRY RUN — no codes will be created.');
            $cutoff = now()->subDays($days);
            $count  = \App\Models\Customer::where('status', 'active')
                ->where('total_orders', '>', 0)
                ->where(function ($q) use ($cutoff) {
                    $q->where('last_order_date', '<', $cutoff)
                      ->orWhereNull('last_order_date');
                })
                ->count();
            $this->info("Would target {$count} inactive customer(s).");
            return self::SUCCESS;
        }

        $stats = $service->generateWinBackCodes();

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