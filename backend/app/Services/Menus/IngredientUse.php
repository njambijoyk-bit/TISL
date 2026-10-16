<?php

namespace App\Services\Menus;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\Ingredient;
use App\Models\Menus\StockBatch;
use App\Models\Menus\StockMove;
use App\Models\Menus\StockUse;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use App\Services\CurrencyConversionService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Using ingredient stock up for a dish, from Menus' own shelf. A recipe line names an ingredient; the ingredient's pick rule decides which variant's batches are taken:
 *   preferred      the first variant in the order set on the ingredient, its soonest-expiring batch first
 *   cheapest       the batch that cost least per base unit
 *   first_expiring the batch that expires soonest, whichever variant it is
 * Expired, held and recalled batches are never used. Using stock books Dr Food Cost of Sales, Cr Food Ingredients Inventory at what the batches cost, and every use is
 * recorded so it can be undone exactly (the same batches get their quantity back and the journal is cancelled).
 */
class IngredientUse
{
    private const EPS = 0.00005;

    public function __construct(private VoucherService $vouchers, private CurrencyConversionService $money)
    {
    }

    /**
     * What `$portions` of the recipe take, per ingredient, in the base unit and with the waste added back.
     * `$uses` are what a customer's choices change in each portion: an ingredient left out ("no onion": it takes nothing) or more of one (extra cheese: its amount is added).
     *
     * @param array<int, array{mode?: string, ingredient_id?: ?int, quantity?: ?float, unit?: ?string}> $uses
     * @return array<int, array{ingredient: Ingredient, qty: float}> keyed by ingredient id
     */
    public function needs(DishRecipe $r, float $portions, array $uses = []): array
    {
        $r->loadMissing('lines.ingredient.baseUnit', 'lines.ingredient.altUnit');
        $factor = $portions / max((float) $r->yield_qty, self::EPS);
        $left = array_map('intval', array_column(array_filter($uses, fn ($u) => ($u['mode'] ?? '') === 'remove' && ! empty($u['ingredient_id'])), 'ingredient_id'));
        $out = [];
        foreach ($r->lines as $l) {
            $ing = $l->ingredient;
            if (! $ing) {
                throw new BooksException('An ingredient of this recipe has been removed. Fix the recipe first.');
            }
            if (in_array((int) $ing->id, $left, true)) {
                continue;
            }
            $qty = $ing->toBase((float) $l->quantity, $l->unit) * $factor / (1 - (float) $l->waste_pct / 100);
            $out[$ing->id] = ['ingredient' => $ing, 'qty' => round(($out[$ing->id]['qty'] ?? 0) + $qty, 6)];
        }
        foreach ($uses as $u) {
            if (($u['mode'] ?? '') !== 'add' || empty($u['ingredient_id']) || (float) ($u['quantity'] ?? 0) <= 0) {
                continue;
            }
            $ing = $out[(int) $u['ingredient_id']]['ingredient'] ?? Ingredient::with('baseUnit', 'altUnit')->find((int) $u['ingredient_id']);
            if (! $ing) {
                throw new BooksException('An ingredient a choice uses has been removed.');
            }
            $out[$ing->id] = ['ingredient' => $ing, 'qty' => round(($out[$ing->id]['qty'] ?? 0) + $ing->toBase((float) $u['quantity'], (string) ($u['unit'] ?? 'base')) * $portions, 6)];
        }

        return $out;
    }

    /** The batches an ingredient may be taken from at a branch, in the order its pick rule takes them. @return \Illuminate\Support\Collection<int, StockBatch> */
    public function usable(Ingredient $ing, int $locationId, ?Carbon $on = null, bool $lock = false)
    {
        $on ??= today();
        $q = StockBatch::query()->join('menus_ingredient_items as it', 'it.id', '=', 'menus_stock_batches.item_id')
            ->where('it.ingredient_id', $ing->id)->where('it.is_allowed', true)->where('it.is_active', true)
            ->where('menus_stock_batches.location_id', $locationId)->where('menus_stock_batches.status', 'ok')->where('menus_stock_batches.qty_left', '>', 0)
            ->where(fn ($w) => $w->whereNull('menus_stock_batches.expiry_date')->orWhere('menus_stock_batches.expiry_date', '>=', $on->toDateString()))
            ->select('menus_stock_batches.*', 'it.preference as _pref');
        if ($lock) {
            $q->lockForUpdate();
        }
        $far = '9999-12-31';
        $key = fn (StockBatch $b) => [$b->expiry_date?->toDateString() ?? $far, (int) $b->_pref, $b->received_on?->toDateString() ?? '', (int) $b->id];

        return $q->get()->sort(match ($ing->pick_rule) {
            'cheapest' => fn ($a, $b) => [(float) $a->unit_cost, ...$key($a)] <=> [(float) $b->unit_cost, ...$key($b)],
            'first_expiring' => fn ($a, $b) => $key($a) <=> $key($b),
            default => fn ($a, $b) => [(int) $a->_pref, ...$key($a)] <=> [(int) $b->_pref, ...$key($b)],
        })->values();
    }

    /**
     * Where `$need` (base unit) comes from at a branch.
     *
     * @return array<int, array{batch: StockBatch, qty: float}>
     * @throws BooksException when the branch does not hold enough in total
     */
    public function allocate(Ingredient $ing, float $need, int $locationId, ?Carbon $on = null, bool $lock = false): array
    {
        $need = round($need, 4);
        if ($need <= self::EPS) {
            return [];
        }
        $left = $need;
        $out = [];
        $have = 0.0;
        foreach ($this->usable($ing, $locationId, $on, $lock) as $b) {
            $have += (float) $b->qty_left;
            if ($left > self::EPS) {
                $take = min($left, (float) $b->qty_left);
                $out[] = ['batch' => $b, 'qty' => round($take, 4)];
                $left -= $take;
            }
        }
        if ($left > self::EPS) {
            $ing->loadMissing('baseUnit');
            throw new BooksException("Not enough {$ing->name}: need {$this->fmt($need)} {$ing->baseUnit?->code}, have {$this->fmt($have)}.");
        }

        return $out;
    }

    /** How many portions the shelf could make now (the ingredient that runs out first decides). */
    public function capacity(DishRecipe $r, int $locationId): float
    {
        $per = $this->needs($r, 1.0);
        if (! $per) {
            return 0.0;
        }
        $cap = null;
        foreach ($per as $row) {
            $have = (float) $this->usable($row['ingredient'], $locationId)->sum('qty_left');
            $c = $row['qty'] > self::EPS ? $have / $row['qty'] : INF;
            $cap = $cap === null ? $c : min($cap, $c);
        }

        return is_infinite((float) $cap) ? 0.0 : floor(max(0.0, (float) $cap) * 10000) / 10000;
    }

    /** What one base unit of an ingredient costs at a branch: the average of what is on the shelf, else what it last cost. */
    public function unitCost(Ingredient $ing, int $locationId): ?float
    {
        $b = $this->usable($ing, $locationId);
        $qty = (float) $b->sum('qty_left');
        if ($qty > self::EPS) {
            return round($b->sum(fn ($x) => (float) $x->qty_left * (float) $x->unit_cost) / $qty, 6);
        }
        $last = StockBatch::join('menus_ingredient_items as it', 'it.id', '=', 'menus_stock_batches.item_id')->where('it.ingredient_id', $ing->id)->orderByDesc('menus_stock_batches.received_on')->orderByDesc('menus_stock_batches.id')->value('menus_stock_batches.unit_cost');

        return $last === null ? null : round((float) $last, 6);
    }

    /**
     * What one portion costs to make, from what the shelf holds (or what each ingredient last cost). `complete` is false when some ingredient has never been bought.
     *
     * @return array{per_portion: ?float, complete: bool, lines: array<int, array{ingredient_id: int, name: string, qty: float, unit: ?string, unit_cost: ?float, cost: ?float}>}
     */
    public function cost(DishRecipe $r, int $locationId): array
    {
        $lines = [];
        $total = 0.0;
        $complete = true;
        foreach ($this->needs($r, (float) $r->yield_qty) as $row) {
            $ing = $row['ingredient'];
            $uc = $this->unitCost($ing, $locationId);
            $cost = $uc === null ? null : round($row['qty'] * $uc, 4);
            $complete = $complete && $cost !== null;
            $total += $cost ?? 0.0;
            $lines[] = ['ingredient_id' => $ing->id, 'name' => $ing->name, 'qty' => round($row['qty'], 4), 'unit' => $ing->baseUnit?->code, 'unit_cost' => $uc, 'cost' => $cost];
        }
        $yield = max((float) $r->yield_qty, self::EPS);

        return ['per_portion' => $lines ? round($total / $yield, 4) : null, 'complete' => $complete && $lines !== [], 'lines' => $lines];
    }

    /**
     * Use the stock for `$portions` of the dish: batches go down, each movement is recorded, and the cost is booked. All or nothing.
     *
     * @param array{type: string, id: int} $ref what it was for (a voucher, a production run...)
     * @param array{date?: ?string, post?: bool, narration?: ?string, uses?: array} $o `uses`: what the customer's choices change (see needs()); `post` false leaves the booking to the caller
     * @return array{use_id: int, cost: float, journal_id: ?int}
     */
    public function consume(DishRecipe $r, float $portions, int $locationId, array $ref, ?User $by, array $o = []): array
    {
        $portions = round($portions, 4);
        if ($portions <= 0) {
            throw new BooksException('Use more than nothing.');
        }

        return DB::transaction(function () use ($r, $portions, $locationId, $ref, $by, $o) {
            $on = isset($o['date']) ? Carbon::parse($o['date']) : today();
            $use = StockUse::create(['ref_type' => $ref['type'], 'ref_id' => $ref['id'], 'dish_id' => $r->dish_id, 'recipe_id' => $r->id, 'location_id' => $locationId, 'portions' => $portions, 'cost' => 0, 'status' => 'posted', 'created_by' => $by?->id]);
            $total = 0.0;
            foreach ($this->needs($r, $portions, $o['uses'] ?? []) as $row) {
                foreach ($this->allocate($row['ingredient'], $row['qty'], $locationId, $on, true) as $a) {
                    /** @var StockBatch $b */
                    $b = $a['batch'];
                    StockBatch::whereKey($b->id)->update(['qty_left' => DB::raw('qty_left - '.number_format($a['qty'], 4, '.', ''))]);
                    StockMove::create([
                        'item_id' => $b->item_id, 'location_id' => $locationId, 'batch_id' => $b->id, 'kind' => 'use', 'quantity' => -$a['qty'], 'unit_cost' => $b->unit_cost, 'use_id' => $use->id,
                        'ref_type' => $ref['type'], 'ref_id' => $ref['id'], 'moved_on' => $on->toDateString(), 'created_by' => $by?->id,
                    ]);
                    $total += $a['qty'] * (float) $b->unit_cost;
                }
            }
            $total = round($total, 2);
            $journal = null;
            if ($total > 0 && ($o['post'] ?? true)) {
                $dish = $r->dish?->name ?? 'a dish';
                $journal = $this->book(FoodLedgers::cost(), FoodLedgers::inventory(), $total, $o['narration'] ?? "Ingredients used for {$this->fmt($portions)} x {$dish}", $locationId, $on, $by);
            }
            $use->update(['cost' => $total, 'journal_id' => $journal?->id]);

            return ['use_id' => $use->id, 'cost' => $total, 'journal_id' => $journal?->id];
        });
    }

    /** Undo what was used for something (a sale was cancelled or edited): the same batches get their quantity back, the journal is cancelled. Safe to call twice. */
    public function reverse(string $refType, int $refId, ?User $by, ?string $reason = null): int
    {
        $n = 0;
        foreach (StockUse::where('ref_type', $refType)->where('ref_id', $refId)->where('status', 'posted')->lockForUpdate()->get() as $use) {
            DB::transaction(function () use ($use, $by, $reason) {
                foreach (StockMove::where('use_id', $use->id)->where('kind', 'use')->get() as $m) {
                    $q = abs((float) $m->quantity);
                    StockBatch::whereKey($m->batch_id)->update(['qty_left' => DB::raw('qty_left + '.number_format($q, 4, '.', ''))]);
                    StockMove::create([
                        'item_id' => $m->item_id, 'location_id' => $m->location_id, 'batch_id' => $m->batch_id, 'kind' => 'use_reversal', 'quantity' => $q, 'unit_cost' => $m->unit_cost, 'use_id' => $use->id,
                        'ref_type' => $m->ref_type, 'ref_id' => $m->ref_id, 'note' => $reason, 'moved_on' => today()->toDateString(), 'created_by' => $by?->id,
                    ]);
                }
                if ($use->journal_id && ($j = Voucher::find($use->journal_id)) && $j->status !== Voucher::CANCELLED) {
                    $this->vouchers->cancel($j, $reason ?: 'The sale it was for was cancelled or changed', $by);
                }
                $use->update(['status' => 'reversed']);
            });
            $n++;
        }

        return $n;
    }

    /** Has stock been used (and not undone) for this? */
    public function usedFor(string $refType, int $refId): bool
    {
        return StockUse::where('ref_type', $refType)->where('ref_id', $refId)->where('status', 'posted')->exists();
    }

    /** A two-line journal in the base currency, debiting one account and crediting another. */
    public function book(int $debit, int $credit, float $amount, string $narration, int $locationId, Carbon $on, ?User $by): Voucher
    {
        $type = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');

        return $this->vouchers->create([
            'voucher_type_id' => $type->id, 'date' => $on->toDateString(), 'currency_id' => $this->money->getBaseCurrency()->id, 'narration' => $narration, 'location_id' => $locationId,
            'entries' => [['ledger_id' => $debit, 'side' => 'D', 'amount' => $amount], ['ledger_id' => $credit, 'side' => 'C', 'amount' => $amount]],
        ], $by);
    }

    private function fmt(mixed $n): string
    {
        return rtrim(rtrim(number_format((float) $n, 4, '.', ''), '0'), '.');
    }
}
