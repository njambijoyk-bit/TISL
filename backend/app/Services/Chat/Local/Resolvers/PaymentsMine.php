<?php

namespace App\Services\Chat\Local\Resolvers;

use App\Models\Customer;
use App\Models\Payment;
use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\ResolverResult;

final class PaymentsMine extends BaseResolver
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
            $rows = Payment::where('customer_id', $customer->id)
                ->select('payment_number', 'status', 'amount_expected', 'mpesa_amount_confirmed', 'mpesa_receipt_number', 'failure_reason', 'initiated_at')
                ->latest()->limit(5)->get();

            return $rows->isEmpty() ? ResolverResult::empty() : ResolverResult::ok($rows->map(fn ($p) => "{$p->payment_number} · " . ($p->status === 'confirmed'
                ? 'Paid ' . $this->money($p->mpesa_amount_confirmed) . " · receipt {$p->mpesa_receipt_number}"
                : ucfirst((string) $p->status) . ' · expected ' . $this->money($p->amount_expected) . ($p->failure_reason ? " · {$p->failure_reason}" : '')) . ' · ' . $p->initiated_at?->format('j M Y'))->all());
        });
    }
}
