<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Services\PromoCodeService;
use App\Models\ReferralCode;

class ExpirePromoCodes extends Command
{
    protected $signature   = 'promo:expire
                                {--dry-run : Preview without making changes}';
    protected $description = 'Mark promo codes whose valid_until has passed as expired';

    public function handle(PromoCodeService $service): int
    {
        $this->info('⏰ Expiring outdated promo codes...');

        if ($this->option('dry-run')) {
            $count = ReferralCode::where('status', 'active')
                ->whereNotNull('valid_until')
                ->where('valid_until', '<', now())
                ->count();
            $this->info("Would expire {$count} code(s).");
            return self::SUCCESS;
        }

        $count = $service->expireOutdatedCodes();
        $this->info("✓ Expired {$count} code(s).");
        return self::SUCCESS;
    }
}