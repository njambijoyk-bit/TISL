<?php

namespace App\Services\Menus;

use App\Models\Books\Voucher;
use App\Models\Menus\Dish;
use App\Models\Menus\DishBatch;
use App\Models\Menus\DishMove;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\StockUse;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What a sold dish takes off the kitchen's shelf. The books call this after a voucher with dish lines is saved, and before one is changed or cancelled:
 *   made to order   the recipe's ingredients are used up (IngredientUse), with what the customer's choices change
 *   made ahead      the portions already made are taken, soonest-expiring first, at what they cost to make
 * All of a voucher's use is booked as one journal, Dr Food Cost of Sales, Cr Food Ingredients Inventory. Only vouchers that move stock out (an invoice, a cash sale, a delivery
 * note) use stock; an order or a quotation does not. Undoing puts every batch back and cancels the journal. A dish with no recipe takes nothing.
 */
class DishStock
{
    private const EPS = 0.00005;

    public function __construct(private IngredientUse $use)
    {
    }

    public static function installed(): bool
    {
        return Schema::hasTable('menus_uses') && Schema::hasTable('menus_dish_batches') && Schema::hasColumn('voucher_items', 'dish_id');
    }

    /** Does this voucher use stock for its dishes? */
    private function uses(Voucher $v): bool
    {
        $v->loadMissing('type');

        return (bool) $v->moves_stock && $v->type?->stock_effect === 'out';
    }

    /** Use the stock for the dish lines of a voucher that was just saved. Inside the books' transaction: a shortage refuses the whole voucher. */
    public function apply(Voucher $v, ?User $by): void
    {
        if (! self::installed() || ! $this->uses($v)) {
            return;
        }
        $items = $v->items()->where('item_type', 'dish')->whereNotNull('dish_id')->where('is_header', false)->get();
        if ($items->isEmpty()) {
            return;
        }
        $loc = (int) ($v->location_id ?: \App\Models\Location::default()?->id);
        $date = $v->date instanceof Carbon ? $v->date->toDateString() : (string) $v->date;
        $uses = [];
        $total = 0.0;
        foreach ($items as $it) {
            $dish = Dish::find($it->dish_id);
            $recipe = $dish ? DishRecipe::where('dish_id', $dish->id)->where('is_active', true)->first() : null;
            $qty = (float) $it->quantity;
            if (! $recipe || $qty <= 0) {
                continue;   // nothing is written about what it is made of, so nothing is taken
            }
            $ref = ['type' => 'voucher', 'id' => (int) $v->id];
            if ($recipe->made_to_order) {
                $r = $this->use->consume($recipe, $qty, $loc, $ref, $by, ['date' => $date, 'post' => false, 'uses' => $this->choices($it->menu_uses)]);
            } else {
                $r = $this->sellAhead($dish, $recipe, $qty, $loc, $ref, $by, $date);
            }
            $uses[] = $r['use_id'];
            $total += $r['cost'];
        }
        $total = round($total, 2);
        if ($uses && $total > 0) {
            $journal = $this->use->book(FoodLedgers::cost(), FoodLedgers::inventory(), $total, "Food used for {$v->voucher_number}", $loc, Carbon::parse($date), $by);
            StockUse::whereIn('id', $uses)->update(['journal_id' => $journal->id]);
        }
    }

    /** The voucher is being changed or cancelled: take back what it used (the books apply it again afterwards if it is only changed). */
    public function undo(Voucher $v, ?User $by, ?string $reason = null): void
    {
        if (! self::installed()) {
            return;
        }
        $this->restoreDishes('voucher', (int) $v->id);
        $this->use->reverse('voucher', (int) $v->id, $by, $reason ?: 'The sale it was for was cancelled or changed');
    }

    /** @param mixed $raw the choices kept on a line @return array<int, array{mode: string, ingredient_id: ?int, quantity: ?float, unit: string}> */
    private function choices(mixed $raw): array
    {
        $rows = is_string($raw) ? (json_decode($raw, true) ?: []) : (array) $raw;

        return array_values(array_filter(array_map(fn ($u) => [
            'mode' => (string) ($u['mode'] ?? 'add'), 'ingredient_id' => ! empty($u['ingredient_id']) ? (int) $u['ingredient_id'] : null,
            'quantity' => isset($u['quantity']) ? (float) $u['quantity'] : null, 'unit' => (string) ($u['unit'] ?? 'base'),
        ], $rows), fn ($u) => $u['ingredient_id']));
    }

    // ── made ahead ──────────────────────────────────────────────────────

    /** Portions of a made-ahead dish that can be sold now at a branch (expired and held batches do not count). */
    public function portionsAhead(Dish $dish, int $locationId, ?Carbon $on = null): float
    {
        return round((float) $this->batches($dish->id, $locationId, $on)->sum('qty_left'), 4);
    }

    /** @return \Illuminate\Support\Collection<int, DishBatch> in the order they are sold */
    public function batches(int $dishId, int $locationId, ?Carbon $on = null, bool $lock = false)
    {
        $on ??= today();
        $q = DishBatch::where('dish_id', $dishId)->where('location_id', $locationId)->where('status', 'ok')->where('qty_left', '>', 0)
            ->where(fn ($w) => $w->whereNull('expiry_date')->orWhere('expiry_date', '>=', $on->toDateString()));
        if ($lock) {
            $q->lockForUpdate();
        }
        $far = '9999-12-31';

        return $q->get()->sortBy(fn (DishBatch $b) => [$b->expiry_date?->toDateString() ?? $far, $b->made_on?->toDateString() ?? '', (int) $b->id])->values();
    }

    /** @return array{use_id: int, cost: float} */
    private function sellAhead(Dish $dish, DishRecipe $recipe, float $portions, int $loc, array $ref, ?User $by, string $date): array
    {
        $left = round($portions, 4);
        $have = 0.0;
        $take = [];
        foreach ($this->batches($dish->id, $loc, Carbon::parse($date), true) as $b) {
            $have += (float) $b->qty_left;
            if ($left > self::EPS) {
                $q = min($left, (float) $b->qty_left);
                $take[] = [$b, round($q, 4)];
                $left -= $q;
            }
        }
        if ($left > self::EPS) {
            throw new BooksException("Not enough {$dish->name} made: need {$this->fmt($portions)}, have {$this->fmt($have)}. Make a batch first.");
        }
        $use = StockUse::create(['ref_type' => $ref['type'], 'ref_id' => $ref['id'], 'dish_id' => $dish->id, 'recipe_id' => $recipe->id, 'location_id' => $loc, 'portions' => $portions, 'cost' => 0, 'status' => 'posted', 'created_by' => $by?->id]);
        $cost = 0.0;
        foreach ($take as [$b, $q]) {
            DishBatch::whereKey($b->id)->update(['qty_left' => DB::raw('qty_left - '.number_format($q, 4, '.', ''))]);
            DishMove::create(['dish_id' => $dish->id, 'location_id' => $loc, 'batch_id' => $b->id, 'kind' => 'sale', 'quantity' => -$q, 'unit_cost' => $b->unit_cost, 'use_id' => $use->id,
                'ref_type' => $ref['type'], 'ref_id' => $ref['id'], 'moved_on' => $date, 'created_by' => $by?->id]);
            $cost += $q * (float) $b->unit_cost;
        }
        $use->update(['cost' => round($cost, 2)]);

        return ['use_id' => $use->id, 'cost' => round($cost, 2)];
    }

    private function restoreDishes(string $refType, int $refId): void
    {
        foreach (StockUse::where('ref_type', $refType)->where('ref_id', $refId)->where('status', 'posted')->get() as $use) {
            foreach (DishMove::where('use_id', $use->id)->where('kind', 'sale')->get() as $m) {
                $q = abs((float) $m->quantity);
                DishBatch::whereKey($m->batch_id)->update(['qty_left' => DB::raw('qty_left + '.number_format($q, 4, '.', ''))]);
                DishMove::create(['dish_id' => $m->dish_id, 'location_id' => $m->location_id, 'batch_id' => $m->batch_id, 'kind' => 'sale_reversal', 'quantity' => $q, 'unit_cost' => $m->unit_cost,
                    'use_id' => $use->id, 'ref_type' => $m->ref_type, 'ref_id' => $m->ref_id, 'moved_on' => today()->toDateString()]);
            }
        }
    }

    private function fmt(mixed $n): string
    {
        return rtrim(rtrim(number_format((float) $n, 4, '.', ''), '0'), '.');
    }
}
