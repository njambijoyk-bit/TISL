<?php

namespace App\Services\Chat\Local\Resolvers;

use App\Models\Customer;
use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\ResolverResult;

/** Staff look-up of one order. Needs customers.view; then the caller's data scope and branch limits narrow what can be found. */
final class OrdersLookup extends BaseResolver
{
    public function kinds(): array
    {
        return ['staff'];
    }

    public function requires(): array
    {
        return ['customers.view'];
    }

    public function needs(): array
    {
        return ['ordref|ordnum'];
    }

    public function run(CallerContext $c, array $slots): ResolverResult
    {
        return $this->guarded(function () use ($c, $slots) {
            if (! $c->user) {
                return ResolverResult::denied();
            }
            $q = $this->named($this->salesDocs()->with(['type:id,name', 'customer:id,first_name,last_name,customer_number']), $slots);
            if ($c->locationIds !== null) {
                $q->where(fn ($w) => $w->whereIn('location_id', $c->locationIds)->orWhereNull('location_id'));
            }
            if ($c->dataScope === 'assigned') {
                $q->whereIn('customer_id', Customer::where('assigned_sales_rep', $c->user->id)->select('id'));
            } elseif ($c->dataScope === 'own') {
                $q->where('created_by', $c->user->id);
            }
            $o = $q->first();
            if (! $o) {
                return ResolverResult::empty();       // not found and not yours read the same
            }
            $who = $o->customer ? trim("{$o->customer->first_name} {$o->customer->last_name}") . " ({$o->customer->customer_number})" : ($o->party_name ?: 'no customer');

            return ResolverResult::ok([$this->orderLine($o) . " · {$who}"]);
        });
    }
}
