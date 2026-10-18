<?php

namespace App\Services\Stock;

use App\Models\Books\AccountingSetting;
use App\Models\Books\StockMovement;
use App\Models\Books\VoucherType;
use App\Models\StockCount;
use App\Models\StockCountIngredientLine;
use App\Models\StockCountLine;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use App\Services\Location\VariantStockService;
use App\Services\Menus\FoodLedgers;
use App\Services\Menus\IngredientStock;
use App\Services\Menus\StockCounts;
use App\Models\Menus\IngredientItem;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Counting a branch's shelves. Starting a count lists every batch the books say is there; the counter enters what is
 * actually found; posting corrects the batches to the counted quantities and books the net difference on a Journal
 * (a loss: Dr Stock Loss, Cr Stock; a gain the other way round). Lines left empty are not counted and stay as they are.
 * With Menus on, the kitchen's ingredient variants are on the same count (counted in packs, the bigger unit or the base unit) and their difference is booked on a Journal of its own:
 * a loss is Dr Food Waste Expense, Cr Food Ingredients Inventory, a gain the other way round.
 */
class StockCountService
{
    public function __construct(private VariantStockService $stock, private VoucherService $vouchers) {}

    public function start(int $locationId, ?string $note, ?User $user = null): StockCount
    {
        return DB::transaction(function () use ($locationId, $note, $user) {
            if (StockCount::where('location_id', $locationId)->where('status', 'open')->exists()) {
                throw new BooksException('This branch already has a count open. Post or cancel it first.');
            }
            $c = StockCount::create(['location_id' => $locationId, 'status' => 'open', 'note' => $note, 'created_by' => $user?->id]);
            $c->update(['number' => 'SC-' . str_pad((string) $c->id, 6, '0', STR_PAD_LEFT)]);
            $rows = DB::table('stock_batch_balances as bb')->join('stock_batches as sb', 'sb.id', '=', 'bb.batch_id')
                ->where('bb.location_id', $locationId)->where('bb.quantity', '>', 0)->orderBy('sb.variant_id')->orderBy('sb.expiry_date')->orderBy('sb.id')
                ->get(['sb.variant_id', 'bb.batch_id', 'bb.quantity', 'sb.unit_cost']);
            foreach ($rows as $r) {
                StockCountLine::create(['count_id' => $c->id, 'variant_id' => $r->variant_id, 'batch_id' => $r->batch_id, 'expected_qty' => $r->quantity, 'unit_cost' => $r->unit_cost]);
            }
            $ingredients = 0;
            if ($this->ingredientsOn()) {
                $ing = DB::table('menus_stock_batches')->where('location_id', $locationId)->where('qty_left', '>', 0)->groupBy('item_id')->orderBy('item_id')
                    ->selectRaw('item_id, SUM(qty_left) as q, SUM(qty_left * unit_cost) as v')->get();
                foreach ($ing as $r) {
                    StockCountIngredientLine::create(['count_id' => $c->id, 'item_id' => $r->item_id, 'expected_qty' => $r->q, 'unit_cost' => (float) $r->q > 0 ? round((float) $r->v / (float) $r->q, 6) : 0]);
                }
                $ingredients = $ing->count();
            }
            if ($rows->isEmpty() && $ingredients === 0) {
                throw new BooksException('There is no stock at this branch to count.');
            }

            return $c->load('lines');
        });
    }

    /**
     * @param array<int, float|string|null> $counted line id => quantity found ('' or null = not counted)
     * @param array<int, array{quantity: float|string|null, unit?: string}|null> $ingredients ingredient line id => what was found and the unit it was typed in (pack, alt or base)
     */
    public function save(StockCount $c, array $counted, array $ingredients = []): StockCount
    {
        $this->needOpen($c);
        foreach ($ingredients as $id => $v) {
            $l = $c->ingredientLines()->whereKey($id)->first();
            if (! $l) {
                continue;
            }
            $qty = is_array($v) ? ($v['quantity'] ?? null) : null;
            if ($qty === null || $qty === '') {
                $l->update(['counted_qty' => null, 'input_qty' => null, 'input_unit' => null]);
                continue;
            }
            if ((float) $qty < 0) {
                throw new BooksException('A counted quantity cannot be negative.');
            }
            $unit = (string) ($v['unit'] ?? 'base');
            $item = IngredientItem::with('ingredient.baseUnit', 'ingredient.altUnit')->findOrFail($l->item_id);
            $l->update(['input_qty' => round((float) $qty, 4), 'input_unit' => $unit, 'counted_qty' => $item->toBase($unit, round((float) $qty, 4))]);
        }
        foreach ($c->lines as $l) {
            if (array_key_exists($l->id, $counted)) {
                $v = $counted[$l->id];
                if ($v !== null && $v !== '' && (float) $v < 0) {
                    throw new BooksException('A counted quantity cannot be negative.');
                }
                $l->update(['counted_qty' => ($v === null || $v === '') ? null : round((float) $v, 4)]);
            }
        }

        return $c->load('lines');
    }

    /**
     * @param array<int, array{quantity: float|string|null, unit?: string}|null> $ingredients as for save()
     * @return array{lines:int, loss:float, gain:float, voucher_id:?int, ingredient_voucher_id:?int}
     */
    public function post(StockCount $c, array $counted = [], ?User $user = null, ?Carbon $on = null, array $ingredients = []): array
    {
        $this->needOpen($c);

        return DB::transaction(function () use ($c, $counted, $user, $on, $ingredients) {
            $this->save($c, $counted, $ingredients);
            $date = ($on ?? today())->toDateString();
            $loss = 0.0;
            $gain = 0.0;
            $n = 0;
            foreach ($c->lines()->get() as $l) {
                if ($l->counted_qty === null) {
                    continue;
                }
                $have = (float) DB::table('stock_batch_balances')->where('batch_id', $l->batch_id)->where('location_id', $c->location_id)->value('quantity');
                $diff = round((float) $l->counted_qty - $have, 4);
                if (abs($diff) < 0.00005) {
                    continue;
                }
                $this->stock->applyDelta((int) $l->variant_id, (int) $c->location_id, $diff, ['batch_id' => $l->batch_id, 'no_blend' => true]);
                StockMovement::create(['voucher_id' => null, 'voucher_item_id' => null, 'variant_id' => $l->variant_id, 'location_id' => $c->location_id, 'quantity' => $diff,
                    'movement_type' => $diff < 0 ? 'count_loss' : 'count_gain', 'movement_date' => $date, 'created_at' => now(),
                    'batch_id' => $l->batch_id, 'unit_cost' => $l->unit_cost, 'ref_type' => 'count', 'ref_id' => $c->id]);
                $diff < 0 ? $loss += -$diff * (float) $l->unit_cost : $gain += $diff * (float) $l->unit_cost;
                $n++;
            }
            $net = round($gain - $loss, 2);
            $voucherId = null;
            if (abs($net) >= 0.005) {
                $s = AccountingSetting::current();
                if (! $s->stock_loss_ledger_id || ! $s->stock_ledger_id) {
                    throw new BooksException('Choose the Stock and Stock Loss ledgers under Books → Settings → Default ledgers before posting a count.');
                }
                $journal = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');
                $abs = abs($net);
                $voucherId = $this->vouchers->create([
                    'voucher_type_id' => $journal->id, 'date' => $date, 'location_id' => $c->location_id,
                    'narration' => "Stock count {$c->number}: " . ($net < 0 ? 'shortage' : 'surplus'),
                    'meta' => ['stock_count' => ['count_id' => $c->id]],
                    'entries' => [
                        ['ledger_id' => $net < 0 ? $s->stock_loss_ledger_id : $s->stock_ledger_id, 'side' => 'D', 'amount' => $abs],
                        ['ledger_id' => $net < 0 ? $s->stock_ledger_id : $s->stock_loss_ledger_id, 'side' => 'C', 'amount' => $abs],
                    ],
                ], $user)->id;
            }
            // the kitchen's ingredients: the shelf is made to agree, the difference is one Journal against the food accounts
            $ingredientVoucherId = null;
            $hasIngredients = StockCounts::countsInstalled() && $c->ingredientLines()->exists();
            if ($hasIngredients) {
                [$ingNet, $m, $byKind] = $this->postIngredients($c, $user, Carbon::parse($date));
                $n += $m;
                $ingredientVoucherId = $this->bookIngredients($c, $byKind, $date, $user);
                $ingNet < 0 ? $loss += -$ingNet : $gain += $ingNet;
            }
            $c->update(['status' => 'posted', 'posted_by' => $user?->id, 'posted_at' => now(), 'voucher_id' => $voucherId] + ($hasIngredients ? ['ingredient_voucher_id' => $ingredientVoucherId] : []));

            return ['lines' => $n, 'loss' => round($loss, 2), 'gain' => round($gain, 2), 'voucher_id' => $voucherId, 'ingredient_voucher_id' => $ingredientVoucherId];
        });
    }

    /** Is the kitchen's stock part of counts (Menus on, script 187 run)? */
    public function ingredientsOn(): bool
    {
        return IngredientStock::moduleOn() && StockCounts::countsInstalled();
    }

    /** @return array{0: float, 1: int, 2: array<int, float>} what the differences of the counted ingredient lines are worth (a loss is negative), how many lines were changed, and the worth by kind of ingredient (0: none) */
    private function postIngredients(StockCount $c, ?User $user, Carbon $on): array
    {
        $counts = app(StockCounts::class);
        $net = 0.0;
        $n = 0;
        $byKind = [];
        foreach ($c->ingredientLines()->get() as $l) {
            if ($l->counted_qty === null) {
                continue;
            }
            $item = IngredientItem::with('ingredient')->find($l->item_id);
            if (! $item) {
                continue;
            }
            $r = $counts->adjust($item, (int) $c->location_id, (float) $l->counted_qty, (int) $c->id, $on, $user);
            $l->update(['variance_qty' => $r['variance'], 'value_change' => $r['value']]);
            $net += $r['value'];
            $kindId = (int) ($item->ingredient?->kind_id ?? 0);
            $byKind[$kindId] = ($byKind[$kindId] ?? 0.0) + $r['value'];
            $n += abs($r['variance']) > 0.00005 ? 1 : 0;
        }

        return [round($net, 2), $n, $byKind];
    }

    /**
     * The difference the count found, as one Journal. A loss of food is Dr Food Waste Expense, Cr the stock account; supplies and packaging are used up on purpose, so a shortfall of those is
     * charged to the kind's account (Kitchen Supplies Used) instead. A gain is the other way round.
     *
     * @param array<int, float> $byKind what the differences are worth by kind of ingredient (a loss is negative)
     */
    private function bookIngredients(StockCount $c, array $byKind, string $date, ?User $user): ?int
    {
        $on = Carbon::parse($date);
        $entries = FoodLedgers::countEntries($byKind, app(\App\Services\Menus\MenuMoney::class)->converter($on));
        if (! $entries) {
            return null;
        }
        $net = array_sum($byKind);
        $journal = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');

        return $this->vouchers->create([
            'voucher_type_id' => $journal->id, 'date' => $date, 'location_id' => $c->location_id,
            'narration' => "Stock count {$c->number} (ingredients): " . ($net < 0 ? 'stock missing' : 'stock found'),
            'meta' => ['stock_count' => ['count_id' => $c->id, 'ingredients' => true]],
            'entries' => $entries,
        ] + app(\App\Services\Menus\MenuMoney::class)->voucher($on), $user)->id;
    }

    public function cancel(StockCount $c): StockCount
    {
        $this->needOpen($c);
        $c->update(['status' => 'cancelled']);

        return $c;
    }

    private function needOpen(StockCount $c): void
    {
        if ($c->status !== 'open') {
            throw new BooksException("Count {$c->number} is already {$c->status}.");
        }
    }
}
