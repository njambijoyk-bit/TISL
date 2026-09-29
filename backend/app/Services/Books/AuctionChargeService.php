<?php

namespace App\Services\Books;

use App\Models\Auction;
use App\Models\AuctionCharge;
use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Currency;
use App\Models\Customer;
use Illuminate\Support\Collection;

/**
 * Auction charges are master data: ledgers in a "charge" group (buyer premium, entry fee, deposit, handling, storage,
 * customs…). Each carries how it is worked out, its tax and when it falls due. An auction starts from the defaults
 * and may switch charges on or off or change amounts. Charges are worked out from the live winning bid.
 */
class AuctionChargeService
{
    public const KINDS = ['buyer_premium', 'entry_fee', 'deposit', 'delivery', 'handling', 'storage', 'removal', 'payment', 'customs', 'other'];

    /** entry: paid to take part · deposit: held, refundable · on_win: added to the winner's order · after_win: accrues later (storage) */
    /** Which account decides the tax on a charge: its own setting, or the sales account the auction is booked to. */
    public const TAX_FOLLOWS = ['own', 'auction'];

    public const TIMINGS = ['entry', 'deposit', 'on_win', 'after_win'];

    public function __construct(private TaxLineService $taxLines) {}

    /** Every active charge ledger. */
    public function ledgers(): Collection
    {
        $groupIds = LedgerGroup::where('behaviour', 'charge')->get()->flatMap(fn ($g) => $g->selfAndDescendantIds())->unique()->all();

        return Ledger::with('taxRateLedger:id,name,rate_value')->whereIn('group_id', $groupIds)->where('is_active', true)->orderBy('name')->get();
    }

    public static function defaultTiming(?string $kind): string
    {
        return match ($kind) { 'entry_fee' => 'entry', 'deposit' => 'deposit', 'storage' => 'after_win', default => 'on_win' };
    }

    /** A ledger's characteristics as an auction charge row, in the auction's currency. */
    public function rowFromLedger(Ledger $l, Currency $currency): array
    {
        $set = $l->settings ?? [];
        $basis = match ($l->rate_type) { 'percent' => 'percent', 'per_day' => 'per_day', default => 'fixed' };
        $convert = function ($v) use ($l, $currency) {
            if ($v === null || ! $l->currency_id || (int) $l->currency_id === (int) $currency->id) {
                return $v === null ? null : (float) $v;
            }

            return round(Currency::find($l->currency_id)->convertTo($currency, (float) $v), 4);
        };

        return [
            'ledger_id' => $l->id, 'basis' => $basis,
            'amount' => $basis === 'percent' ? (float) $l->rate_value : $convert($l->rate_value),
            'min_amount' => $convert($l->min_amount), 'max_amount' => $convert($l->max_amount),
            'free_days' => (int) ($set['free_days'] ?? 0),
            'timing' => $set['timing'] ?? self::defaultTiming($set['charge_kind'] ?? null),
            'refundable' => (bool) ($set['refundable'] ?? (($set['charge_kind'] ?? null) === 'deposit')),
            'is_enabled' => true,
        ];
    }

    /** Give a new auction the charges marked "on by default". */
    public function attachDefaults(Auction $a): void
    {
        $currency = Currency::find($a->currency_id);
        $order = 0;
        foreach ($this->ledgers() as $l) {
            if (! (($l->settings ?? [])['default_on'] ?? false)) {
                continue;
            }
            AuctionCharge::create($this->rowFromLedger($l, $currency) + ['auction_id' => $a->id, 'sort_order' => $order++]);
        }
    }

    /** Replace an auction's charges with the given rows: [{ledger_id, amount?, basis?, min_amount?, max_amount?, free_days?, timing?, refundable?, is_enabled?}]. */
    public function sync(Auction $a, array $rows): void
    {
        $valid = $this->ledgers()->keyBy('id');
        $currency = Currency::find($a->currency_id);
        $clean = [];
        foreach (array_values($rows) as $i => $r) {
            $l = $valid->get((int) ($r['ledger_id'] ?? 0));
            if (! $l) {
                throw new BooksException('Pick charges from the auction charge accounts (Books → Chart of accounts).');
            }
            $row = array_merge($this->rowFromLedger($l, $currency), array_filter($r, fn ($v) => $v !== null && $v !== ''));
            if ($row['basis'] === 'percent' && (float) $row['amount'] > 100) {
                throw new BooksException("{$l->name}: a percentage cannot exceed 100.");
            }
            $row['ledger_id'] = $l->id;
            $row['is_enabled'] = (bool) ($r['is_enabled'] ?? true);
            $row['refundable'] = (bool) ($row['refundable'] ?? false);
            $clean[] = array_intersect_key($row, array_flip(['ledger_id', 'basis', 'amount', 'min_amount', 'max_amount', 'free_days', 'timing', 'refundable', 'is_enabled'])) + ['auction_id' => $a->id, 'sort_order' => $i];
        }
        $a->charges()->delete();
        foreach ($clean as $row) {
            AuctionCharge::create($row);
        }
    }

    /** The account whose tax treatment applies to this charge on this auction. */
    public function taxAccountFor(Auction $a, AuctionCharge $c): ?Ledger
    {
        if ((($c->ledger?->settings ?? [])['tax_follows'] ?? 'own') === 'auction' && $a->sales_ledger_id) {
            return Ledger::find($a->sales_ledger_id) ?? $c->ledger;
        }

        return $c->ledger;
    }

    /** Net amount of one charge for a winning bid (and, for per-day charges, days held). */
    public function amountFor(AuctionCharge $c, float $bid, int $days = 0): float
    {
        $amount = match ($c->basis) {
            'percent' => $bid * (float) $c->amount / 100,
            'per_day' => (float) $c->amount * max(0, $days - (int) $c->free_days),
            default => (float) $c->amount,
        };
        if ($c->min_amount !== null && $amount > 0) {
            $amount = max($amount, (float) $c->min_amount);
        }
        if ($c->max_amount !== null && (float) $c->max_amount > 0) {
            $amount = min($amount, (float) $c->max_amount);
        }

        return round($amount, 2);
    }

    /**
     * What the winner owes for a winning bid: the bid and its tax, each charge with its own tax, and the amounts
     * that are taken up front (entry fee, deposit) or accrue later (storage) kept apart from the amount payable.
     *
     * @return array{bid: array, lines: array, upfront: array, accruing: array, totals: array}
     */
    public function quote(Auction $a, float $bid, int $daysHeld = 0, ?Customer $customer = null): array
    {
        $currency = Currency::find($a->currency_id);
        $bidTax = ['tax' => 0.0, 'label' => null, 'percent' => null];
        if ($a->sales_ledger_id && ($sales = Ledger::find($a->sales_ledger_id))) {
            $t = $this->taxLines->fromAccount($sales, $bid, $bid, 1.0, 'output', $customer, $currency, null, $a->product)[0] ?? null;
            $bidTax = ['tax' => (float) ($t['tax_amount'] ?? 0), 'label' => $t['label'] ?? null, 'percent' => $t['percent'] ?? null];
        }

        $lines = $upfront = $accruing = [];
        foreach ($a->charges()->with('ledger')->where('is_enabled', true)->orderBy('sort_order')->get() as $c) {
            $net = $this->amountFor($c, $bid, $daysHeld);
            if ($net <= 0 || ! $c->ledger) {
                continue;
            }
            $taxAccount = $this->taxAccountFor($a, $c);
            $t = $taxAccount->tax_nature ? ($this->taxLines->fromAccount($taxAccount, $net, $net, 1.0, 'output', $customer, $currency)[0] ?? null) : null;
            $tax = (float) ($t['tax_amount'] ?? 0);
            $row = [
                'charge_id' => $c->id, 'ledger_id' => $c->ledger_id, 'name' => $c->ledger->name,
                'kind' => ($c->ledger->settings ?? [])['charge_kind'] ?? 'other', 'timing' => $c->timing, 'basis' => $c->basis,
                'tax_account_id' => $taxAccount->id, 'net' => $net, 'tax' => $tax, 'tax_label' => $t['label'] ?? null, 'gross' => round($net + $tax, 2), 'refundable' => (bool) $c->refundable,
            ];
            match ($c->timing) { 'entry', 'deposit' => $upfront[] = $row, 'after_win' => $accruing[] = $row, default => $lines[] = $row };
        }

        $chargesNet = round(array_sum(array_column($lines, 'net')), 2);
        $chargesTax = round(array_sum(array_column($lines, 'tax')), 2);

        return [
            'bid' => ['net' => round($bid, 2)] + $bidTax,
            'lines' => $lines, 'upfront' => $upfront, 'accruing' => $accruing,
            'totals' => [
                'net' => round($bid + $chargesNet, 2), 'tax' => round($bidTax['tax'] + $chargesTax, 2),
                'payable' => round($bid + $bidTax['tax'] + $chargesNet + $chargesTax, 2),
                'upfront' => round(array_sum(array_column($upfront, 'gross')), 2),
            ],
        ];
    }
}
