<?php

namespace App\Console\Commands;

use App\Services\Memberships\MembershipService;
use Illuminate\Console\Command;

class MembershipsSweep extends Command
{
    protected $signature = 'memberships:sweep';

    protected $description = 'Memberships: invoice renewals, move late ones to past due and lapsed, end cancelled ones, resume paused ones, remind of payments.';

    public function handle(MembershipService $memberships): int
    {
        $r = $memberships->sweep();
        if (array_sum($r) > 0) {
            $this->info("Memberships: {$r['renewed']} renewal(s) invoiced, {$r['past_due']} past due, {$r['lapsed']} lapsed, {$r['ended']} ended, {$r['resumed']} resumed, {$r['released']} released, {$r['reminded']} reminder(s) sent.");
        }

        return self::SUCCESS;
    }
}
