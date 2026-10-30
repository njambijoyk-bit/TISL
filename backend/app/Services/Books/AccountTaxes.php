<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * The taxes a sales, purchase or charge account carries (docs/TAX_CONTROL_PLAN.md, step T5): one row of `ledger_taxes` per tax, in order, each saying whether
 * the tax is charged on the account, zero-rated, exempt or out of scope.
 *
 * The first row is the account's PRIMARY tax. Until the tax posting update (step T6) the posting code reads only the old `tax_nature` and
 * `tax_rate_ledger_id` columns, so those are kept in step with the primary row: saving the list writes them, and saving the old fields rewrites the primary
 * row. The other rows are recorded now and begin to be charged with T6.
 */
class AccountTaxes
{
    public const TREATMENTS = ['applies' => 'taxable', 'zero_rated' => 'zero_rated', 'exempt' => 'exempt', 'out_of_scope' => 'out_of_scope'];
    /** Groups whose accounts carry a tax. An expense account (anything under Indirect Expenses) may carry one too, but need not: 'expense' is the behaviour it takes for this. */
    private const BEHAVIOURS = ['sales', 'purchase', 'charge', 'expense'];

    /** The group's behaviour as far as tax goes: its own, or 'expense' for a group under Indirect Expenses. */
    public static function effectiveBehaviour(int $groupId): string
    {
        $own = LedgerGroup::whereKey($groupId)->value('behaviour') ?? 'standard';
        if (in_array($own, ['sales', 'purchase', 'charge'], true)) {
            return $own;
        }
        $root = LedgerGroup::where('name', 'Indirect Expenses')->first();

        return $root && in_array($groupId, array_map('intval', $root->selfAndDescendantIds()), true) ? 'expense' : $own;
    }

    public static function available(): bool
    {
        return Schema::hasTable('ledger_taxes');
    }

    /** @return array<int, array[]> ledger id => its taxes in order */
    public function forLedgers(array $ids): array
    {
        if (! static::available() || ! $ids) {
            return [];
        }
        $rows = DB::table('ledger_taxes as t')->leftJoin('ledger_groups as g', 'g.id', '=', 't.tax_type_id')->leftJoin('ledgers as r', 'r.id', '=', 't.tax_rate_id')
            ->whereIn('t.ledger_id', $ids)->orderBy('t.ledger_id')->orderBy('t.sort_order')->orderBy('t.id')
            ->get(['t.ledger_id', 't.tax_type_id', 'g.name as tax_type', 't.tax_rate_id', 'r.name as rate', 'r.rate_value', 't.treatment', 't.sort_order']);
        $out = [];
        foreach ($rows as $r) {
            $out[(int) $r->ledger_id][] = ['tax_type_id' => (int) $r->tax_type_id, 'tax_type' => $r->tax_type, 'tax_rate_id' => $r->tax_rate_id ? (int) $r->tax_rate_id : null,
                'rate' => $r->rate, 'rate_value' => $r->rate_value !== null ? (float) $r->rate_value : null, 'treatment' => $r->treatment, 'sort_order' => (int) $r->sort_order];
        }

        return $out;
    }

    /** The one tax type that is VAT or GST and added to the price, when there is exactly one: the home of an account that is exempt or out of scope without saying of what. */
    public function onlyVatType(): ?int
    {
        if (! Schema::hasColumn('ledger_groups', 'tax_category')) {
            return null;
        }
        $ids = DB::table('ledger_groups')->where('behaviour', 'tax')->where('tax_category', 'vat_gst')->where('application_method', 'added')->where('is_active', 1)->pluck('id');

        return $ids->count() === 1 ? (int) $ids->first() : null;
    }

    /**
     * Check a list of taxes for an account of the given group behaviour and put it in the shape it is stored in.
     *
     * @param  array<int, mixed>  $taxes  each: tax_type_id (empty means the company's one VAT type), tax_rate_id, treatment
     * @return array<int, array{tax_type_id: int, tax_rate_id: ?int, treatment: string}>
     *
     * @throws ValidationException
     */
    public function normalise(array $taxes, string $behaviour): array
    {
        $fail = fn (string $m) => throw ValidationException::withMessages(['taxes' => $m]);
        if (! in_array($behaviour, self::BEHAVIOURS, true)) {
            $fail('Taxes belong on a sales, purchase, charge or expense account.');
        }
        if (count($taxes) > 8) {
            $fail('An account carries at most 8 taxes.');
        }
        $out = [];
        $seen = [];
        foreach (array_values($taxes) as $i => $row) {
            $n = $i + 1;
            if (! is_array($row)) {
                $fail("Tax {$n}: send its tax, rate and treatment.");
            }
            $treatment = $row['treatment'] ?? 'applies';
            if (! array_key_exists($treatment, self::TREATMENTS)) {
                $fail("Tax {$n}: choose charged, zero-rated, exempt or out of scope.");
            }
            $type = ! empty($row['tax_type_id']) ? (int) $row['tax_type_id'] : null;
            $rate = ! empty($row['tax_rate_id']) ? (int) $row['tax_rate_id'] : null;
            if ($rate) {   // a rate says which tax it belongs to
                $of = DB::table('ledgers')->where('id', $rate)->whereNotNull('rate_type')->value('group_id');
                if (! $of) {
                    $fail("Tax {$n}: that tax rate no longer exists.");
                }
                if ($type && (int) $of !== $type) {
                    $fail("Tax {$n}: that rate belongs to another tax.");
                }
                $type = (int) $of;
            }
            $type ??= $this->onlyVatType() ?? $fail("Tax {$n}: choose which tax this is for.");
            if (! DB::table('ledger_groups')->where('id', $type)->where('behaviour', 'tax')->exists()) {
                $fail("Tax {$n}: that is not a tax type.");
            }
            if ($treatment === 'applies' && ! $rate) {
                $fail("Tax {$n}: a tax that is charged needs its rate.");
            }
            if ($treatment !== 'applies' && $treatment !== 'zero_rated') {
                $rate = null;   // exempt and out of scope have no rate
            }
            if (isset($seen[$type])) {
                $fail('A tax is listed once on an account: put its treatment in one row.');
            }
            $seen[$type] = true;
            $out[] = ['tax_type_id' => $type, 'tax_rate_id' => $rate, 'treatment' => $treatment];
        }

        return $out;
    }

    /** The old columns that mirror the primary row: [tax_nature, tax_rate_ledger_id]. */
    public static function legacyOf(?array $primary): array
    {
        return $primary === null ? [null, null] : [self::TREATMENTS[$primary['treatment']], $primary['tax_rate_id']];
    }

    /** Replace an account's taxes with this list and bring the old columns into step with its first row. */
    public function sync(Ledger $ledger, array $rows): void
    {
        if (! static::available()) {
            return;
        }
        DB::transaction(function () use ($ledger, $rows) {
            DB::table('ledger_taxes')->where('ledger_id', $ledger->id)->delete();
            $now = now();
            foreach ($rows as $i => $r) {
                DB::table('ledger_taxes')->insert(['ledger_id' => $ledger->id, 'tax_type_id' => $r['tax_type_id'], 'tax_rate_id' => $r['tax_rate_id'], 'treatment' => $r['treatment'], 'sort_order' => $i, 'created_at' => $now, 'updated_at' => $now]);
            }
        });
    }

    /**
     * An account saved the old way (a tax nature and a rate): rewrite its primary row from them and leave the other taxes as they are.
     * A cleared nature removes the primary row.
     */
    public function followLegacy(Ledger $ledger): void
    {
        if (! static::available() || ! $this->isTaxed($ledger)) {
            return;
        }
        $existing = DB::table('ledger_taxes')->where('ledger_id', $ledger->id)->orderBy('sort_order')->orderBy('id')->get();
        $primary = $existing->first();
        if (! $ledger->tax_nature) {
            if ($primary) {
                DB::table('ledger_taxes')->where('id', $primary->id)->delete();
            }

            return;
        }
        $rate = in_array($ledger->tax_nature, ['taxable', 'zero_rated'], true) ? $ledger->tax_rate_ledger_id : null;
        $type = $rate ? DB::table('ledgers')->where('id', $rate)->value('group_id') : ($primary->tax_type_id ?? $this->onlyVatType());
        if (! $type) {
            return;   // nothing to say which tax: the old columns still hold it
        }
        $treatment = array_search($ledger->tax_nature, self::TREATMENTS, true) ?: 'applies';
        $row = ['tax_type_id' => $type, 'tax_rate_id' => $rate, 'treatment' => $treatment, 'sort_order' => 0, 'updated_at' => now()];
        DB::table('ledger_taxes')->where('ledger_id', $ledger->id)->where('tax_type_id', $type)->where('id', '!=', $primary->id ?? 0)->delete();   // the same tax is never listed twice
        if ($primary) {
            DB::table('ledger_taxes')->where('id', $primary->id)->update($row);
        } else {
            DB::table('ledger_taxes')->insert($row + ['ledger_id' => $ledger->id, 'created_at' => now()]);
        }
    }

    private function isTaxed(Ledger $ledger): bool
    {
        return in_array(self::effectiveBehaviour((int) $ledger->group_id), self::BEHAVIOURS, true);
    }
}
