<?php

namespace App\Services\Chat\Local\Resolvers;

use App\Models\Customer;
use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\ResolverResult;

/** A customer's own orders (optionally one by number). Someone else's number looks the same as one that does not exist. */
final class OrdersMine extends BaseResolver
{
    public function kinds(): array
    {
        return ['customer'];
    }

    public function run(CallerContext $c, array $slots): ResolverResult
    {
        return $this->guarded(function () use ($c, $slots) {
            $customer = $c->user ? Customer::where('user_id', $c->user->id)->first() : null;
            if (! $customer) {
                return ResolverResult::empty();
            }
            $q = $this->named($this->salesDocs()->where('customer_id', $customer->id)->with('type:id,name'), $slots);
            $rows = $q->latest('date')->latest('id')->limit(8)->get();

            return $rows->isEmpty() ? ResolverResult::empty() : ResolverResult::ok($rows->map(fn ($o) => $this->orderLine($o))->all());
        });
    }
}
