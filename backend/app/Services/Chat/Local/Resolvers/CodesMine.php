<?php

namespace App\Services\Chat\Local\Resolvers;

use App\Models\Customer;
use App\Models\ReferralCode;
use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\ResolverResult;

final class CodesMine extends BaseResolver
{
    public function kinds(): array
    {
        return ['customer'];
    }

    public function run(CallerContext $c, array $slots): ResolverResult
    {
        return $this->guarded(function () use ($c) {
            $customer = $c->user ? Customer::where('user_id', $c->user->id)->first() : null;
            if (! $customer) {
                return ResolverResult::empty();
            }
            $lines = [];
            $mine = ReferralCode::where('customer_id', $customer->id)->where('type', 'customer_referral')->select('code', 'times_used', 'status', 'valid_until')->first();
            if ($mine) {
                $lines[] = "Your referral code: {$mine->code} · used {$mine->times_used} times · {$mine->status}" . ($mine->valid_until ? ' · expires ' . $mine->valid_until->format('j M Y') : '');
            }
            foreach (ReferralCode::where('target_customer_id', $customer->id)->whereIn('status', ['active', 'depleted', 'paused'])
                ->select('code', 'reward_type', 'reward_value', 'times_used', 'max_uses', 'valid_until', 'status')->latest()->limit(5)->get() as $p) {
                $lines[] = "{$p->code} · " . ($p->reward_type === 'percentage' ? "{$p->reward_value}% off" : $this->money($p->reward_value) . ' off') . ' · used ' . $p->times_used . ($p->max_uses ? "/{$p->max_uses}" : '') . " · {$p->status}" . ($p->valid_until ? ' · expires ' . $p->valid_until->format('j M Y') : '');
            }

            return $lines ? ResolverResult::ok($lines) : ResolverResult::empty();
        });
    }
}
