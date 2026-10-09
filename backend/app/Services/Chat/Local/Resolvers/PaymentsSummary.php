<?php

namespace App\Services\Chat\Local\Resolvers;

use App\Models\Payment;
use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\ResolverResult;

/** Company-wide payment figures. Someone limited to branches would see numbers that are not theirs, so they are refused rather than shown the whole. */
final class PaymentsSummary extends BaseResolver
{
    public function kinds(): array
    {
        return ['staff'];
    }

    public function requires(): array
    {
        return ['books.view'];
    }

    public function run(CallerContext $c, array $slots): ResolverResult
    {
        if ($c->locationIds !== null) {
            return ResolverResult::denied();
        }

        return $this->guarded(function () {
            $disputes = ['raised', 'investigating'];

            return ResolverResult::ok([
                'Collected today: ' . $this->money(Payment::whereDate('confirmed_at', today())->sum('mpesa_amount_confirmed')),
                'This month: ' . $this->money(Payment::whereMonth('confirmed_at', now()->month)->whereYear('confirmed_at', now()->year)->sum('mpesa_amount_confirmed')),
                'Pending: ' . Payment::where('status', 'pending')->count() . ' · Failed: ' . Payment::where('status', 'failed')->count() . ' · Open disputes: ' . Payment::whereIn('dispute_status', $disputes)->count(),
            ]);
        });
    }
}
