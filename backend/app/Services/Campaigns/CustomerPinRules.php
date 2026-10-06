<?php

namespace App\Services\Campaigns;

use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;

/**
 * Whether customers may add their own pins, and how many a month. Staff set both (campaign_settings, one row). Adding a pin writes a line to
 * campaign_pin_uploads, so the monthly count still holds when a customer deletes a pin afterwards. Until script 90 is run, everything is allowed.
 */
class CustomerPinRules
{
    /** @return array{enabled:bool,per_month:int} */
    public function settings(): array
    {
        try {
            $r = DB::table('campaign_settings')->first();
        } catch (\Throwable) {
            $r = null;
        }

        return ['enabled' => $r ? (bool) $r->customer_pins_enabled : true, 'per_month' => $r ? (int) $r->customer_pins_per_month : 0];
    }

    public function update(array $d, User $by): array
    {
        $row = ['customer_pins_enabled' => (bool) ($d['enabled'] ?? true), 'customer_pins_per_month' => max(0, min(100000, (int) ($d['per_month'] ?? 0))), 'updated_by' => $by->id, 'updated_at' => now()];
        if (DB::table('campaign_settings')->exists()) {
            DB::table('campaign_settings')->update($row);
        } else {
            DB::table('campaign_settings')->insert($row + ['created_at' => now()]);
        }

        return $this->settings();
    }

    public function usedThisMonth(User $u): int
    {
        try {
            return DB::table('campaign_pin_uploads')->where('user_id', $u->id)->where('created_at', '>=', now()->startOfMonth())->count();
        } catch (\Throwable) {
            return 0;
        }
    }

    /** @return array{enabled:bool,limit:int,used:int,remaining:?int,allowed:bool} what a customer sees about adding pins */
    public function status(User $u): array
    {
        $s = $this->settings();
        $used = $this->usedThisMonth($u);
        $remaining = $s['per_month'] > 0 ? max(0, $s['per_month'] - $used) : null;

        return ['enabled' => $s['enabled'], 'limit' => $s['per_month'], 'used' => $used, 'remaining' => $remaining, 'allowed' => $s['enabled'] && ($remaining === null || $remaining > 0)];
    }

    /** @throws BooksException with the reason, when the customer may not add another pin */
    public function assertAllowed(User $u): void
    {
        $st = $this->status($u);
        if (! $st['enabled']) {
            throw new BooksException('Adding your own pins is switched off right now. You can still save pins from Discover to your boards.');
        }
        if (! $st['allowed']) {
            throw new BooksException("You have added {$st['used']} pins this month, which is the limit. You can add more next month.");
        }
    }

    public function record(User $u, int $pinId): void
    {
        try {
            DB::table('campaign_pin_uploads')->insert(['user_id' => $u->id, 'pin_id' => $pinId, 'created_at' => now()]);
        } catch (\Throwable) {
            // script 90 not run yet: nothing to count
        }
    }
}
