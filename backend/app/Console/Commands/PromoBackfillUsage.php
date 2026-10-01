<?php

namespace App\Console\Commands;

use App\Services\Books\PromoUsageService;
use Illuminate\Console\Command;

class PromoBackfillUsage extends Command
{
    protected $signature = 'promo:backfill-usage {--dry-run : only count them}';

    protected $description = 'Log the promo code uses of vouchers that were saved before promo usage was recorded on vouchers';

    public function handle(PromoUsageService $promos): int
    {
        $n = $promos->backfill((bool) $this->option('dry-run'));
        $this->info(($this->option('dry-run') ? 'Would log ' : 'Logged ') . "{$n} voucher(s).");

        return self::SUCCESS;
    }
}
