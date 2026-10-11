<?php

namespace App\Console\Commands;

use App\Services\Menus\RotaAttendance;
use App\Services\Menus\RotaBoard;
use App\Services\Menus\RotaSwaps;
use Illuminate\Console\Command;

class MenusRotaWatch extends Command
{
    protected $signature = 'menus:rota-watch';

    protected $description = 'Tell the managers about a rostered chef who has not signed in, and let swaps and open shifts that have started run out.';

    public function handle(RotaAttendance $attendance, RotaSwaps $swaps, RotaBoard $board): int
    {
        $n = $attendance->watch();
        $m = $swaps->expire() + $board->expire();
        if ($n || $m) {
            $this->info("{$n} chef(s) not signed in were reported; {$m} swap(s) or open shift(s) ran out.");
        }

        return self::SUCCESS;
    }
}
