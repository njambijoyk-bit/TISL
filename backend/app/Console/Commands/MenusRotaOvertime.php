<?php

namespace App\Console\Commands;

use App\Services\Menus\RotaOvertime;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class MenusRotaOvertime extends Command
{
    protected $signature = 'menus:rota-overtime {--days=45 : how far back to look}';

    protected $description = 'Turn chefs\' overtime of the last weeks into entries a manager approves before payroll (only when Menus settings ask for approval).';

    public function handle(RotaOvertime $overtime): int
    {
        if (! $overtime->required()) {
            return self::SUCCESS;
        }
        $tz = (string) config('app.timezone', 'Africa/Nairobi');
        $n = $overtime->sync(Carbon::now($tz)->subDays(max(1, (int) $this->option('days')))->startOfDay(), Carbon::now($tz)->startOfDay(), true);
        if ($n) {
            $this->info("{$n} overtime day(s) now wait for approval.");
        }

        return self::SUCCESS;
    }
}
