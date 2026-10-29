<?php

namespace App\Services\Books;

use App\Models\Currency;
use App\Models\TaxRate;
use App\Models\TaxType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The part of the tax calculation that goes beyond one tax per account (docs/TAX_CONTROL_PLAN.md, step T6). TaxLineService works out the account's first tax
 * and the item's rules exactly as before; this adds, in a fixed order:
 *
 *  1. the other taxes the account carries (ledger_taxes, after the first), each calculated on its own base;
 *  2. an item's own opt-out of a tax (tax_opt_outs);
 *  3. the taxes that apply regardless (Tax control), each with its own rule about exemptions.
 *
 * A tax's base is the price, or, for a rate "after discounts and earlier taxes", the price plus the taxes already worked out on the line: all of them, or the
 * tax types the rate lists in base_includes. Every row it makes carries a snapshot of how it was worked out, kept with the posted line.
 *
 * Registered as scoped, so what it remembers lasts one request or one queued job.
 */
class TaxResolver
{
    /** @var array<string, bool> */
    private array $tables = [];

    /** @var array<int, array[]> ledger id => its taxes after the first */
    private array $extra = [];

    private ?array $regardless = null;

    /** @var array<string, int[]> */
    private array $optOuts = [];

    private function has(string $table): bool
    {
        return $this->tables[$table] ??= Schema::hasTable($table);
    }

    // ── what a line is exempt from ─────────────────────────────────────

    /** @return int[] the tax types this item has opted out of */
    public function optedOut(?Model $taxable): array
    {
        if (! $taxable || ! $taxable->exists || ! $this->has('tax_opt_outs')) {
            return [];
        }
        $key = $taxable->getMorphClass() . ':' . $taxable->getKey();

        return $this->optOuts[$key] ??= DB::table('tax_opt_outs')->where('taxable_type', $taxable->getMorphClass())->where('taxable_id', $taxable->getKey())->pluck('tax_type_id')->map(fn ($i) => (int) $i)->all();
    }

    // ── the account's other taxes ──────────────────────────────────────

    /**
     * The taxes an account carries after its first, worked out in order, each on its own base.
     *
     * @param  array[]  $earlier  the rows already made for this line (the account's first tax, and the item's)
     * @param  int[]  $optedOut
     * @return array[]
     */
    public function accountRows(int $ledgerId, float $pre, float $post, float $qty, string $side, ?Currency $currency, $on, array $earlier, array $optedOut, TaxLineService $lines): array
    {
        $out = [];
        foreach ($this->extraTaxes($ledgerId) as $t) {
            if (in_array($t['tax_type_id'], $optedOut, true) || in_array($t['tax_type_id'], array_column($earlier, 'tax_type_id'), true)) {
                continue;
            }
            if (in_array($t['treatment'], ['exempt', 'out_of_scope'], true) || ! $t['tax_rate_id']) {
                continue;
            }
            $rate = TaxRate::with('taxType')->find($t['tax_rate_id']);
            if (! $rate) {
                continue;
            }
            $rate = $lines->inForce($rate, $on);
            $row = $this->row($rate, 'account', $t['treatment'], $pre, $post, $qty, $side, $currency, array_merge($earlier, $out));
            if ($row) {
                $out[] = $row;
            }
        }

        return $out;
    }

    /** @return array[] */
    private function extraTaxes(int $ledgerId): array
    {
        if (! $this->has('ledger_taxes')) {
            return [];
        }

        return $this->extra[$ledgerId] ??= DB::table('ledger_taxes')->where('ledger_id', $ledgerId)->orderBy('sort_order')->orderBy('id')->get(['tax_type_id', 'tax_rate_id', 'treatment'])
            ->slice(1)->map(fn ($r) => ['tax_type_id' => (int) $r->tax_type_id, 'tax_rate_id' => $r->tax_rate_id ? (int) $r->tax_rate_id : null, 'treatment' => $r->treatment])->values()->all();
    }

    // ── taxes that apply regardless ────────────────────────────────────

    /**
     * Add the taxes Tax control says apply to every qualifying document, each unless its own rule about exemptions says the line is exempt.
     *
     * @param  array[]  $rows  what the account and the item's rules gave
     * @param  array{account: ?\App\Models\Books\Ledger, item_exempt: bool, customer_exempt: bool, opted_out: int[]}  $ctx
     * @return array[]
     */
    public function withRegardless(array $rows, float $pre, float $post, float $qty, string $side, ?Currency $currency, $on, array $ctx, TaxLineService $lines): array
    {
        if ($post == 0.0) {
            return $rows;
        }
        $document = $side === 'input' ? 'purchases' : 'sales';
        foreach ($this->regardlessList() as $entry) {
            if (! in_array($document, $entry['documents'], true)) {
                continue;
            }
            $type = (int) $entry['tax_type_id'];
            if (in_array($type, array_column($rows, 'tax_type_id'), true)) {
                continue;   // the line already carries this tax
            }
            $nature = $ctx['account']?->tax_nature;
            $skip = match ($entry['exemption_behaviour']) {
                'apply_independently' => false,
                'exclude_exempt_supplies' => $ctx['item_exempt'] || $nature === 'exempt',
                default => $ctx['item_exempt'] || $ctx['customer_exempt'] || in_array($nature, ['exempt', 'out_of_scope'], true) || in_array($type, $ctx['opted_out'], true),
            };
            if ($skip) {
                continue;
            }
            $rate = $this->standardRate($type, $on);
            $row = $this->row($rate, 'regardless', 'applies', $pre, $post, $qty, $side, $currency, $rows, ['exemption_behaviour' => $entry['exemption_behaviour']]);
            if ($row) {
                $rows[] = $row;
            }
        }

        return $rows;
    }

    /** @return array<int, array{tax_type_id: int, exemption_behaviour: string, documents: string[]}> */
    private function regardlessList(): array
    {
        if ($this->regardless !== null) {
            return $this->regardless;
        }
        if (! $this->has('tax_control_settings')) {
            return $this->regardless = [];
        }
        $v = DB::table('tax_control_settings')->where('setting_key', 'apply_regardless')->value('value');

        return $this->regardless = $v ? (json_decode((string) $v, true) ?: []) : [];
    }

    /** The rate a tax that applies regardless charges on a date: its standard rate in force. */
    private function standardRate(int $typeId, $on): TaxRate
    {
        $rate = TaxRate::with('taxType')->where('group_id', $typeId)->active()->effectiveOn($on)
            ->where(fn ($q) => $q->whereNull('classification')->orWhere('classification', 'standard'))->orderByDesc('valid_from')->orderBy('calculation_sequence')->first();
        if (! $rate) {
            $name = TaxType::whereKey($typeId)->value('name') ?? 'A tax';
            throw new BooksException("{$name} applies to every document but has no standard rate in force on " . ($on ? \Illuminate\Support\Carbon::parse($on)->toDateString() : 'today') . '. Add one under Tax & Compliance.');
        }

        return $rate;
    }

    // ── one row ────────────────────────────────────────────────────────

    /**
     * One tax worked out on a line: its base (the price, or the price plus earlier taxes), its amount, the ledger it posts to and a snapshot of how.
     *
     * @param  array[]  $earlier  the rows already made for the line
     */
    private function row(TaxRate $rate, string $source, string $treatment, float $pre, float $post, float $qty, string $side, ?Currency $currency, array $earlier, array $extra = []): ?array
    {
        $ledgerId = $side === 'input' ? $rate->ledger_input_id : $rate->ledger_output_id;
        if (! $ledgerId) {
            throw new BooksException('The ' . ($rate->taxType?->name ?? 'tax') . " rate has no {$side} tax ledger. Set it under Tax & Compliance.");
        }
        $base = $rate->baseAmount($pre, $post, $post + $this->earlierTax($rate, $earlier));
        $tax = $treatment === 'zero_rated' ? 0.0 : $rate->calculate($base, $qty, $currency);

        return self::rowOf($rate, (int) $ledgerId, $base, $tax, $source, $treatment, $extra);
    }

    /** The taxes worked out before this one that go into its base: all of them, or the tax types the rate lists. */
    private function earlierTax(TaxRate $rate, array $earlier): float
    {
        $only = self::includes($rate);

        return round(array_sum(array_map(fn ($r) => $only === null || in_array($r['tax_type_id'] ?? null, $only, true) ? $r['tax_amount'] : 0.0, $earlier)), 2);
    }

    /** @return int[]|null the tax types a rate's base includes, or null for every earlier tax */
    public static function includes(TaxRate $rate): ?array
    {
        $raw = $rate->getRawOriginal('base_includes') ?? null;
        $list = is_string($raw) ? json_decode($raw, true) : $raw;

        return is_array($list) && $list ? array_map('intval', $list) : null;
    }

    /** The shape of every tax row, with its snapshot. */
    public static function rowOf(TaxRate $rate, int $ledgerId, float $base, float $tax, string $source, string $treatment = 'applies', array $extra = []): array
    {
        $label = trim(($rate->taxType?->code ?? 'Tax') . ' ' . rtrim(rtrim((string) $rate->rate_value, '0'), '.') . ($rate->isPercentage() ? '%' : ''));

        return [
            'tax_rate_id' => $rate->id, 'tax_type_id' => (int) $rate->group_id, 'ledger_id' => $ledgerId, 'label' => $label,
            'base_amount' => round($base, 2), 'tax_amount' => round($tax, 2), 'percent' => $rate->isPercentage() ? (float) $rate->rate_value : null,
            'snapshot' => [
                'version' => 1, 'source' => $source, 'treatment' => $treatment, 'tax_type_id' => (int) $rate->group_id, 'tax_rate_id' => $rate->id, 'rate_type' => $rate->rate_type,
                'rate_value' => (float) $rate->rate_value, 'secondary_rate_value' => $rate->getRawOriginal('secondary_rate_value') !== null ? (float) $rate->getRawOriginal('secondary_rate_value') : null,
                'calculation_base' => $rate->calculation_base, 'base_includes' => self::includes($rate), 'base_amount' => round($base, 2), 'tax_amount' => round($tax, 2),
            ] + $extra,
        ];
    }
}
