<?php

namespace App\Console\Commands;

use App\Services\Menus\RotaAttendance;
use App\Services\Menus\RotaSwaps;
use Illuminate\Console\Command;

class MenusRotaWatch extends Command
{
    protected $signature = 'menus:rota-watch';

    protected $description = 'Tell the managers about a rostered chef who has not signed in, and let swaps whose shift has started run out.';

    public function handle(RotaAttendance $attendance, RotaSwaps $swaps): int
    {
        $n = $attendance->watch();
        $m = $swaps->expire();
        if ($n || $m) {
            $this->info("{$n} chef(s) not signed in were reported; {$m} swap(s) ran out.");
        }

        return self::SUCCESS;
    }
}
