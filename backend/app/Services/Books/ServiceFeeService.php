<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Currency;
use App\Models\Service;
use App\Models\ServiceFee;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Fees on a service are master data, like auction charges: ledgers in a "charge" group that belongs to services (the
 * Service Fees subgroup of Service Income, and the Service Deposits & Pass-through liabilities). Each ledger carries
 * how it is worked out, its tax (taxed with a tax ledger, or not taxed) and when it falls due. A service switches fees
 * on or off and may change the amounts.
 */
class ServiceFeeService
{
    public const KINDS = ['call_out', 'travel', 'urgent', 'after_hours', 'consumables', 'equipment', 'extra_person', 'overtime', 'service_charge', 'deposit', 'booking_fee',
        'cancellation', 'no_show', 'reschedule', 'tip', 'disbursement', 'payment_processing', 'other_service'];

    /** booking: asked when booked · completion: added when the service is done · late_cancel / no_show / reschedule: worked out when that happens */
    public const TIMINGS = ['booking', 'completion', 'late_cancel', 'no_show', 'reschedule'];

    /** Kinds that are not income: money held for the customer or passed on. */
    public const NOT_INCOME = ['deposit', 'tip', 'disbursement'];

    /** Every active fee ledger that belongs to services. */
    public function ledgers(): Collection
    {
        $groupIds = LedgerGroup::where('behaviour', 'charge')->get()->flatMap(fn ($g) => $g->selfAndDescendantIds())->unique()->all();

        return Ledger::with(['taxRateLedger:id,name,rate_value', 'group:id,name,nature'])->whereIn('group_id', $groupIds)->where('is_active', true)->orderBy('name')->get()
            ->filter(fn ($l) => LedgerGroup::appliesTo((int) $l->group_id) === 'service' || (($l->settings ?? [])['applies_to'] ?? null) === 'service')->values();
    }

    /** A fee ledger as an option on a service, its own amount converted to the service's currency. */
    public function optionFromLedger(Ledger $l, Currency $currency): array
    {
        $set = $l->settings ?? [];
        $basis = match ($l->rate_type) { 'percent' => 'percent', 'per_unit' => 'per_unit', default => 'fixed' };
        $amount = $l->rate_value === null ? null : (float) $l->rate_value;
        if ($amount !== null && $basis !== 'percent' && $l->currency_id && (int) $l->currency_id !== (int) $currency->id) {
            $amount = round(Currency::find($l->currency_id)->convertTo($currency, $amount), 4);
        }
        $kind = $set['charge_kind'] ?? 'other_service';

        return [
            'ledger' => ['id' => $l->id, 'name' => $l->name, 'tax_nature' => $l->tax_nature, 'group' => $l->group?->name],
            'tax_rate' => $l->taxRateLedger?->only(['id', 'name', 'rate_value']),
            'kind' => $kind, 'timing' => $set['timing'] ?? 'completion', 'basis' => $basis, 'amount' => $amount, 'unit' => $set['unit'] ?? '',
            'refundable' => (bool) ($set['refundable'] ?? false), 'not_income' => in_array($kind, self::NOT_INCOME, true), 'default_on' => (bool) ($set['default_on'] ?? false),
        ];
    }

    /** Every service fee, with what this service has done with it: on or off, its own amount, its condition. */
    public function forService(Service $service): array
    {
        $currency = Currency::find($service->currency_id) ?? app(\App\Services\CurrencyConversionService::class)->getBaseCurrency();
        // until script 58 has been run there is no table: every fee simply shows as off
        $saved = \Illuminate\Support\Facades\Schema::hasTable('service_fees') ? ServiceFee::where('service_id', $service->id)->get()->keyBy('ledger_id') : collect();

        return $this->ledgers()->map(function ($l) use ($currency, $saved) {
            $o = $this->optionFromLedger($l, $currency);
            $row = $saved->get($l->id);

            return array_merge($o, [
                'is_enabled' => $row ? (bool) $row->is_enabled : $o['default_on'],
                'own_amount' => $o['amount'],
                'amount' => $row && $row->amount !== null ? (float) $row->amount : $o['amount'],
                'condition' => $row->condition ?? 'always', 'condition_value' => $row?->condition_value !== null ? (float) $row->condition_value : null,
            ]);
        })->values()->all();
    }

    /**
     * Replace a service's fee switches. Rows: [{ledger_id, is_enabled, amount?, condition?, condition_value?}].
     *
     * @throws BooksException
     */
    public function sync(Service $service, array $rows): void
    {
        if (! \Illuminate\Support\Facades\Schema::hasTable('service_fees')) {
            throw new BooksException('Run script 58_service_fees.sql before saving service fees.');
        }
        $valid = $this->ledgers()->keyBy('id');
        $clean = [];
        foreach ($rows as $i => $r) {
            $id = (int) ($r['ledger_id'] ?? 0);
            $l = $valid->get($id);
            if (! $l) {
                throw new BooksException('One of the fees is not a service fee any more. Reload the page.');
            }
            $amount = ($r['amount'] ?? '') === '' || $r['amount'] === null ? null : (float) $r['amount'];
            if ($amount !== null && $amount < 0) {
                throw new BooksException("The amount for {$l->name} cannot be negative.");
            }
            if ($amount !== null && $l->rate_type === 'percent' && $amount > 100) {
                throw new BooksException("{$l->name} is a percentage and cannot be more than 100.");
            }
            $cond = in_array($r['condition'] ?? 'always', ServiceFee::CONDITIONS, true) ? ($r['condition'] ?? 'always') : 'always';
            $value = in_array($cond, ['urgent', 'group'], true) && ($r['condition_value'] ?? '') !== '' ? (float) $r['condition_value'] : null;
            if (in_array($cond, ['urgent', 'group'], true) && ($value === null || $value <= 0)) {
                throw new BooksException($cond === 'urgent' ? "Say within how many hours {$l->name} applies." : "Say from how many people {$l->name} applies.");
            }
            $clean[$id] = ['service_id' => $service->id, 'ledger_id' => $id, 'is_enabled' => (bool) ($r['is_enabled'] ?? false), 'amount' => $amount, 'condition' => $cond, 'condition_value' => $value, 'position' => $i];
        }
        DB::transaction(function () use ($service, $clean) {
            ServiceFee::where('service_id', $service->id)->delete();
            foreach ($clean as $row) {
                ServiceFee::create($row);
            }
        });
    }

    /** Give a new service the fees that are marked "on for new services". */
    public function attachDefaults(Service $service): void
    {
        if (! Schema::hasTable('service_fees')) {
            return;
        }
        $pos = 0;
        foreach ($this->ledgers() as $l) {
            if (($l->settings ?? [])['default_on'] ?? false) {
                ServiceFee::firstOrCreate(['service_id' => $service->id, 'ledger_id' => $l->id], ['is_enabled' => true, 'amount' => null, 'condition' => 'always', 'position' => $pos++]);
            }
        }
    }
}
