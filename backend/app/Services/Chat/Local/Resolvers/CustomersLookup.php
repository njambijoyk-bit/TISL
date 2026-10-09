<?php

namespace App\Services\Chat\Local\Resolvers;

use App\Models\Books\Voucher;
use App\Models\Customer;
use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\ResolverResult;

/** Allowlist: name, number, tier, order count. Never email, phone, credit or spend; those stay on the customer's page. */
final class CustomersLookup extends BaseResolver
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
        return ['email|custref'];
    }

    public function run(CallerContext $c, array $slots): ResolverResult
    {
        return $this->guarded(function () use ($c, $slots) {
            if (! $c->user) {
                return ResolverResult::denied();
            }
            $q = Customer::query()->select('id', 'first_name', 'last_name', 'customer_number', 'tier');
            if (! empty($slots['custref'])) {
                $q->where('customer_number', strtoupper($slots['custref']));
            } else {
                $q->where('email', strtolower($slots['email']));
            }
            if ($c->dataScope === 'assigned') {
                $q->where('assigned_sales_rep', $c->user->id);
            } elseif ($c->dataScope === 'own') {
                $q->where('created_by', $c->user->id);
            }
            $cust = $q->first();
            if (! $cust) {
                return ResolverResult::empty();
            }
            $orders = $this->salesDocs()->where('customer_id', $cust->id)->count();

            return ResolverResult::ok([trim("{$cust->first_name} {$cust->last_name}") . " · {$cust->customer_number} · Tier " . ucfirst((string) ($cust->tier ?: 'bronze')) . " · {$orders} orders"]);
        });
    }
}
