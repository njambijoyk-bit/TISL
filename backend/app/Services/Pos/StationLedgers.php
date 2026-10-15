<?php

namespace App\Services\Pos;

use App\Models\Books\Ledger;
use App\Models\Books\PaymentMethod;
use App\Models\Pos\Station;
use Illuminate\Support\Facades\Schema;

/**
 * Where a station's money goes. A station can name its own cash-in-hand ledger and bank ledger (Point of sale, Stations): what is paid in cash posts to the first and every
 * other way of paying that is not a gift voucher (bank transfer, card, M-Pesa) to the second. A station with none named leaves each payment method on its own ledger.
 */
class StationLedgers
{
    /** @var array<int, array{cash: ?int, bank: ?int}> */
    private static array $seen = [];

    public static function installed(): bool
    {
        static $ok = null;

        return $ok ??= Schema::hasTable('pos_stations') && Schema::hasColumn('pos_stations', 'cash_ledger_id');
    }

    /** @return array{cash: ?int, bank: ?int} */
    public static function of(?int $stationId): array
    {
        if (! $stationId || ! self::installed()) {
            return ['cash' => null, 'bank' => null];
        }

        return self::$seen[$stationId] ??= (function () use ($stationId) {
            $s = Station::find($stationId);

            return ['cash' => $s?->cash_ledger_id ? (int) $s->cash_ledger_id : null, 'bank' => $s?->bank_ledger_id ? (int) $s->bank_ledger_id : null];
        })();
    }

    /** The payment method as this station posts it: the same method, on the station's own ledger when it has one for that kind of money. */
    public static function method(PaymentMethod $m, ?int $stationId): PaymentMethod
    {
        $l = self::of($stationId);
        $ledger = $m->kind === 'cash' ? $l['cash'] : ($m->kind === 'gift_voucher' ? null : $l['bank']);
        if (! $ledger || (int) $m->ledger_id === $ledger) {
            return $m;
        }
        $copy = clone $m;
        $copy->ledger_id = $ledger;
        $copy->setRelation('ledger', Ledger::find($ledger));

        return $copy;
    }

    public static function forget(): void
    {
        self::$seen = [];
    }
}
