<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Keeps tax out of the ordinary chart of accounts (docs/TAX_CONTROL_PLAN.md, decision T4, step T5): the group that holds taxes cannot be created under,
 * edited or filled with accounts from the chart forms. A tax type and its rates are made on the Tax and compliance page, where used rates are protected.
 * A subgroup of the tax group, and the accounts inside it, are ordinary and stay allowed.
 */
class TaxAccountGuard
{
    private const WHERE = 'Taxes are added on the Tax and compliance page, not in the chart of accounts.';

    /** The group that holds taxes: the one Tax control names, else (before script 229) the group called Duties & Taxes. */
    public function rootId(): ?int
    {
        $id = TaxControlSettings::ready() ? app(TaxControlSettings::class)->get('tax_group_id') : null;

        return $id ? (int) $id : ($this->byName());
    }

    private function byName(): ?int
    {
        $id = DB::table('ledger_groups')->where('name', 'Duties & Taxes')->min('id');

        return $id ? (int) $id : null;
    }

    /** @throws ValidationException */
    public function assertLedgerGoesInto(int $groupId): void
    {
        if ($groupId === $this->rootId()) {
            throw ValidationException::withMessages(['group_id' => self::WHERE . ' A ledger cannot sit directly under Duties & Taxes; make a subgroup of it here and add the account to that.']);
        }
    }

    /** @throws ValidationException */
    public function assertGroupMayBeMade(LedgerGroup $parent, ?string $behaviour): void
    {
        $under = $parent->id === $this->rootId();
        if (($behaviour ?? $parent->behaviour) === 'tax' && $under) {
            throw ValidationException::withMessages(['behaviour' => self::WHERE]);
        }
    }

    /**
     * A tax type (a tax-behaviour group directly under the tax group) keeps its name, place and behaviour: those change on the Tax and compliance page.
     * Its settings and statement line can still be tuned.
     *
     * @return array the changes that are allowed
     *
     * @throws ValidationException
     */
    public function onlyTuningForTaxTypes(LedgerGroup $g, array $d): array
    {
        if ($g->behaviour === 'tax' && (int) $g->parent_id === $this->rootId() && array_intersect(array_keys($d), ['name', 'parent_id', 'behaviour'])) {
            throw ValidationException::withMessages(['name' => 'A tax type is changed on the Tax and compliance page.']);
        }
        if ($g->id === $this->rootId() && array_intersect(array_keys($d), ['name', 'parent_id', 'behaviour'])) {
            throw ValidationException::withMessages(['name' => 'This group holds the taxes and is managed through Tax control.']);
        }
        if (isset($d['parent_id']) && (int) $d['parent_id'] === $this->rootId() && ($d['behaviour'] ?? $g->behaviour) === 'tax') {
            throw ValidationException::withMessages(['parent_id' => self::WHERE]);
        }

        return $d;
    }

    /**
     * A tax rate that already exists is changed on the Tax and compliance page, where a rate that has been charged is locked. The chart form may rename it,
     * switch it off and tune its settings, but not touch its amounts.
     *
     * @throws ValidationException
     */
    public function assertRateIsNotRewritten(Ledger $l, array $d): void
    {
        if (! $l->getRawOriginal('rate_type') || LedgerGroup::whereKey($l->group_id)->value('behaviour') !== 'tax') {
            return;
        }
        $moneyFields = ['rate_type', 'rate_value', 'secondary_rate_value', 'tax_point', 'valid_from', 'valid_until', 'currency_id', 'unit_of_measure_id'];
        foreach ($moneyFields as $k) {
            if (array_key_exists($k, $d) && ! $this->same($d[$k], $l->getRawOriginal($k))) {
                throw ValidationException::withMessages([$k => 'The amount of a tax rate is changed on the Tax and compliance page, where a rate that has been charged is protected.']);
            }
        }
    }

    /** 16 and "16.0000" are the same amount; an empty value and null are the same. */
    private function same(mixed $a, mixed $b): bool
    {
        if (($a === null || $a === '') && ($b === null || $b === '')) {
            return true;
        }

        return is_numeric($a) && is_numeric($b) ? abs((float) $a - (float) $b) < 0.0000001 : (string) $a === (string) $b;
    }
}
