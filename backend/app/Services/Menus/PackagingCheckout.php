<?php

namespace App\Services\Menus;

use App\Models\Menus\IngredientItem;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\OrderPackaging;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The packaging list at checkout: what the rules ask for (PackagingCalc), as the cashier changed it. The cashier may change a count (0 takes it off, with a reason if they like), swap an item for
 * another, or add any packaging item; prices always come from the price list, so no one types a price. A line the cashier says nothing about stays as the rules made it. The list an order was
 * checked out with is kept with the order, including what was taken off and why.
 */
class PackagingCheckout
{
    public function __construct(private PackagingCalc $calc, private PackagingPrices $prices)
    {
    }

    /** Has script 209 been run (with 208 and 207)? */
    public static function installed(): bool
    {
        return Schema::hasTable('menus_order_packaging') && PackagingRules::installed();
    }

    /**
     * The checkout list: the rules' list with the cashier's changes. `$given` is null (or empty) for no changes, else entries {item_id, quantity?, reason?, replaces?}: an entry for an item on the
     * list sets its count (0 takes it off); one with `replaces` swaps that item for item_id; one for any other packaging item adds it.
     *
     * @param array<int, array{dish: \App\Models\Menus\Dish, quantity: float|int, uses?: mixed}> $lines
     * @param ?array<int, array<string, mixed>> $given
     * @return array<int, array<string, mixed>> the lines (the calc's fields plus asked, source, replaces_item_id, reason, removed), in name order, with the ones taken off as well
     */
    public function resolve(array $lines, bool $takeaway, ?array $given): array
    {
        $base = array_column($this->calc->forLines($lines, $takeaway), null, 'item_id');
        foreach ($base as &$b) {
            $b += ['asked' => $b['quantity'], 'source' => 'rule', 'replaces_item_id' => null, 'reason' => null, 'removed' => false, 'waived' => 0.0];
        }
        unset($b);
        $given = array_values(array_filter((array) $given));
        if (! $given) {
            return $this->sorted($base);
        }
        if (! self::installed()) {
            throw new BooksException('Run database script 209_menus_order_packaging.sql first (with 207 and 208 before it): until then the packaging list can not be changed.');
        }
        $kind = $this->prices->kind() ?? throw new BooksException('Choose which kind of ingredient is packaging under Menus, Configuration first.');
        $out = $base;
        $seen = [];
        foreach ($given as $g) {
            $id = (int) ($g['item_id'] ?? 0);
            $replaces = ! empty($g['replaces']) ? (int) $g['replaces'] : null;
            $qty = isset($g['quantity']) && $g['quantity'] !== '' ? (int) $g['quantity'] : null;
            $reason = isset($g['reason']) && trim((string) $g['reason']) !== '' ? mb_substr(trim((string) $g['reason']), 0, 200) : null;
            if (isset($seen[$id])) {
                throw new BooksException('The packaging list has the same item twice.');
            }
            $seen[$id] = true;
            if ($qty !== null && ($qty < 0 || $qty > PackagingRules::MAX_QUANTITY)) {
                throw new BooksException('A packaging count must be from 0 to '.PackagingRules::MAX_QUANTITY.'.');
            }
            if ($replaces !== null) {   // swapped for another item
                $old = $base[$replaces] ?? throw new BooksException('That packaging line is not on the list to be swapped.');
                $this->assertPackaging($id, $kind->id);
                if (isset($out[$id]) && $id !== $replaces) {
                    throw new BooksException('That packaging item is already on the list.');
                }
                unset($out[$replaces]);
                $new = $this->calc->line($id, $qty ?? $old['quantity'], $old['compulsory'], true, [$old['receipt'] => true], $old['from']);
                $out[$id] = $new + ['asked' => $old['asked'], 'source' => 'swapped', 'replaces_item_id' => $replaces, 'reason' => $reason, 'removed' => ($qty ?? $old['quantity']) === 0];
            } elseif (isset($base[$id])) {   // an item the rules asked for: its count
                $q = $qty ?? $base[$id]['quantity'];
                $out[$id] = $this->calc->line($id, $q, $base[$id]['compulsory'], true, [$base[$id]['receipt'] => true], $base[$id]['from']) + ['asked' => $base[$id]['asked'], 'source' => 'rule', 'replaces_item_id' => null, 'reason' => $q === 0 ? $reason : null, 'removed' => $q === 0];
            } else {   // added
                $this->assertPackaging($id, $kind->id);
                $q = $qty ?? 1;
                $out[$id] = $this->calc->line($id, $q, false, true, ['auto' => true], []) + ['asked' => 0, 'source' => 'added', 'replaces_item_id' => null, 'reason' => null, 'removed' => $q === 0];
            }
        }

        return $this->sorted($this->withWaived($base, $out));
    }

    /**
     * A compulsory, priced line that ends with less to pay than the rules asked for (taken off, fewer, or swapped for something cheaper or free) has been waived by the amount of the difference. Adding
     * more, or changing a line that is free or optional, never counts.
     *
     * @param array<int, array<string, mixed>> $base the rules' list by item id
     * @param array<int, array<string, mixed>> $out the list with the changes, by item id
     * @return array<int, array<string, mixed>>
     */
    private function withWaived(array $base, array $out): array
    {
        foreach ($out as $k => $l) {
            $out[$k]['waived'] = $l['waived'] ?? 0.0;
        }
        foreach ($base as $id => $b) {
            if (! $b['needs_waive']) {
                continue;
            }
            $key = isset($out[$id]) && $out[$id]['source'] === 'rule' ? $id : array_key_first(array_filter($out, fn ($l) => ($l['replaces_item_id'] ?? null) === $id));
            if ($key !== null && $key !== false) {
                $out[$key]['waived'] = round(max(0.0, $b['amount'] - $out[$key]['amount']), 2);
            }
        }

        return $out;
    }

    /** May this person waive a compulsory charge for packaging? */
    public static function mayWaive(?User $by): bool
    {
        return (bool) $by?->hasPermission('menus.packaging.waive');
    }

    /**
     * What a checkout list waives, and whether this person may: [amount, the names of the lines, allowed].
     *
     * @param array<int, array<string, mixed>> $resolved
     * @return array{amount: float, items: string[], allowed: bool}
     */
    public function waiver(array $resolved, ?User $by): array
    {
        $lines = array_filter($resolved, fn ($l) => ($l['waived'] ?? 0) > 0);

        return ['amount' => round(array_sum(array_column($lines, 'waived')), 2), 'items' => array_values(array_column($lines, 'name')), 'allowed' => self::mayWaive($by)];
    }

    /** A sale may not go through with a waived charge unless the person holds the permission to waive packaging. @param array<int, array<string, mixed>> $resolved */
    public function assertMayWaive(array $resolved, ?User $by): void
    {
        $w = $this->waiver($resolved, $by);
        if ($w['amount'] > 0 && ! $w['allowed']) {
            throw new BooksException('Only someone who may waive packaging can take off or reduce '.implode(', ', $w['items']).': it is compulsory and has a price. Ask a manager.');
        }
    }

    /** @param array<int, array<string, mixed>> $lines @return array<int, array<string, mixed>> */
    private function sorted(array $lines): array
    {
        $lines = array_values($lines);
        usort($lines, fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return $lines;
    }

    private function assertPackaging(int $itemId, int $kindId): void
    {
        $item = IngredientItem::with('ingredient')->find($itemId) ?? throw new BooksException('One of the packaging items is not there any more.');
        if ((int) $item->ingredient->kind_id !== $kindId || ! $item->is_active) {
            throw new BooksException("{$item->ingredient->name} is not packaging that can be put on an order.");
        }
    }

    /**
     * The sale lines for the packaging that is charged: one line for each item, at the price of one unit, posted to the item's sales account (which decides the VAT). Lines taken off, and free
     * ones, are not sold.
     *
     * @param array<int, array<string, mixed>> $resolved
     * @return array<int, array<string, mixed>> voucher lines
     */
    public static function saleRows(array $resolved): array
    {
        $rows = [];
        foreach ($resolved as $l) {
            if ($l['quantity'] < 1 || ! $l['charged'] || $l['unit_price'] <= 0) {
                continue;
            }
            $ledger = $l['ledger_id'] ?: MenusSettings::packagingSalesLedgerId();
            if (! $ledger) {
                throw new BooksException('Choose the sales account packaging is booked to: under Menus, Configuration (the dishes\' sales account, or one for packaging), or on the item\'s price.');
            }
            $rows[] = ['type' => 'custom', 'description' => 'Packaging: '.$l['name'], 'quantity' => $l['quantity'], 'rate' => $l['unit_price'], 'ledger_id' => (int) $ledger];
        }

        return $rows;
    }

    /** The items a cashier may add or swap in: every active item of the packaging kind, with its price on the list (null: free). @return array<int, array{item_id: int, name: string, price: ?float}> */
    public function choices(): array
    {
        if (! PackagingRules::installed()) {
            return [];
        }
        $all = $this->prices->all();

        return array_values(array_map(fn ($i) => ['item_id' => $i['item_id'], 'name' => $i['name'], 'price' => $i['is_active'] ? $i['price'] : null], array_filter($all['items'], fn ($i) => ! $i['grey'])));
    }

    /** Keep the list an order was checked out with, replacing any earlier one. @param array<int, array<string, mixed>> $resolved */
    public function store(MenuOrder $o, array $resolved, ?User $by): void
    {
        if (! self::installed()) {
            return;
        }
        $this->assertMayWaive($resolved, $by);
        $logs = Schema::hasColumn('menus_order_packaging', 'waived_amount');   // script 210
        DB::transaction(function () use ($o, $resolved, $by, $logs) {
            OrderPackaging::where('order_id', $o->id)->delete();
            foreach ($resolved as $l) {
                OrderPackaging::create(['order_id' => $o->id, 'item_id' => $l['item_id'], 'name' => $l['name'], 'quantity' => $l['quantity'], 'asked' => $l['asked'], 'unit_price' => $l['unit_price'], 'amount' => $l['amount'],
                    'charged' => $l['charged'], 'compulsory' => $l['compulsory'], 'receipt' => $l['receipt'], 'source' => $l['source'], 'replaces_item_id' => $l['replaces_item_id'], 'reason' => $l['reason'], 'created_by' => $by?->id]
                    + ($logs ? ['waived_amount' => $l['waived'] ?? 0, 'waived_by' => ($l['waived'] ?? 0) > 0 ? $by?->id : null] : []));
            }
        });
    }

    /** The list an order was checked out with. @return array<int, array<string, mixed>> */
    public function forOrder(MenuOrder $o): array
    {
        return self::installed() ? OrderPackaging::where('order_id', $o->id)->orderBy('name')->get()->map(fn (OrderPackaging $r) => [
            'item_id' => (int) $r->item_id, 'name' => $r->name, 'quantity' => (int) $r->quantity, 'asked' => (int) $r->asked, 'unit_price' => (float) $r->unit_price, 'amount' => (float) $r->amount, 'charged' => (bool) $r->charged,
            'compulsory' => (bool) $r->compulsory, 'receipt' => $r->receipt, 'source' => $r->source, 'reason' => $r->reason, 'removed' => (int) $r->quantity === 0,
            'waived' => (float) ($r->waived_amount ?? 0), 'waived_by' => $r->waived_by ? (int) $r->waived_by : null])->all() : [];
    }
}
