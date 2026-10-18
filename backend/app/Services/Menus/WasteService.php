<?php

namespace App\Services\Menus;

use App\Models\Books\Voucher;
use App\Models\Menus\Dish;
use App\Models\Menus\DishBatch;
use App\Models\Menus\DishMove;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\IngredientItem;
use App\Models\Menus\PrepLot;
use App\Models\Menus\PrepMove;
use App\Models\Menus\StockBatch;
use App\Models\Menus\StockMove;
use App\Models\Menus\StockUse;
use App\Models\Menus\Waste;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The waste log: what was thrown away or eaten by staff, with a reason. What is wasted is an ingredient variant (Exe 2 kg), prepared food (a recipe of its own, from its batches: Dr Food Waste Expense,
 * Cr Prepared Food Inventory), or a dish: a dish made to order writes off the ingredients it is made of, a dish made ahead writes off its own portions. Stock leaves first-expiring first, expired and held lots included (spoilage is often exactly that),
 * at the cost of the lots, and the books get one journal: Dr Food Waste Expense, Cr Food Ingredients Inventory. Taking an entry back puts every lot's quantity back and cancels the journal.
 */
class WasteService
{
    private const EPS = 0.00005;

    private static ?bool $installed = null;

    public static function installed(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasTable('menus_waste') && Schema::hasColumn('menus_waste', 'item_id');
        }

        return self::$installed ??= Schema::hasTable('menus_waste') && Schema::hasColumn('menus_waste', 'item_id');
    }

    public function __construct(private IngredientUse $use, private VoucherService $vouchers)
    {
    }

    /**
     * @param array{location_id?: int, item_id?: ?int, batch_id?: ?int, dish_id?: ?int, recipe_id?: ?int, quantity: float, unit?: string, kind: string, note?: ?string, date?: ?string} $in `unit` (pack, alt or base) is for ingredient variants; a dish is counted in portions and prepared food in its recipe's own unit (`batch_id` then names one of its batches)
     */
    public function record(array $in, ?User $by = null): Waste
    {
        $kind = (string) ($in['kind'] ?? '');
        if (! isset(Waste::KINDS[$kind])) {
            throw new BooksException('Choose why it was wasted.');
        }
        $qty = round((float) ($in['quantity'] ?? 0), 4);
        if ($qty <= 0) {
            throw new BooksException('Enter how much.');
        }
        $loc = (int) ($in['location_id'] ?? 0) ?: (int) DB::table('locations')->where('is_active', 1)->orderByDesc('is_default')->orderBy('id')->value('id');
        if (! DB::table('locations')->where('id', $loc)->exists()) {
            throw new BooksException('Choose the branch.');
        }
        $item = ! empty($in['item_id']) ? IngredientItem::with('ingredient.baseUnit', 'ingredient.altUnit')->find((int) $in['item_id']) : null;
        $dish = ! $item && ! empty($in['dish_id']) ? Dish::find((int) $in['dish_id']) : null;
        $recipe = ! $item && ! $dish && ! empty($in['recipe_id']) ? DishRecipe::with('yieldUnit')->find((int) $in['recipe_id']) : null;
        // a dish made ahead and sold through its side is written off from the prepared food, as the dish
        $side = $dish && ! $recipe ? app(SideSales::class)->sideFor($dish) : null;
        if ($side && ! $side->recipe->made_to_order && Schema::hasColumn('menus_waste', 'recipe_id') && PrepProduction::installed()) {
            $recipe = $side->recipe;
            $qty = round($qty * app(SideSales::class)->perPortion($side), 4);
        }
        if (! $item && ! $dish && ! $recipe) {
            throw new BooksException('Choose what was wasted.');
        }
        $recipeIsDishCover = $recipe && $dish;   // set above: the dish is written off from its side's prepared food
        if ($recipe && (! Schema::hasColumn('menus_waste', 'recipe_id') || ! PrepProduction::installed())) {
            throw new BooksException('Run database script 199_menus_prepared_waste_counts.sql first: until then prepared food can not be written off.');
        }
        if ($recipe && $recipe->dish_id && ! $recipeIsDishCover) {
            throw new BooksException("{$recipe->title()} is a dish's recipe: a dish made ahead is written off as the dish.");
        }
        $note = mb_substr(trim((string) ($in['note'] ?? '')), 0, 200) ?: null;
        $date = ! empty($in['date']) ? Carbon::parse($in['date'])->toDateString() : today()->toDateString();
        if ($date > today()->toDateString()) {
            throw new BooksException('That day has not come yet.');
        }
        $reason = Waste::KINDS[$kind].($note ? ": {$note}" : '');
        $base = $item ? $item->toBase((string) ($in['unit'] ?? 'base'), $qty) : $qty;

        $onlyLot = ! empty($in['batch_id']) ? (int) $in['batch_id'] : null;   // an expiring lot is thrown away as that lot

        return DB::transaction(function () use ($item, $dish, $recipe, $base, $loc, $kind, $note, $date, $reason, $by, $onlyLot) {
            $w = Waste::create(['location_id' => $loc, 'item_id' => $item?->id, 'dish_id' => $dish?->id, 'quantity' => $base, 'cost' => 0, 'kind' => $kind, 'note' => $note, 'user_id' => $by?->id, 'wasted_on' => $date]
                + ($recipe ? ['recipe_id' => $recipe->id] : []));
            $useId = null;
            if ($item) {
                $cost = $this->writeOffItem($item, $loc, $base, $w, $date, $by, $onlyLot);
                $byKind = [(int) ($item->ingredient->kind_id ?? 0) => $cost];
            } elseif ($recipe) {
                $cost = $this->writeOffRecipe($recipe, $loc, $base, $w, $date, $by, $onlyLot);
                $byKind = [];
            } else {
                [$cost, $useId, $byKind] = $this->writeOffDish($dish, $loc, $base, $w, $date, $by);
            }
            $cost = round($cost, 2);
            $what = $item ? trim($item->ingredient->name.' '.$item->name) : ($dish ? $dish->name : $recipe->title());
            // waste is Food Waste Expense; what comes off the shelf is taken from the account each kind's stock is carried on (prepared food: Prepared Food Inventory)
            $journal = null;
            if ($cost > 0) {
                $journal = $recipe
                    ? $this->use->book(FoodLedgers::waste(), FoodLedgers::prepared(), $cost, "Waste: {$what} ({$reason})", $loc, Carbon::parse($date), $by)
                    : $this->use->bookKinds($byKind, 'waste', "Waste: {$what} ({$reason})", $loc, Carbon::parse($date), $by);
            }
            if ($journal && $useId) {
                StockUse::whereKey($useId)->update(['journal_id' => $journal->id]);
            }
            $w->update(['cost' => $cost, 'voucher_ids' => $journal ? [$journal->id] : null]);

            return $w->fresh();
        });
    }

    /** An ingredient variant thrown away: the lots it comes from, first-expiring first. @return float what it cost */
    private function writeOffItem(IngredientItem $item, int $loc, float $base, Waste $w, string $date, ?User $by, ?int $onlyLot = null): float
    {
        $lots = StockBatch::where('item_id', $item->id)->where('location_id', $loc)->where('qty_left', '>', 0)->when($onlyLot, fn ($q) => $q->whereKey($onlyLot))->lockForUpdate()->get()
            ->sortBy(fn (StockBatch $b) => [$b->expiry_date?->toDateString() ?? '9999-12-31', (int) $b->id])->values();
        $held = round((float) $lots->sum('qty_left'), 4);
        if ($held + self::EPS < $base) {
            $unit = $item->ingredient->baseUnit?->code;

            throw new BooksException("Only {$this->fmt($held)} {$unit} of ".trim($item->ingredient->name.' '.$item->name)." is on the shelf here, not {$this->fmt($base)}.");
        }
        $left = $base;
        $cost = 0.0;
        foreach ($lots as $b) {
            if ($left <= self::EPS) {
                break;
            }
            $take = round(min((float) $b->qty_left, $left), 4);
            StockBatch::whereKey($b->id)->update(['qty_left' => DB::raw('qty_left - '.number_format($take, 4, '.', ''))]);
            StockMove::create(['item_id' => $item->id, 'location_id' => $loc, 'batch_id' => $b->id, 'kind' => 'waste', 'quantity' => -$take, 'unit_cost' => $b->unit_cost, 'ref_type' => 'waste', 'ref_id' => $w->id,
                'note' => Waste::KINDS[$w->kind], 'moved_on' => $date, 'created_by' => $by?->id]);
            $cost += $take * (float) $b->unit_cost;
            $left = round($left - $take, 4);
        }

        return $cost;
    }

    /** A dish thrown away. Made to order: the ingredients it is made of. Made ahead: its own portions. @return array{0: float, 1: ?int, 2: array<int, float>} the cost, the record of the ingredients used, and the cost by kind of ingredient (0: none) */
    private function writeOffDish(Dish $dish, int $loc, float $portions, Waste $w, string $date, ?User $by): array
    {
        $recipe = DishRecipes::installed() ? DishRecipe::where('dish_id', $dish->id)->where('is_active', true)->first() : null;
        if (! $recipe) {
            throw new BooksException("{$dish->name} has no recipe, so there is nothing to write off.");
        }
        if ($recipe->made_to_order) {
            $r = $this->use->consume($recipe, $portions, $loc, ['type' => 'waste', 'id' => $w->id], $by, ['date' => $date, 'post' => false]);

            return [$r['cost'], $r['use_id'], $r['by_kind']];
        }
        $lots = DishBatch::where('dish_id', $dish->id)->where('location_id', $loc)->where('qty_left', '>', 0)->lockForUpdate()->get()
            ->sortBy(fn (DishBatch $b) => [$b->expiry_date?->toDateString() ?? '9999-12-31', (int) $b->id])->values();
        $held = round((float) $lots->sum('qty_left'), 4);
        if ($held + self::EPS < $portions) {
            throw new BooksException("Only {$this->fmt($held)} of {$dish->name} is on the shelf here, not {$this->fmt($portions)}.");
        }
        $left = $portions;
        $cost = 0.0;
        foreach ($lots as $b) {
            if ($left <= self::EPS) {
                break;
            }
            $take = round(min((float) $b->qty_left, $left), 4);
            DishBatch::whereKey($b->id)->update(['qty_left' => DB::raw('qty_left - '.number_format($take, 4, '.', ''))]);
            DishMove::create(['dish_id' => $dish->id, 'location_id' => $loc, 'batch_id' => $b->id, 'kind' => 'waste', 'quantity' => -$take, 'unit_cost' => $b->unit_cost, 'ref_type' => 'waste', 'ref_id' => $w->id,
                'note' => Waste::KINDS[$w->kind], 'moved_on' => $date, 'created_by' => $by?->id]);
            $cost += $take * (float) $b->unit_cost;
            $left = round($left - $take, 4);
        }

        return [$cost, null, [0 => $cost]];
    }

    /** Prepared food thrown away: the batches it comes from, first-expiring first (expired and held ones included). @return float what it cost */
    private function writeOffRecipe(DishRecipe $recipe, int $loc, float $qty, Waste $w, string $date, ?User $by, ?int $onlyLot = null): float
    {
        $lots = PrepLot::where('recipe_id', $recipe->id)->where('location_id', $loc)->where('qty_left', '>', 0)->when($onlyLot, fn ($q) => $q->whereKey($onlyLot))->lockForUpdate()->get()
            ->sortBy(fn (PrepLot $b) => [$b->expiry_date?->toDateString() ?? '9999-12-31', (int) $b->id])->values();
        $held = round((float) $lots->sum('qty_left'), 4);
        if ($held + self::EPS < $qty) {
            throw new BooksException("Only {$this->fmt($held)} {$this->unitOf($recipe)} of {$recipe->title()} is on the shelf here, not {$this->fmt($qty)}.");
        }
        $left = $qty;
        $cost = 0.0;
        foreach ($lots as $b) {
            if ($left <= self::EPS) {
                break;
            }
            $take = round(min((float) $b->qty_left, $left), 4);
            PrepLot::whereKey($b->id)->update(['qty_left' => DB::raw('qty_left - '.number_format($take, 4, '.', ''))]);
            PrepMove::create(['recipe_id' => $recipe->id, 'location_id' => $loc, 'lot_id' => $b->id, 'kind' => 'waste', 'quantity' => -$take, 'unit_cost' => $b->unit_cost, 'ref_type' => 'waste', 'ref_id' => $w->id,
                'note' => Waste::KINDS[$w->kind], 'moved_on' => $date, 'created_by' => $by?->id]);
            $cost += $take * (float) $b->unit_cost;
            $left = round($left - $take, 4);
        }

        return $cost;
    }

    private function unitOf(DishRecipe $recipe): string
    {
        return $recipe->yieldUnit?->code ?? 'portions';
    }

    /** A mistake: the stock goes back to the lots it came from and the journal is cancelled. */
    public function void(Waste $w, ?User $by = null): Waste
    {
        if ($w->voided_at) {
            throw new BooksException('That entry was already taken back.');
        }
        DB::transaction(function () use ($w, $by) {
            foreach (StockMove::where('ref_type', 'waste')->where('ref_id', $w->id)->where('kind', 'waste')->get() as $m) {
                $q = abs((float) $m->quantity);
                StockBatch::whereKey($m->batch_id)->update(['qty_left' => DB::raw('qty_left + '.number_format($q, 4, '.', ''))]);
                StockMove::create(['item_id' => $m->item_id, 'location_id' => $m->location_id, 'batch_id' => $m->batch_id, 'kind' => 'waste_reversal', 'quantity' => $q, 'unit_cost' => $m->unit_cost,
                    'ref_type' => 'waste', 'ref_id' => $w->id, 'note' => 'Waste entry taken back', 'moved_on' => today()->toDateString(), 'created_by' => $by?->id]);
            }
            foreach (DishMove::where('ref_type', 'waste')->where('ref_id', $w->id)->where('kind', 'waste')->get() as $m) {
                $q = abs((float) $m->quantity);
                DishBatch::whereKey($m->batch_id)->update(['qty_left' => DB::raw('qty_left + '.number_format($q, 4, '.', ''))]);
                DishMove::create(['dish_id' => $m->dish_id, 'location_id' => $m->location_id, 'batch_id' => $m->batch_id, 'kind' => 'waste_reversal', 'quantity' => $q, 'unit_cost' => $m->unit_cost,
                    'ref_type' => 'waste', 'ref_id' => $w->id, 'note' => 'Waste entry taken back', 'moved_on' => today()->toDateString(), 'created_by' => $by?->id]);
            }
            if (PrepProduction::installed()) {
                foreach (PrepMove::where('ref_type', 'waste')->where('ref_id', $w->id)->where('kind', 'waste')->get() as $m) {
                    $q = abs((float) $m->quantity);
                    PrepLot::whereKey($m->lot_id)->update(['qty_left' => DB::raw('qty_left + '.number_format($q, 4, '.', ''))]);
                    PrepMove::create(['recipe_id' => $m->recipe_id, 'location_id' => $m->location_id, 'lot_id' => $m->lot_id, 'kind' => 'waste_reversal', 'quantity' => $q, 'unit_cost' => $m->unit_cost,
                        'ref_type' => 'waste', 'ref_id' => $w->id, 'note' => 'Waste entry taken back', 'moved_on' => today()->toDateString(), 'created_by' => $by?->id]);
                }
            }
            $this->use->reverse('waste', $w->id, $by, 'Waste entry taken back');
            foreach ((array) $w->voucher_ids as $id) {
                $v = Voucher::find($id);
                if ($v && $v->status !== Voucher::CANCELLED) {
                    $this->vouchers->cancel($v, 'Waste entry taken back', $by);
                }
            }
            $w->update(['voided_at' => now(), 'voided_by' => $by?->id]);
        });

        return $w->fresh();
    }

    /** @return array<string, mixed> what was wasted in a period: by reason, by item, by day, and against food sales */
    public function report(string $from, string $to, ?int $location = null): array
    {
        $rows = Waste::whereBetween('wasted_on', [$from, $to])->whereNull('voided_at')->when($location, fn ($w) => $w->where('location_id', $location))->get();
        $names = $this->names($rows);
        $total = round((float) $rows->sum('cost'), 2);
        $sales = $this->foodSales($from, $to, $location);
        $key = fn (Waste $w) => $this->keyOf($w);

        return ['from' => $from, 'to' => $to, 'total' => $total, 'entries' => $rows->count(), 'sales' => $sales, 'percent_of_sales' => $sales > 0 ? round($total / $sales * 100, 2) : null,
            'by_kind' => collect(Waste::KINDS)->map(fn ($label, $k) => ['kind' => $k, 'label' => $label, 'cost' => round((float) $rows->where('kind', $k)->sum('cost'), 2), 'entries' => $rows->where('kind', $k)->count()])->values()->all(),
            'by_item' => $rows->groupBy($key)->map(fn ($g, $k) => ['key' => $k, 'name' => $names[$k]['name'] ?? $k, 'unit' => $names[$k]['unit'] ?? '', 'quantity' => round((float) $g->sum('quantity'), 4), 'cost' => round((float) $g->sum('cost'), 2)])
                ->sortByDesc('cost')->values()->take(10)->all(),
            'by_day' => $rows->groupBy(fn ($w) => $w->wasted_on->toDateString())->map(fn ($g, $d) => ['date' => $d, 'cost' => round((float) $g->sum('cost'), 2)])->sortKeys()->values()->all()];
    }

    /** @return array<int, array<string, mixed>> the latest entries */
    public function recent(?int $location = null, int $limit = 60): array
    {
        $rows = Waste::when($location, fn ($w) => $w->where('location_id', $location))->orderByDesc('wasted_on')->orderByDesc('id')->limit($limit)->get();
        $names = $this->names($rows);
        $users = DB::table('users')->whereIn('id', $rows->pluck('user_id')->filter())->pluck('name', 'id');

        return $rows->map(function (Waste $w) use ($names, $users) {
            $n = $names[$this->keyOf($w)] ?? ['name' => 'item', 'unit' => ''];

            return ['id' => $w->id, 'date' => $w->wasted_on->toDateString(), 'item' => $n['name'], 'unit' => $n['unit'], 'quantity' => (float) $w->quantity, 'cost' => (float) $w->cost,
                'kind' => $w->kind, 'kind_label' => Waste::KINDS[$w->kind] ?? $w->kind, 'note' => $w->note, 'by' => $users[$w->user_id] ?? null, 'voided' => (bool) $w->voided_at];
        })->all();
    }

    private function keyOf(Waste $w): string
    {
        return $w->item_id ? 'item:'.$w->item_id : ($w->dish_id ? 'dish:'.$w->dish_id : 'recipe:'.($w->recipe_id ?? 0));
    }

    /** @return array<string, array{name: string, unit: string}> keyed 'item:ID' / 'dish:ID' / 'recipe:ID' */
    private function names($rows): array
    {
        $out = [];
        $items = IngredientItem::with('ingredient.baseUnit')->whereIn('id', $rows->pluck('item_id')->filter())->get()->keyBy('id');
        foreach ($items as $i) {
            $out['item:'.$i->id] = ['name' => trim($i->ingredient->name.' '.$i->name), 'unit' => $i->ingredient->baseUnit?->code ?? ''];
        }
        foreach (Dish::whereIn('id', $rows->pluck('dish_id')->filter())->pluck('name', 'id') as $id => $name) {
            $out['dish:'.$id] = ['name' => $name, 'unit' => 'portions'];
        }
        if ($ids = $rows->pluck('recipe_id')->filter()->all()) {
            foreach (DishRecipe::with('yieldUnit')->whereIn('id', $ids)->get() as $r) {
                $out['recipe:'.$r->id] = ['name' => $r->title(), 'unit' => $this->unitOf($r)];
            }
        }

        return $out;
    }

    /** Food sold in the period before tax (paid or still to be paid, not cancelled): the base waste is compared with. */
    private function foodSales(string $from, string $to, ?int $location): float
    {
        if (! Schema::hasTable('menus_orders')) {
            return 0.0;
        }

        return round((float) DB::table('menus_orders')->whereNotIn('status', ['cancelled'])->whereIn('payment', ['paid', 'later', 'open'])->whereBetween(DB::raw('DATE(created_at)'), [$from, $to])
            ->when($location, fn ($q) => $q->where('location_id', $location))->sum('subtotal'), 2);
    }

    private function fmt(mixed $n): string
    {
        return rtrim(rtrim(number_format((float) $n, 4, '.', ''), '0'), '.');
    }
}
