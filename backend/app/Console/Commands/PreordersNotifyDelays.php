<?php

namespace App\Console\Commands;

use App\Services\Preorders\PreorderDelayNotices;
use Illuminate\Console\Command;

/** Daily: tell customers whose paid preorder is past its promised date (first time, then every 14 days up to 3), and the staff who deliver, once. */
class PreordersNotifyDelays extends Command
{
    protected $signature = 'preorders:notify-delays {--dry-run : Only count who would be told}';

    protected $description = 'Tell customers (and staff) about paid preorders past their promised date';

    public function handle(PreorderDelayNotices $delays): int
    {
        $r = $delays->run(today(), (bool) $this->option('dry-run'));
        $this->info("{$r['late']} late preorder(s); {$r['told']} customer(s) " . ($this->option('dry-run') ? 'would be ' : '') . "told; {$r['staff_told']} staff told.");

        return self::SUCCESS;
    }
}
