<?php

namespace App\Services\Books\Engine\Reports;

use App\Models\Books\VoucherType;
use App\Services\Access\BranchFilter;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;
use App\Services\Books\RestatedBase;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Trade by party and item (docs/BOOKS_REPORTS_PLAN.md, step 6.7, decision 18): what a party bought from us or sold to us, item by item, and the other way
 * round. It was "Stock movement", but it only ever counted sales, cash sales, credit notes, purchases and debit notes, so it is named for what it does;
 * real stock in and out is the stock journal and the stock reports (audit H2).
 *
 * What is asked decides what is shown:
 *   - a ledger: every item it was traded, with purchases and sales (quantity, value, effective rate);
 *   - an item: every ledger it was traded with;
 *   - both: every voucher line of that item for that ledger, to open.
 *
 * Values are in today's base currency, by the same rule as every report (audit H3). A return counts against what it returns. Cash and walk-in customers
 * with no ledger are grouped by the name on the voucher without regard to case or spacing (audit H5). Drafts and cancelled vouchers are left out.
 */
final class TradeReport extends ReportDefinition
{
    /** base type => [kind, sign]. Orders, quotes and delivery notes move no value, so they are not here. */
    private const MOVES = [
        VoucherType::SALES => ['sale', 1], VoucherType::CASH_SALE => ['sale', 1], VoucherType::CREDIT_NOTE => ['sale', -1],
        VoucherType::PURCHASE => ['purchase', 1], VoucherType::DEBIT_NOTE => ['purchase', -1],
    ];

    public function key(): string
    {
        return 'trade';
    }

    public function title(): string
    {
        return 'Trade by party and item';
    }

    public function filters(): array
    {
        return ['branch'];
    }

    public function options(): array
    {
        return [
            ['key' => 'ledger_id', 'label' => 'Party', 'type' => 'ledger', 'choices' => [], 'default' => ''],
            ['key' => 'item', 'label' => 'Item', 'type' => 'item', 'choices' => [], 'default' => ''],
        ];
    }

    /** The stock lines of posted vouchers in the period: products, and the kitchen's stock when Menus has put it on vouchers. */
    private function lines(Scope $scope): Builder
    {
        $kitchen = Schema::hasColumn('voucher_items', 'ingredient_item_id');
        $q = RestatedBase::join(DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id'))
            ->where('v.status', 'posted')->whereIn('t.base_type', array_keys(self::MOVES))
            ->where(fn ($w) => $w->whereNotNull('i.product_id')->when($kitchen, fn ($x) => $x->orWhere(fn ($k) => $k->where('i.item_type', 'ingredient')->whereNotNull('i.ingredient_item_id'))))
            ->where('i.item_type', '!=', 'charge')->where('i.is_header', false)
            ->when($scope->from, fn ($x) => $x->where('v.date', '>=', $scope->from))->when($scope->to, fn ($x) => $x->where('v.date', '<=', $scope->to))
            ->when($scope->locationId !== null, fn ($x) => $x->where('v.location_id', $scope->locationId));

        return app(BranchFilter::class)->apply($q, 'v.location_id', $scope->area, 'movement');
    }

    /** @return array{0: string, 1: int} what a line is an item of: a product, or the kitchen's stock variant */
    private function itemOf(object $r): array
    {
        return ($r->item_type ?? null) === 'ingredient' && ! empty($r->ingredient_item_id) ? ['ingredient', (int) $r->ingredient_item_id] : ['product', (int) $r->product_id];
    }

    /** @param array<int, array{0: string, 1: int}> $keys @return array<string, array{name: string, unit: ?string, sku: ?string, kind: ?string}> by "type:id" */
    private function describe(array $keys): array
    {
        $out = [];
        $products = array_values(array_unique(array_map(fn ($k) => $k[1], array_filter($keys, fn ($k) => $k[0] === 'product'))));
        $kitchen = array_values(array_unique(array_map(fn ($k) => $k[1], array_filter($keys, fn ($k) => $k[0] === 'ingredient'))));
        if ($products) {
            foreach (DB::table('products as p')->leftJoin('units_of_measure as u', 'u.id', '=', 'p.default_unit_id')->whereIn('p.id', $products)->get(['p.id', 'p.name', 'p.sku', 'u.code as unit']) as $r) {
                $out["product:{$r->id}"] = ['name' => $r->name, 'unit' => $r->unit, 'sku' => $r->sku, 'kind' => null];
            }
        }
        if ($kitchen && Schema::hasTable('menus_ingredient_items')) {
            $kinds = \App\Services\Menus\IngredientKinds::installed();
            $q = DB::table('menus_ingredient_items as it')->join('menus_ingredients as i', 'i.id', '=', 'it.ingredient_id')->leftJoin('units_of_measure as u', 'u.id', '=', 'i.base_unit_id');
            foreach (($kinds ? $q->leftJoin('menus_ingredient_kinds as k', 'k.id', '=', 'i.kind_id') : $q)->whereIn('it.id', $kitchen)
                ->get(['it.id', 'it.name as variant', 'it.code', 'i.name as ingredient', 'u.code as unit'] + ($kinds ? [5 => 'k.name as kind'] : [])) as $r) {
                $out["ingredient:{$r->id}"] = ['name' => "{$r->ingredient} — {$r->variant}", 'unit' => $r->unit, 'sku' => $r->code, 'kind' => ($r->kind ?? null) ?: 'Kitchen stock'];
            }
        }

        return $out;
    }

    /** @return array{0: string, 1: float, 2: float} kind, quantity and base-currency value of a line, with its sign */
    private function figure(object $r): array
    {
        [$kind, $sign] = self::MOVES[$r->base_type];
        $qty = (float) ($r->base_quantity ?: $r->quantity);

        return [$kind, $sign * $qty, $sign * round((float) $r->amount * (float) ($r->xr ?: 1), 2)];
    }

    /** The party of a line: its ledger, or the name typed on a cash voucher, ignoring case and spacing. @return array{0: string, 1: ?int, 2: string} */
    private function partyOf(object $r): array
    {
        if ($r->party_ledger_id) {
            return ['l:' . $r->party_ledger_id, (int) $r->party_ledger_id, (string) ($r->ledger_name ?? 'Ledger ' . $r->party_ledger_id)];
        }
        $name = trim((string) ($r->party_name ?? ''));
        $norm = mb_strtolower((string) preg_replace('/\s+/u', ' ', $name));

        return ['n:' . ($norm === '' ? 'walk-in' : $norm), null, $name === '' ? 'Walk-in / cash customers' : (string) preg_replace('/\s+/u', ' ', $name)];
    }

    private function rates(array $r): array
    {
        foreach (['purchase', 'sale'] as $k) {
            $r[$k . '_rate'] = abs($r[$k . '_qty']) > 0.00001 ? round($r[$k . '_value'] / $r[$k . '_qty'], 2) : null;   // value / quantity: the effective rate
            $r[$k . '_qty'] = round($r[$k . '_qty'], 4);
            $r[$k . '_value'] = round($r[$k . '_value'], 2);
        }

        return $r;
    }

    public function run(Scope $scope, array $options): array
    {
        $allParties = ($options['ledger_id'] ?? null) === 'all';   // an item's vouchers for every party
        $ledgerId = $allParties ? 0 : (int) ($options['ledger_id'] ?? 0);
        [$itemType, $itemId] = $this->parseItem((string) ($options['item'] ?? ''));
        if (! $ledgerId && ! $itemId) {
            return ['ready' => false, 'needs' => 'ledger_or_item', 'message' => 'Choose a party to see every item it traded, or an item to see every party it was traded with.', 'rows' => []];
        }
        $common = ['ready' => true, 'from' => $scope->from, 'to' => $scope->to, 'restated_vouchers' => RestatedBase::restatedCount()];
        if ($itemId && ($ledgerId || $allParties)) {
            return $common + $this->vouchersOf($scope, $itemType, $itemId, $ledgerId);
        }

        return $common + ($ledgerId ? $this->itemsOf($scope, $ledgerId) : $this->partiesOf($scope, $itemType, $itemId));
    }

    /** "product:12" or "ingredient:7". @return array{0: string, 1: int} */
    private function parseItem(string $v): array
    {
        if (preg_match('/^(product|ingredient):(\d+)$/', $v, $m)) {
            return [$m[1], (int) $m[2]];
        }

        return ['product', 0];
    }

    private function itemsOf(Scope $scope, int $ledgerId): array
    {
        $ledger = DB::table('ledgers')->where('id', $ledgerId)->first(['id', 'name']);
        abort_unless($ledger, 404, 'Ledger not found.');
        $kitchen = Schema::hasColumn('voucher_items', 'ingredient_item_id');
        $rows = [];
        foreach ($this->lines($scope)->where('v.party_ledger_id', $ledgerId)
            ->get(['i.product_id', 'i.item_type', 'i.quantity', 'i.base_quantity', 'i.amount', DB::raw(RestatedBase::rate() . ' as xr'), 't.base_type'] + ($kitchen ? [9 => 'i.ingredient_item_id'] : [])) as $r) {
            [$kind, $qty, $val] = $this->figure($r);
            [$type, $id] = $this->itemOf($r);
            $row = &$rows["{$type}:{$id}"];
            $row ??= ['item_type' => $type, 'item_id' => $id, 'product_id' => $type === 'product' ? $id : null, 'purchase_qty' => 0.0, 'purchase_value' => 0.0, 'sale_qty' => 0.0, 'sale_value' => 0.0];
            $row[$kind . '_qty'] += $qty;
            $row[$kind . '_value'] += $val;
            unset($row);
        }
        $names = $rows ? $this->describe(array_map(fn ($r) => [$r['item_type'], $r['item_id']], array_values($rows))) : [];
        $out = [];
        $tot = ['purchase_value' => 0.0, 'sale_value' => 0.0];
        foreach ($rows as $key => $r) {
            $r = $this->rates($r);
            $r['name'] = $names[$key]['name'] ?? "Item {$r['item_id']}";
            $r['unit'] = $names[$key]['unit'] ?? null;
            $r['kind'] = $names[$key]['kind'] ?? null;
            $tot['purchase_value'] += $r['purchase_value'];
            $tot['sale_value'] += $r['sale_value'];
            $out[] = $r;
        }
        usort($out, fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return ['mode' => 'ledger', 'ledger' => ['id' => (int) $ledger->id, 'name' => $ledger->name], 'rows' => $out,
            'totals' => ['purchase_value' => round($tot['purchase_value'], 2), 'sale_value' => round($tot['sale_value'], 2), 'items' => count($out)]];
    }

    private function itemQuery(Scope $scope, string $type, int $id): Builder
    {
        $q = $this->lines($scope);

        return $type === 'ingredient' ? $q->where('i.item_type', 'ingredient')->where('i.ingredient_item_id', $id) : $q->where('i.product_id', $id)->where('i.item_type', '!=', 'ingredient');
    }

    private function partiesOf(Scope $scope, string $type, int $id): array
    {
        $item = $this->describe([[$type, $id]])["{$type}:{$id}"] ?? null;
        abort_unless($item, 404, 'Item not found.');
        $rows = [];
        foreach ($this->itemQuery($scope, $type, $id)->leftJoin('ledgers as l', 'l.id', '=', 'v.party_ledger_id')
            ->get(['i.quantity', 'i.base_quantity', 'i.amount', DB::raw(RestatedBase::rate() . ' as xr'), 't.base_type', 'v.party_ledger_id', 'l.name as ledger_name', 'v.party_name']) as $r) {
            [$kind, $qty, $val] = $this->figure($r);
            [$key, $ledgerId, $name] = $this->partyOf($r);
            $row = &$rows[$key];
            $row ??= ['ledger_id' => $ledgerId, 'name' => $name, 'purchase_qty' => 0.0, 'purchase_value' => 0.0, 'sale_qty' => 0.0, 'sale_value' => 0.0];
            $row[$kind . '_qty'] += $qty;
            $row[$kind . '_value'] += $val;
            unset($row);
        }
        $out = array_map(fn ($r) => $this->rates($r), array_values($rows));
        usort($out, fn ($a, $b) => ($b['sale_value'] + $b['purchase_value']) <=> ($a['sale_value'] + $a['purchase_value']));

        return ['mode' => 'item', 'item' => ['id' => $id, 'item_type' => $type, 'name' => $item['name'], 'unit' => $item['unit']], 'rows' => $out,
            'totals' => ['purchase_value' => round(array_sum(array_column($out, 'purchase_value')), 2), 'sale_value' => round(array_sum(array_column($out, 'sale_value')), 2)]];
    }

    private function vouchersOf(Scope $scope, string $type, int $id, int $ledgerId): array
    {
        $item = $this->describe([[$type, $id]])["{$type}:{$id}"] ?? null;
        abort_unless($item, 404, 'Item not found.');
        $groups = ['sale' => ['kind' => 'Sales', 'rows' => [], 'qty' => 0.0, 'value' => 0.0], 'purchase' => ['kind' => 'Purchases', 'rows' => [], 'qty' => 0.0, 'value' => 0.0]];
        $q = $this->itemQuery($scope, $type, $id)->leftJoin('ledgers as l', 'l.id', '=', 'v.party_ledger_id')->when($ledgerId, fn ($w) => $w->where('v.party_ledger_id', $ledgerId))->orderBy('v.date')->orderBy('v.id');
        foreach ($q->get(['i.id as item_line', 'i.quantity', 'i.base_quantity', 'i.amount', 'i.variant_label', 'v.id as voucher_id', 'v.voucher_number', 'v.date', DB::raw(RestatedBase::rate() . ' as xr'),
            'v.party_name', 't.base_type', 't.name as type_name', 'l.name as ledger_name', 'v.party_ledger_id']) as $r) {
            [$kind, $qty, $val] = $this->figure($r);
            $groups[$kind]['rows'][] = ['voucher_id' => (int) $r->voucher_id, 'number' => $r->voucher_number, 'date' => substr((string) $r->date, 0, 10), 'type' => $r->type_name, 'base_type' => $r->base_type,
                'party' => $r->ledger_name ?? $r->party_name, 'party_ledger_id' => $r->party_ledger_id ? (int) $r->party_ledger_id : null, 'variant' => $r->variant_label,
                'qty' => round($qty, 4), 'rate' => abs($qty) > 0.00001 ? round($val / $qty, 2) : null, 'value' => round($val, 2)];
            $groups[$kind]['qty'] += $qty;
            $groups[$kind]['value'] += $val;
        }
        $out = [];
        foreach ($groups as $g) {
            if ($g['rows']) {
                $g['rate'] = abs($g['qty']) > 0.00001 ? round($g['value'] / $g['qty'], 2) : null;
                $g['qty'] = round($g['qty'], 4);
                $g['value'] = round($g['value'], 2);
                $out[] = $g;
            }
        }
        $ledger = $ledgerId ? DB::table('ledgers')->where('id', $ledgerId)->first(['id', 'name']) : null;

        return ['mode' => 'vouchers', 'item' => ['id' => $id, 'item_type' => $type, 'name' => $item['name'], 'unit' => $item['unit']], 'ledger' => $ledger ? ['id' => (int) $ledger->id, 'name' => $ledger->name] : null, 'groups' => $out];
    }

    public function table(array $data, Scope $scope): array
    {
        $sub = $this->period($scope);
        if (($data['ready'] ?? true) === false) {
            return ['title' => $this->title(), 'subtitle' => $sub, 'columns' => ['name' => 'Particulars'], 'rows' => []];
        }
        if ($data['mode'] === 'vouchers') {
            $rows = [];
            foreach ($data['groups'] as $g) {
                foreach ($g['rows'] as $r) {
                    $rows[] = ['kind' => $g['kind'], 'date' => $r['date'], 'party' => $r['party'], 'voucher' => $r['number'], 'qty' => $r['qty'], 'rate' => $r['rate'], 'value' => $r['value']];
                }
            }

            return ['title' => $this->title() . ': ' . $data['item']['name'], 'subtitle' => ($data['ledger']['name'] ?? '') . ' · ' . $sub,
                'columns' => ['kind' => 'Kind', 'date' => 'Date', 'party' => 'Particulars', 'voucher' => 'Voucher', 'qty' => 'Quantity', 'rate' => 'Basic rate', 'value' => 'Value'], 'rows' => $rows];
        }
        $rows = array_map(fn ($r) => ['name' => $r['name'], 'purchase_qty' => $r['purchase_qty'], 'purchase_rate' => $r['purchase_rate'], 'purchase_value' => $r['purchase_value'],
            'sale_qty' => $r['sale_qty'], 'sale_rate' => $r['sale_rate'], 'sale_value' => $r['sale_value']], $data['rows']);

        return ['title' => $this->title() . ': ' . ($data['mode'] === 'ledger' ? $data['ledger']['name'] : $data['item']['name']), 'subtitle' => $sub,
            'columns' => ['name' => $data['mode'] === 'ledger' ? 'Item' : 'Party', 'purchase_qty' => 'Purchases: quantity', 'purchase_rate' => 'Purchases: rate', 'purchase_value' => 'Purchases: value',
                'sale_qty' => 'Sales: quantity', 'sale_rate' => 'Sales: rate', 'sale_value' => 'Sales: value'],
            'rows' => $rows, 'totals' => ['name' => 'Grand total', 'purchase_value' => $data['totals']['purchase_value'], 'sale_value' => $data['totals']['sale_value']]];
    }
}
