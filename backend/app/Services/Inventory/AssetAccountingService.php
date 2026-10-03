<?php

namespace App\Services\Inventory;

use App\Models\AssetDepreciation;
use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Currency;
use App\Models\Inventory\InventoryCategory;
use App\Models\Inventory\InventoryInstance;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\LedgerService;
use App\Services\Books\VoucherService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The books side of the asset register.
 *  - Each asset has a COST and a FLOOR in its own currency; depreciation stops when its book value reaches the floor
 *    (land: its value, so it never depreciates; a sofa: what it is still worth). Straight-line or reducing balance.
 *  - The first month is pro-rated by days from the date it went into service.
 *  - A month's depreciation is previewed, then posted by finance: one Journal per category and currency
 *    (Dr Depreciation Expense, Cr Accumulated Depreciation). Journals carry the asset's currency, so the books follow
 *    the same currency and base-currency rules as every other voucher.
 * Needs script 71.
 */
class AssetAccountingService
{
    public const METHODS = ['none' => 'Does not depreciate', 'straight_line' => 'Straight line', 'reducing_balance' => 'Reducing balance'];

    public function __construct(private VoucherService $vouchers, private LedgerService $ledgers) {}

    public static function ready(): bool
    {
        return Schema::hasTable('asset_depreciation') && Schema::hasColumn('inventory_instances', 'floor_value');
    }

    private function needTables(): void
    {
        if (! self::ready()) {
            throw new BooksException('Run script 71_asset_depreciation.sql before using depreciation.');
        }
    }

    // ── The numbers ──────────────────────────────────────────────────────────

    public function cost(InventoryInstance $a): float
    {
        return round((float) $a->purchase_cost, 2);
    }

    /** Depreciation so far: what it came with plus everything posted. */
    public function accumulated(InventoryInstance $a): float
    {
        $posted = (float) AssetDepreciation::where('instance_id', $a->id)->sum('amount');

        return round((float) $a->opening_accumulated + $posted, 2);
    }

    public function bookValue(InventoryInstance $a): float
    {
        return round($this->cost($a) - $this->accumulated($a), 2);
    }

    private function inService(InventoryInstance $a): ?Carbon
    {
        $d = $a->in_service_date ?? $a->purchase_date;

        return $d ? Carbon::parse($d)->startOfDay() : null;
    }

    private function live(InventoryInstance $a): bool
    {
        return ! $a->disposed_on && ! in_array($a->status, ['retired', 'disposed'], true);
    }

    /** Why an asset cannot be depreciated yet (null = it can). */
    public function problem(InventoryInstance $a, ?InventoryCategory $cat): ?string
    {
        if (($a->depreciation_method ?? 'none') === 'none' || $this->cost($a) <= 0 || ! $this->live($a)) {
            return null;   // nothing to do, not a problem
        }
        if (! $this->inService($a)) {
            return 'no purchase or in-service date';
        }
        if ($a->depreciation_method === 'straight_line' && (int) $a->useful_life_years < 1) {
            return 'no useful life';
        }
        if ($a->depreciation_method === 'reducing_balance' && (float) $a->depreciation_rate <= 0) {
            return 'no depreciation rate';
        }
        if (! $cat || ! $cat->expense_ledger_id || ! $cat->accumulated_ledger_id) {
            return 'its category has no depreciation ledgers';
        }

        return null;
    }

    /**
     * The months of depreciation an asset still owes up to (and including) the month ending on or before $upTo.
     *
     * @return array<int, array{period_end:string, amount:float}>
     */
    public function charges(InventoryInstance $a, Carbon $upTo): array
    {
        if (($a->depreciation_method ?? 'none') === 'none' || ! $this->live($a) || $this->cost($a) <= 0 || ! ($start = $this->inService($a))) {
            return [];
        }
        $cost  = $this->cost($a);
        $floor = min(max(round((float) $a->floor_value, 2), 0), $cost);
        $acc   = $this->accumulated($a);
        $from  = $a->depreciated_to ? Carbon::parse($a->depreciated_to)->addDay()->startOfMonth() : $start->copy()->startOfMonth();
        $out   = [];

        for ($m = $from->copy(); $m->copy()->endOfMonth()->startOfDay()->lte($upTo->copy()->startOfDay()); $m->addMonthNoOverflow()->startOfMonth()) {
            $nbv = round($cost - $acc, 2);
            if ($nbv - $floor <= 0.004) {
                break;
            }
            $days   = $m->daysInMonth;
            $factor = $m->isSameMonth($start) ? ($days - $start->day + 1) / $days : 1.0;
            if ($m->lt($start->copy()->startOfMonth())) {
                continue;
            }
            $charge = $a->depreciation_method === 'reducing_balance'
                ? $nbv * ((float) $a->depreciation_rate / 100) / 12 * $factor
                : ($cost - $floor) / max((int) $a->useful_life_years, 1) / 12 * $factor;
            $charge = round(min($charge, $nbv - $floor), 2);
            if ($charge <= 0) {
                continue;
            }
            $acc += $charge;
            $out[] = ['period_end' => $m->copy()->endOfMonth()->toDateString(), 'amount' => $charge];
        }

        return $out;
    }

    // ── Preview and post ─────────────────────────────────────────────────────

    /** What posting up to $upTo would do: per asset, and per category + currency (one Journal each month). */
    public function preview(Carbon $upTo, ?int $categoryId = null): array
    {
        $this->needTables();
        $cats = InventoryCategory::all()->keyBy('id');
        $names = Currency::pluck('code', 'id');
        $assets = [];
        $problems = [];
        $groups = [];

        $q = InventoryInstance::with('item:id,name,category_id')->whereNull('disposed_on')->whereNotIn('status', ['retired', 'disposed'])->where('depreciation_method', '!=', 'none');
        foreach ($q->get() as $a) {
            $catId = $a->item?->category_id;
            if ($categoryId && (int) $catId !== $categoryId) {
                continue;
            }
            $cat = $catId ? $cats->get($catId) : null;
            if ($why = $this->problem($a, $cat)) {
                $problems[] = ['instance_id' => $a->id, 'asset' => $this->label($a), 'reason' => $why];
                continue;
            }
            $rows = $this->charges($a, $upTo);
            if (! $rows) {
                continue;
            }
            $total = round(array_sum(array_column($rows, 'amount')), 2);
            $acc = $this->accumulated($a);
            $assets[] = ['instance_id' => $a->id, 'asset' => $this->label($a), 'category_id' => $catId, 'category' => $cat?->name, 'currency' => $names[$a->currency_id] ?? null,
                'cost' => $this->cost($a), 'floor' => round((float) $a->floor_value, 2), 'method' => $a->depreciation_method,
                'accumulated_before' => $acc, 'charge' => $total, 'accumulated_after' => round($acc + $total, 2), 'book_value_after' => round($this->cost($a) - $acc - $total, 2), 'months' => $rows];
            foreach ($rows as $r) {
                $k = $catId . '|' . ($a->currency_id ?? 0) . '|' . $r['period_end'];
                $groups[$k] ??= ['category_id' => $catId, 'category' => $cat?->name, 'currency_id' => $a->currency_id, 'currency' => $names[$a->currency_id] ?? null, 'period_end' => $r['period_end'], 'amount' => 0.0];
                $groups[$k]['amount'] = round($groups[$k]['amount'] + $r['amount'], 2);
            }
        }
        usort($groups, fn ($x, $y) => [$x['period_end'], $x['category']] <=> [$y['period_end'], $y['category']]);

        return ['up_to' => $upTo->toDateString(), 'assets' => $assets, 'journals' => array_values($groups), 'problems' => $problems,
            'total' => round(array_sum(array_column($groups, 'amount')), 2)];
    }

    /** Post it: the Journals, one per category + currency + month; each asset's months are recorded against its Journal. */
    public function post(Carbon $upTo, ?User $by, ?int $categoryId = null): array
    {
        $this->needTables();
        $type = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');
        $pre = $this->preview($upTo, $categoryId);
        if (! $pre['journals']) {
            throw new BooksException($pre['problems'] ? 'Nothing can be posted yet: fix what is listed under "Cannot be depreciated".' : 'Nothing is due for depreciation up to that month.');
        }
        $cats = InventoryCategory::all()->keyBy('id');

        return DB::transaction(function () use ($pre, $type, $by, $cats) {
            $made = [];
            foreach ($pre['journals'] as $j) {
                $cat = $cats->get($j['category_id']);
                $label = Carbon::parse($j['period_end'])->format('F Y');
                $v = $this->vouchers->create([
                    'voucher_type_id' => $type->id, 'date' => $j['period_end'], 'currency_id' => $j['currency_id'],
                    'narration' => "Depreciation {$label} — {$cat->name}",
                    'entries' => [['ledger_id' => $cat->expense_ledger_id, 'side' => 'D', 'amount' => $j['amount']], ['ledger_id' => $cat->accumulated_ledger_id, 'side' => 'C', 'amount' => $j['amount']]],
                    'meta' => ['depreciation' => ['period_end' => $j['period_end'], 'category_id' => $cat->id]],
                ], $by);
                foreach ($pre['assets'] as $a) {
                    if ((int) $a['category_id'] !== (int) $j['category_id'] || ($a['currency'] ?? null) !== ($j['currency'] ?? null)) {
                        continue;
                    }
                    foreach ($a['months'] as $r) {
                        if ($r['period_end'] === $j['period_end']) {
                            AssetDepreciation::create(['instance_id' => $a['instance_id'], 'period_end' => $r['period_end'], 'amount' => $r['amount'], 'currency_id' => $j['currency_id'], 'voucher_id' => $v->id, 'created_by' => $by?->id]);
                        }
                    }
                }
                $made[] = $v;
            }
            foreach ($pre['assets'] as $a) {
                InventoryInstance::where('id', $a['instance_id'])->update(['depreciated_to' => end($a['months'])['period_end']]);
            }

            return $made;
        });
    }

    /** A month posted by mistake: its Journal is cancelled and the assets owe that month again. */
    public function undo(int $voucherId, ?User $by): void
    {
        $this->needTables();
        $rows = AssetDepreciation::where('voucher_id', $voucherId)->get();
        if ($rows->isEmpty()) {
            throw new BooksException('That Journal is not a depreciation run.');
        }
        foreach ($rows as $r) {
            if (AssetDepreciation::where('instance_id', $r->instance_id)->where('period_end', '>', $r->period_end)->exists()) {
                throw new BooksException('A later month has been posted for some of these assets — undo the latest month first.');
            }
        }
        DB::transaction(function () use ($rows, $voucherId, $by) {
            $v = Voucher::findOrFail($voucherId);
            if ($v->status === Voucher::POSTED) {
                $this->vouchers->cancel($v, 'Depreciation undone', $by);
            }
            foreach ($rows as $r) {
                $r->delete();
                $latest = AssetDepreciation::where('instance_id', $r->instance_id)->max('period_end');
                InventoryInstance::where('id', $r->instance_id)->update(['depreciated_to' => $latest]);
            }
        });
    }

    // ── Buying an asset ──────────────────────────────────────────────────────

    /**
     * Book the purchase. mode: none (already in the books or opening) · link (a voucher that already booked it) · payment (pay now:
     * Dr the category's asset account, Cr the cash / bank paid from).
     */
    public function acquire(InventoryInstance $a, array $in, ?User $by): ?Voucher
    {
        $mode = $in['acquisition_mode'] ?? 'none';
        if ($mode === 'none' || $this->cost($a) <= 0) {
            return null;
        }
        if ($mode === 'link') {
            $v = Voucher::find($in['acquisition_voucher_id'] ?? null) ?? throw new BooksException('Choose the voucher that booked this purchase.');
            $a->update(['acquisition_voucher_id' => $v->id]);

            return $v;
        }
        if ($mode !== 'payment') {
            throw new BooksException('Choose how the purchase is booked.');
        }
        $cat = $a->item?->category_id ? InventoryCategory::find($a->item->category_id) : null;
        if (! $cat || ! $cat->asset_ledger_id) {
            throw new BooksException('Give the category an asset account first (Assets → Categories), or choose "Already in the books".');
        }
        $paid = Ledger::find($in['paid_ledger_id'] ?? null);
        $isCash = $paid && $this->ledgers->isUnderGroup($paid, 'Cash-in-hand');
        if (! $paid || (! $isCash && ! $this->ledgers->isUnderGroup($paid, 'Bank Accounts'))) {
            throw new BooksException('Choose the cash or bank account it was paid from.');
        }
        if ($isCash && $this->cost($a) - $this->ledgers->balance($paid->id) > 0.005) {
            throw new BooksException("{$paid->name} holds only " . number_format($this->ledgers->balance($paid->id), 2) . '.');
        }
        $type = VoucherType::byBase(VoucherType::PAYMENT) ?? throw new BooksException('The Payment voucher type is switched off.');
        $v = $this->vouchers->create([
            'voucher_type_id' => $type->id, 'date' => ($a->purchase_date ?? today())->toDateString(), 'ledger_id' => $paid->id, 'counter_ledger_id' => $cat->asset_ledger_id,
            'currency_id' => $a->currency_id, 'amount' => $this->cost($a), 'reference_no' => $a->asset_tag,
            'narration' => 'Asset bought: ' . $this->label($a),
            'meta' => ['asset' => ['instance_id' => $a->id]],
        ], $by);
        $a->update(['acquisition_voucher_id' => $v->id]);

        return $v;
    }

    /** The three ledgers a category posts to: the asset account, Accumulated Depreciation and Depreciation Expense — found or made. */
    public function setupLedgers(InventoryCategory $cat): InventoryCategory
    {
        $fixed = LedgerGroup::where('name', 'Fixed Assets')->first() ?? throw new BooksException('There is no Fixed Assets group in the chart of accounts.');
        $exp   = LedgerGroup::where('name', 'Indirect Expenses')->first() ?? throw new BooksException('There is no Indirect Expenses group in the chart of accounts.');
        $name  = $cat->name;
        $cat->update([
            'asset_ledger_id'       => $cat->asset_ledger_id ?: $this->ledgers->ensure($name, $fixed->id)->id,
            'accumulated_ledger_id' => $cat->accumulated_ledger_id ?: $this->ledgers->ensure("Accumulated Depreciation — {$name}", $fixed->id)->id,
            'expense_ledger_id'     => $cat->expense_ledger_id ?: $this->ledgers->ensure("Depreciation — {$name}", $exp->id)->id,
        ]);

        return $cat->fresh();
    }

    // ── Selling, disposing of or writing off an asset ────────────────────────

    /**
     * The Journal that takes an asset off the books: the cost and its accumulated depreciation come off, what was received
     * goes to cash / bank, and the difference is a loss or a gain on disposal. A write-off is the same with nothing received.
     * Depreciation must be posted up to the month before the disposal date (the disposal month itself is not depreciated).
     * in: date, proceeds, received_ledger_id (when there are proceeds)
     */
    public function retire(InventoryInstance $a, array $in, ?User $by): ?Voucher
    {
        $this->needTables();
        $cost = $this->cost($a);
        if ($cost <= 0 || $a->disposed_on) {
            return null;
        }
        $cat = $a->item?->category_id ? InventoryCategory::find($a->item->category_id) : null;
        if (! $cat || ! $cat->asset_ledger_id || ! $cat->accumulated_ledger_id) {
            throw new BooksException('The category has no asset / accumulated depreciation accounts, so the books cannot be updated. Set them under Settings → Categories, or untick "Update the books".');
        }
        $date = Carbon::parse($in['date'] ?? today())->startOfDay();
        if ($date->gt(today())) {
            throw new BooksException('The date cannot be in the future.');
        }
        $due = $this->charges($a, $date->copy()->startOfMonth()->subDay());
        if ($due) {
            throw new BooksException('Post depreciation up to ' . Carbon::parse(end($due)['period_end'])->format('F Y') . ' first (Depreciation & register), then record the disposal.');
        }
        $acc = min($this->accumulated($a), $cost);
        $proceeds = round((float) ($in['proceeds'] ?? 0), 2);
        if ($proceeds < 0) {
            throw new BooksException('Proceeds cannot be negative.');
        }
        $recv = null;
        if ($proceeds > 0) {
            $recv = Ledger::find($in['received_ledger_id'] ?? null);
            if (! $recv || (! $this->ledgers->isUnderGroup($recv, 'Cash-in-hand') && ! $this->ledgers->isUnderGroup($recv, 'Bank Accounts'))) {
                throw new BooksException('Choose the cash or bank account the money went into.');
            }
        }
        $nbv = round($cost - $acc, 2);
        $diff = round($proceeds - $nbv, 2);   // > 0 gain, < 0 loss
        $entries = [];
        if ($acc > 0) {
            $entries[] = ['ledger_id' => $cat->accumulated_ledger_id, 'side' => 'D', 'amount' => $acc, 'narration' => 'Accumulated depreciation removed'];
        }
        if ($proceeds > 0) {
            $entries[] = ['ledger_id' => $recv->id, 'side' => 'D', 'amount' => $proceeds, 'narration' => 'Sale proceeds'];
        }
        if ($diff < -0.004) {
            $entries[] = ['ledger_id' => $this->gainLossLedger('loss', $in)->id, 'side' => 'D', 'amount' => -$diff, 'narration' => 'Loss on disposal'];
        }
        $entries[] = ['ledger_id' => $cat->asset_ledger_id, 'side' => 'C', 'amount' => $cost, 'narration' => 'Asset removed at cost'];
        if ($diff > 0.004) {
            $entries[] = ['ledger_id' => $this->gainLossLedger('gain', $in)->id, 'side' => 'C', 'amount' => $diff, 'narration' => 'Gain on disposal'];
        }
        $type = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');

        return DB::transaction(function () use ($a, $type, $date, $entries, $by, $proceeds, $in) {
            $v = $this->vouchers->create([
                'voucher_type_id' => $type->id, 'date' => $date->toDateString(), 'currency_id' => $a->currency_id, 'reference_no' => $a->asset_tag,
                'narration' => ($proceeds > 0 ? 'Asset sold: ' : 'Asset written off: ') . $this->label($a),
                'entries' => $entries, 'meta' => ['asset' => ['instance_id' => $a->id, 'disposal' => true]],
            ], $by);
            $a->update(['disposed_on' => $date->toDateString(), 'disposal_voucher_id' => $v->id, 'sale_proceeds' => $proceeds > 0 ? $proceeds : null]);

            return $v;
        });
    }

    /** The ledger a gain or a loss on disposal goes to (an expense account chosen in `loss_ledger_id` / income in `gain_ledger_id`, else a default made on first use). */
    private function gainLossLedger(string $kind, array $in): Ledger
    {
        $given = $in[$kind . '_ledger_id'] ?? null;
        if ($given && ($l = Ledger::find($given))) {
            return $l;
        }
        $group = LedgerGroup::where('name', $kind === 'loss' ? 'Indirect Expenses' : 'Indirect Incomes')->first()
            ?? throw new BooksException('There is no ' . ($kind === 'loss' ? 'Indirect Expenses' : 'Indirect Incomes') . ' group to put the ' . $kind . ' on disposal under.');

        return $this->ledgers->ensure($kind === 'loss' ? 'Loss on disposal of assets' : 'Gain on disposal of assets', $group->id);
    }

    // ── Register against the ledgers ─────────────────────────────────────────

    /**
     * Per category: the register's total against the ledger it posts to — cost against the asset account, depreciation against the accumulated
     * account. The register is at today's exchange rates and the ledgers at the rates they were posted with, so for foreign-currency assets a
     * small difference is expected; for base-currency assets there should be none.
     */
    public function reconcile(): array
    {
        $reg = collect($this->register()['rows'])->groupBy('category_id');
        $out = [];
        foreach (InventoryCategory::orderBy('name')->get() as $c) {
            if (! $c->asset_ledger_id) {
                continue;
            }
            $rows = $reg->get($c->id, collect());
            $cost = round($rows->sum('base_cost'), 2);
            $accum = round($rows->sum('base_accumulated'), 2);
            $ledgerCost = round($this->ledgers->balance($c->asset_ledger_id), 2);
            $ledgerAcc = $c->accumulated_ledger_id ? round(-$this->ledgers->balance($c->accumulated_ledger_id), 2) : 0.0;
            $foreign = $rows->contains(fn ($r) => $r['currency'] !== $this->register()['base_currency']);
            $out[] = ['category_id' => $c->id, 'category' => $c->name, 'register_cost' => $cost, 'ledger_cost' => $ledgerCost, 'cost_difference' => round($cost - $ledgerCost, 2),
                'register_depreciation' => $accum, 'ledger_depreciation' => $ledgerAcc, 'depreciation_difference' => round($accum - $ledgerAcc, 2), 'has_foreign' => $foreign,
                'agrees' => abs($cost - $ledgerCost) < 0.01 && abs($accum - $ledgerAcc) < 0.01];
        }

        return $out;
    }

    // ── The register ─────────────────────────────────────────────────────────

    /** Every asset with cost, depreciation and book value — in its own currency and in today's base currency. */
    public function register(): array
    {
        $cur = Currency::all()->keyBy('id');
        $base = $cur->firstWhere('is_base', true);
        $rows = [];
        $tot = ['cost' => 0.0, 'accumulated' => 0.0, 'book_value' => 0.0];
        foreach (InventoryInstance::with('item:id,name,category_id')->whereNull('disposed_on')->whereNotIn('status', ['retired', 'disposed'])->orderBy('id')->get() as $a) {
            $c = $a->currency_id ? $cur->get($a->currency_id) : null;
            $rate = $c && ! $c->is_base ? (float) $c->conversion_rate : 1.0;   // today's rate into the base currency
            $cost = $this->cost($a);
            $acc = $this->accumulated($a);
            $rows[] = ['instance_id' => $a->id, 'asset_tag' => $a->asset_tag, 'asset' => $this->label($a), 'category_id' => $a->item?->category_id,
                'currency' => $c?->code ?? $base?->code, 'cost' => $cost, 'floor' => round((float) $a->floor_value, 2), 'accumulated' => $acc, 'book_value' => round($cost - $acc, 2),
                'method' => $a->depreciation_method, 'base_cost' => round($cost * $rate, 2), 'base_accumulated' => round($acc * $rate, 2), 'base_book_value' => round(($cost - $acc) * $rate, 2)];
            $tot['cost'] += $cost * $rate; $tot['accumulated'] += $acc * $rate; $tot['book_value'] += ($cost - $acc) * $rate;
        }

        return ['base_currency' => $base?->code, 'rows' => $rows, 'totals' => array_map(fn ($v) => round($v, 2), $tot)];
    }

    private function label(InventoryInstance $a): string
    {
        return trim(($a->asset_tag ? $a->asset_tag . ' · ' : '') . ($a->item?->name ?? 'Asset #' . $a->id));
    }
}
