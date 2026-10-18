<?php

namespace App\Services\Menus;

use App\Models\Currency;
use App\Models\Menus\IngredientItem;
use App\Models\Menus\IngredientKind;
use App\Models\Menus\PackagingPrice;
use App\Services\Books\BooksException;
use App\Services\Books\TradingAccounts;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The packaging price list: for each item of the one ingredient kind that Menus, Configuration names as the packaging kind, the price of a single unit, the currency (empty: the Menus
 * currency) and the sales account (empty: the account the dishes are sold to). Items of any other kind cannot be priced; a price whose item has left the packaging kind, or whose kind is no longer
 * the packaging kind, stays but is greyed out and read-only until it is the packaging kind again.
 */
class PackagingPrices
{
    /** Has script 207 been run (with 190 for the kinds)? */
    public static function installed(): bool
    {
        return Schema::hasTable('menus_packaging_prices') && IngredientKinds::installed();
    }

    /** The kind chosen as packaging, or null when none is. */
    public function kind(): ?IngredientKind
    {
        $id = MenusSettings::all()['packaging_kind_id'] ?? null;

        return $id && IngredientKinds::installed() ? IngredientKind::find((int) $id) : null;
    }

    /**
     * Every packaging item with its price, then the prices that are greyed out.
     *
     * @return array{ready: bool, kind: ?array{id: int, name: string}, items: array<int, array<string, mixed>>, currencies: array<int, array<string, mixed>>, menus_currency_id: ?int}
     */
    public function all(): array
    {
        $out = ['ready' => self::installed(), 'kind' => null, 'items' => [], 'currencies' => [], 'menus_currency_id' => null];
        if (! $out['ready']) {
            return $out;
        }
        $kind = $this->kind();
        $out['kind'] = $kind ? ['id' => (int) $kind->id, 'name' => $kind->name] : null;
        $out['menus_currency_id'] = MenusSettings::all()['currency_id'] ? (int) MenusSettings::all()['currency_id'] : null;
        $out['currencies'] = Currency::where('is_active', true)->orderBy('code')->get(['id', 'code', 'name'])->map(fn ($c) => ['id' => (int) $c->id, 'code' => $c->code, 'name' => $c->name])->values()->all();
        $prices = PackagingPrice::all()->keyBy('item_id');
        $live = $kind ? IngredientItem::with('ingredient.baseUnit')->whereHas('ingredient', fn ($q) => $q->where('kind_id', $kind->id))->where('is_active', true)->get()
            ->sortBy(fn ($i) => mb_strtolower($i->ingredient->name.' '.$i->name))->values() : collect();
        foreach ($live as $i) {
            $out['items'][] = $this->row($i, $prices->get($i->id), false);
        }
        $seen = $live->pluck('id')->all();
        foreach ($prices->except($seen) as $p) {   // the item is no longer in the packaging kind (or the kind is not the packaging kind): kept, but not to be touched
            if ($i = IngredientItem::with('ingredient.baseUnit')->find($p->item_id)) {
                $out['items'][] = $this->row($i, $p, true);
            }
        }

        return $out;
    }

    /** @return array<string, mixed> */
    private function row(IngredientItem $i, ?PackagingPrice $p, bool $grey): array
    {
        $ing = $i->ingredient;

        return ['item_id' => (int) $i->id, 'name' => $ing->name.($i->name !== $ing->name ? ' - '.$i->name : ''), 'unit' => $ing->baseUnit?->code, 'price' => $p ? (float) $p->price : null,
            'currency_id' => $p?->currency_id ? (int) $p->currency_id : null, 'ledger_id' => $p?->ledger_id ? (int) $p->ledger_id : null, 'is_active' => $p ? (bool) $p->is_active : true, 'grey' => $grey];
    }

    /**
     * Set the prices: [{item_id, price, currency_id?, ledger_id?, is_active?}]. An empty price removes the item from the list. Only items of the packaging kind can be priced, and a greyed-out
     * row cannot be changed. Each item that is sent replaces what it had; items not sent are left as they are.
     *
     * @param array<int, array<string, mixed>> $rows
     * @return array<string, mixed> the list as it now is
     */
    public function save(array $rows): array
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 207_menus_packaging_prices.sql first (with 190 and 193 before it).');
        }
        $kind = $this->kind() ?? throw new BooksException('Choose which kind of ingredient is packaging under Menus, Configuration first.');
        $set = [];
        foreach ($rows as $r) {
            $item = IngredientItem::with('ingredient')->find((int) ($r['item_id'] ?? 0)) ?? throw new BooksException('One of the packaging items is not there any more.');
            $name = $item->ingredient->name;
            if ((int) $item->ingredient->kind_id !== (int) $kind->id) {
                throw new BooksException("{$name} is not of the kind {$kind->name}, which is the packaging kind: its price can not be changed.");
            }
            if (isset($set[$item->id])) {
                throw new BooksException("{$name} is listed twice.");
            }
            if (! isset($r['price']) || $r['price'] === '' || $r['price'] === null) {
                $set[$item->id] = null;   // off the list

                continue;
            }
            $price = round((float) $r['price'], 2);
            if ($price <= 0) {
                throw new BooksException("The price of {$name} must be more than nothing (or empty, to take it off the list).");
            }
            $currency = ! empty($r['currency_id']) ? (int) $r['currency_id'] : null;
            if ($currency && ! Currency::whereKey($currency)->where('is_active', true)->exists()) {
                throw new BooksException("The currency of {$name} is not available. Choose an active one, or leave it empty for the Menus currency.");
            }
            $ledger = ! empty($r['ledger_id']) ? (int) $r['ledger_id'] : null;
            if ($ledger && ($problem = TradingAccounts::problem($ledger, 'sales'))) {
                throw new BooksException($problem);
            }
            $set[$item->id] = ['item_id' => $item->id, 'price' => $price, 'currency_id' => $currency, 'ledger_id' => $ledger, 'is_active' => (bool) ($r['is_active'] ?? true)];
        }
        DB::transaction(function () use ($set) {
            foreach ($set as $itemId => $row) {
                if ($row === null) {
                    PackagingPrice::where('item_id', $itemId)->delete();
                } else {
                    PackagingPrice::updateOrCreate(['item_id' => $itemId], $row);
                }
            }
        });

        return $this->all();
    }

    /**
     * What one unit of a packaging item sells for, or null when it is not on the list, is switched off, or is greyed out. The currency is the row's, else the Menus currency (null: the base
     * currency); the account is the row's, else the one packaging is booked to by default.
     *
     * @return ?array{price: float, currency_id: ?int, ledger_id: ?int}
     */
    public function priceOf(int $itemId): ?array
    {
        if (! self::installed() || ! ($kind = $this->kind())) {
            return null;
        }
        $row = PackagingPrice::where('item_id', $itemId)->where('is_active', true)->first();
        $item = $row ? IngredientItem::with('ingredient')->find($itemId) : null;
        if (! $row || ! $item || (int) $item->ingredient->kind_id !== (int) $kind->id || ! $item->is_active) {
            return null;
        }
        $menus = MenusSettings::all()['currency_id'] ?? null;

        return ['price' => (float) $row->price, 'currency_id' => $row->currency_id ? (int) $row->currency_id : ($menus ? (int) $menus : null), 'ledger_id' => $row->ledger_id ? (int) $row->ledger_id : MenusSettings::packagingSalesLedgerId()];
    }
}
