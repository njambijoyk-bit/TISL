<?php

namespace App\Console\Commands;

use App\Services\Access\AccessSetup;
use Illuminate\Console\Command;

class AccessSeedCommand extends Command
{
    protected $signature = 'access:seed';

    protected $description = 'Load the clearance levels, roles and permissions, and give every existing user their role, clearance and branch access. Safe to re-run.';

    public function handle(): int
    {
        try {
            $done = AccessSetup::run();
        } catch (\RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }
        foreach ($done as $what => $n) {
            $this->line(str_pad($what, 16) . $n);
        }
        $this->info('Access is loaded.');

        return self::SUCCESS;
    }
}
