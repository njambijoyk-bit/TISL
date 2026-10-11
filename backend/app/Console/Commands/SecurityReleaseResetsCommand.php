<?php

namespace App\Console\Commands;

use App\Services\Security\SignInReset;
use Illuminate\Console\Command;

/** Carries out the "reset sign-in methods" requests whose waiting day is over (the scheduler runs it every few minutes). */
class SecurityReleaseResetsCommand extends Command
{
    protected $signature = 'security:release-resets';

    protected $description = 'Carry out the sign-in method resets whose waiting day is over';

    public function handle(SignInReset $resets): int
    {
        $n = $resets->executeDue();
        $this->info($n ? "{$n} reset(s) carried out." : 'Nothing was due.');

        return self::SUCCESS;
    }
}
