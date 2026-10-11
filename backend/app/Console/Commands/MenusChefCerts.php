<?php

namespace App\Console\Commands;

use App\Services\Menus\ChefService;
use Illuminate\Console\Command;

class MenusChefCerts extends Command
{
    protected $signature = 'menus:chef-certs';

    protected $description = 'Warn about chefs\' certificates that run out within a month, and about ones that have run out.';

    public function handle(ChefService $chefs): int
    {
        $r = $chefs->sweepCerts();
        if ($r['warned'] || $r['expired']) {
            $this->info("Warned about {$r['warned']} certificate(s) running out; {$r['expired']} have run out.");
        }

        return self::SUCCESS;
    }
}
