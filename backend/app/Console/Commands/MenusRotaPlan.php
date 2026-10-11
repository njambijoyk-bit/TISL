<?php

namespace App\Console\Commands;

use App\Services\Menus\RotaPatterns;
use Illuminate\Console\Command;

class MenusRotaPlan extends Command
{
    protected $signature = 'menus:rota-plan';

    protected $description = 'Plan the coming weeks of the chef rota from the weekly patterns, as drafts.';

    public function handle(RotaPatterns $patterns): int
    {
        $n = $patterns->planAhead();
        if ($n) {
            $this->info("Planned {$n} draft shift(s) from the weekly patterns.");
        }

        return self::SUCCESS;
    }
}
