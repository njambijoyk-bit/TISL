<?php

namespace App\Services\Codes\Items;

use App\Services\Codes\CodeException;
use App\Services\Codes\CodeFactory;
use App\Services\Codes\CodeSettings;
use App\Services\Codes\Linear\Gs1;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The things that can carry a code and the code each has now: product variants, packs and cartons of a variant, stock batches and inventory assets. This is the one place that
 * knows their tables, so the Codes page, scanning and labels all agree. Batches carry a code made from their number (nothing is stored); the others store theirs in `barcode`.
 */
final class CodeCatalogue
{
    public const TYPES = [
        'variant' => 'Product',
        'pack' => 'Pack or carton',
        'asset' => 'Asset',
        'batch' => 'Stock batch',
    ];

    /** where each type keeps its code: table, column */
    private const STORE = ['variant' => ['product_variants', 'barcode'], 'pack' => ['product_variant_units', 'barcode'], 'asset' => ['inventory_instances', 'barcode']];

    public static function packsReady(): bool
    {
        return Schema::hasTable('product_variant_units') && Schema::hasColumn('product_variant_units', 'barcode');
    }

    public static function batchCode(int $id): string
    {
        return 'LOT' . str_pad((string) $id, 8, '0', STR_PAD_LEFT);
    }

    // ------------------------------------------------------------ listing

    private function query(string $type): Builder
    {
        return match ($type) {
            'variant' => DB::table('product_variants as v')->join('products as p', 'p.id', '=', 'v.product_id')
                ->leftJoin('product_variant_units as u', fn ($j) => $j->on('u.variant_id', '=', 'v.id')->where('u.role', '=', 'base'))
                ->leftJoin('currencies as c', 'c.id', '=', 'p.currency_id')
                ->whereNull('v.deleted_at')->whereNull('p.deleted_at')
                ->select('v.id', 'p.name as product', 'v.name as variant', 'v.sku', 'v.barcode as code', 'u.price', 'c.code as currency'),
            'pack' => DB::table('product_variant_units as u')->join('product_variants as v', 'v.id', '=', 'u.variant_id')->join('products as p', 'p.id', '=', 'v.product_id')
                ->leftJoin('units_of_measure as m', 'm.id', '=', 'u.unit_id')->leftJoin('currencies as c', 'c.id', '=', 'p.currency_id')
                ->where('u.role', '!=', 'base')->whereNull('v.deleted_at')->whereNull('p.deleted_at')
                ->select('u.id', 'p.name as product', 'v.name as variant', 'v.sku', 'u.barcode as code', 'u.price', 'c.code as currency', 'm.name as unit', 'u.contains_qty', 'u.base_factor'),
            'asset' => DB::table('inventory_instances as i')->join('inventory_items as it', 'it.id', '=', 'i.item_id')->whereNull('i.deleted_at')
                ->select('i.id', 'it.name as product', 'i.asset_tag as sku', 'i.serial_number', 'i.barcode as code'),
            'batch' => DB::table('stock_batches as b')->join('product_variants as v', 'v.id', '=', 'b.variant_id')->join('products as p', 'p.id', '=', 'v.product_id')
                ->select('b.id', 'p.name as product', 'v.name as variant', 'v.sku', 'b.batch_no', 'b.expiry_date'),
            default => throw new CodeException("There is no \"{$type}\" kind of item."),
        };
    }

    /** @param array{q?: ?string, missing?: bool, page?: int, per_page?: int} $f @return array{data: array<int, array<string, mixed>>, total: int, page: int, per_page: int, last_page: int} */
    public function list(string $type, array $f = []): array
    {
        if ($type === 'pack' && ! self::packsReady()) {
            return ['data' => [], 'total' => 0, 'page' => 1, 'per_page' => 25, 'last_page' => 1];
        }
        $q = $this->query($type);
        if (($s = trim((string) ($f['q'] ?? ''))) !== '') {
            $like = '%' . str_replace(['%', '_'], ['\%', '\_'], $s) . '%';
            $q->where(function ($w) use ($type, $like, $s) {
                match ($type) {
                    'variant' => $w->where('p.name', 'like', $like)->orWhere('v.name', 'like', $like)->orWhere('v.sku', 'like', $like)->orWhere('v.barcode', 'like', $like),
                    'pack' => $w->where('p.name', 'like', $like)->orWhere('v.name', 'like', $like)->orWhere('v.sku', 'like', $like)->orWhere('u.barcode', 'like', $like),
                    'asset' => $w->where('it.name', 'like', $like)->orWhere('i.asset_tag', 'like', $like)->orWhere('i.serial_number', 'like', $like)->orWhere('i.barcode', 'like', $like),
                    'batch' => $w->where('p.name', 'like', $like)->orWhere('v.name', 'like', $like)->orWhere('b.batch_no', 'like', $like)->orWhere('v.sku', 'like', $like),
                };
                if ($type === 'batch' && preg_match('/^LOT0*(\d+)$/i', $s, $m)) {
                    $w->orWhere('b.id', (int) $m[1]);
                }
            });
        }
        if (! empty($f['missing']) && isset(self::STORE[$type])) {
            $col = ['variant' => 'v.barcode', 'pack' => 'u.barcode', 'asset' => 'i.barcode'][$type];
            $q->where(fn ($w) => $w->whereNull($col)->orWhere($col, ''));
        }
        $total = (clone $q)->count();
        $per = max(1, min(100, (int) ($f['per_page'] ?? 25)));
        $page = max(1, (int) ($f['page'] ?? 1));
        $rows = $q->orderBy($type === 'asset' ? 'i.id' : ($type === 'pack' ? 'u.id' : ($type === 'batch' ? 'b.id' : 'v.id')), 'desc')->forPage($page, $per)->get();

        return ['data' => $rows->map(fn ($r) => $this->shape($type, $r))->all(), 'total' => $total, 'page' => $page, 'per_page' => $per, 'last_page' => max(1, (int) ceil($total / $per))];
    }

    /** @return array<string, mixed>|null */
    public function find(string $type, int $id): ?array
    {
        if ($type === 'pack' && ! self::packsReady()) {
            return null;
        }
        $key = ['variant' => 'v.id', 'pack' => 'u.id', 'asset' => 'i.id', 'batch' => 'b.id'][$type] ?? throw new CodeException("There is no \"{$type}\" kind of item.");
        $r = $this->query($type)->where($key, $id)->first();

        return $r ? $this->shape($type, $r) : null;
    }

    /** @return array<string, mixed> */
    private function shape(string $type, object $r): array
    {
        $label = match ($type) {
            'variant' => self::join([$r->product, $this->variantName($r)]),
            'pack' => self::join([$r->product, $this->variantName($r), ($r->unit ?? 'pack') . ($r->contains_qty ? ' × ' . rtrim(rtrim((string) $r->contains_qty, '0'), '.') : '')]),
            'asset' => self::join([$r->product, $r->sku ?: $r->serial_number]),
            'batch' => self::join([$r->product, $this->variantName($r), 'batch ' . $r->batch_no . ($r->expiry_date ? ' · expires ' . substr((string) $r->expiry_date, 0, 10) : '')]),
        };
        $derived = $type === 'batch';
        $code = $derived ? self::batchCode((int) $r->id) : ($r->code !== null && $r->code !== '' ? (string) $r->code : null);

        return [
            'type' => $type, 'id' => (int) $r->id, 'label' => $label, 'sku' => $r->sku ?? null, 'code' => $code, 'derived' => $derived,
            'price' => isset($r->price) && $r->price !== null ? (float) $r->price : null, 'currency' => $r->currency ?? null,
            'batch_no' => $r->batch_no ?? null, 'expiry' => isset($r->expiry_date) && $r->expiry_date ? substr((string) $r->expiry_date, 0, 10) : null,
            'name' => trim(($r->product ?? '') . ($type !== 'asset' && $this->variantName($r) !== '' ? ' — ' . $this->variantName($r) : '')),
        ];
    }

    private function variantName(object $r): string
    {
        $v = (string) ($r->variant ?? '');

        return strcasecmp($v, (string) ($r->product ?? '')) === 0 ? '' : $v;   // a product with one variant often repeats its own name
    }

    private static function join(array $parts): string
    {
        return implode(' · ', array_filter(array_map('trim', array_map('strval', $parts)), fn ($p) => $p !== ''));
    }

    // ------------------------------------------------------------ giving and changing codes

    /** Is this code in use by something other than the item named (or kept as a retired code of another item)? */
    public function taken(string $code, ?string $exceptType = null, ?int $exceptId = null): bool
    {
        foreach (self::STORE as $type => [$table, $col]) {
            if ($type === 'pack' && ! self::packsReady()) {
                continue;
            }
            $q = DB::table($table)->where($col, $code);
            if ($exceptType === $type && $exceptId !== null) {
                $q->where('id', '!=', $exceptId);
            }
            if ($q->exists()) {
                return true;
            }
        }
        if (preg_match('/^LOT\d{8}$/', $code)) {
            return $exceptType !== 'batch';   // that shape is reserved for batches
        }
        if (Schema::hasTable('code_aliases')) {
            $q = DB::table('code_aliases')->where('code', $code);
            if ($exceptType !== null && $exceptId !== null) {
                $q->where(fn ($w) => $w->where('item_type', '!=', $exceptType)->orWhere('item_id', '!=', $exceptId));
            }
            if ($q->exists()) {
                return true;
            }
        }

        return false;
    }

    /** Check a code a person typed is one we can print and nothing else has. */
    public function assertUsable(string $code, string $type, int $id): void
    {
        if ($code === '' || strlen($code) > 64) {
            throw new CodeException('A code is 1 to 64 characters.');
        }
        if (preg_match('/[^\x20-\x7e]/', $code)) {
            throw new CodeException('A code can only use plain letters, digits and punctuation (no accents or emoji).');
        }
        if (ctype_digit($code) && in_array(strlen($code), [8, 12, 13, 14], true) && ! Gs1::valid($code)) {
            throw new CodeException('This looks like a retail barcode but its check digit is wrong (it should end in ' . Gs1::checkDigit(substr($code, 0, -1)) . ').');
        }
        if ($this->taken($code, $type, $id)) {
            throw new CodeException("The code {$code} is already used by something else.");
        }
    }

    /** Set (or replace) an item's code. The old one is kept so labels already stuck on shelves still scan. */
    public function setCode(string $type, int $id, string $code, ?int $by, ?string $reason = null): void
    {
        if (! isset(self::STORE[$type])) {
            throw new CodeException($type === 'batch' ? 'A batch code is made from its number and can not be changed.' : "There is no \"{$type}\" kind of item.");
        }
        $item = $this->find($type, $id) ?? throw new CodeException('That item was not found.');
        $code = trim($code);
        if ($item['code'] === $code) {
            return;
        }
        $this->assertUsable($code, $type, $id);
        [$table, $col] = self::STORE[$type];
        DB::transaction(function () use ($table, $col, $type, $id, $code, $item, $by, $reason) {
            if ($item['code'] !== null && Schema::hasTable('code_aliases')) {
                DB::table('code_aliases')->insert(['item_type' => $type, 'item_id' => $id, 'code' => $item['code'], 'reason' => $reason ?: 'Replaced by ' . $code, 'retired_by' => $by, 'created_at' => now(), 'updated_at' => now()]);
            }
            DB::table($table)->where('id', $id)->update([$col => $code]);
        });
    }

    /** The next internal code that nothing uses: for products and packs an EAN-13 in the store's own range; for an asset "AST" and its number. */
    public function generate(string $type, int $id, ?int $by = null): string
    {
        $item = $this->find($type, $id) ?? throw new CodeException('That item was not found.');
        if ($item['derived']) {
            return $item['code'];
        }
        if ($item['code'] !== null) {
            throw new CodeException('This item already has a code.');
        }
        if ($type === 'asset') {
            $code = 'AST' . str_pad((string) $id, 8, '0', STR_PAD_LEFT);
        } else {
            $prefix = (string) CodeSettings::all()['internal_prefix'];
            do {
                $body = $prefix . str_pad((string) $this->nextNumber('internal'), 10, '0', STR_PAD_LEFT);
                $code = $body . Gs1::checkDigit($body);
            } while ($this->taken($code));
        }
        $this->setCode($type, $id, $code, $by, 'First code');

        return $code;
    }

    private function nextNumber(string $name): int
    {
        if (! Schema::hasTable('code_sequences')) {
            throw new CodeException('Codes are not set up yet: run database script 119_codes.sql first.');
        }

        return DB::transaction(function () use ($name) {
            $row = DB::table('code_sequences')->where('name', $name)->lockForUpdate()->first();
            if (! $row) {
                DB::table('code_sequences')->insert(['name' => $name, 'next_value' => 2]);

                return 1;
            }
            DB::table('code_sequences')->where('name', $name)->update(['next_value' => $row->next_value + 1]);

            return (int) $row->next_value;
        });
    }

    /**
     * Give a code to every item in the list that has none.
     *
     * @param  array<int, array{type: string, id: int}>  $items
     * @return array{made: array<int, array{type: string, id: int, code: string}>, kept: int, failed: array<int, array{type: string, id: int, message: string}>}
     */
    public function assign(array $items, ?int $by): array
    {
        $out = ['made' => [], 'kept' => 0, 'failed' => []];
        foreach ($items as $it) {
            try {
                $found = $this->find($it['type'], (int) $it['id']);
                if (! $found) {
                    throw new CodeException('That item was not found.');
                }
                if ($found['code'] !== null) {
                    $out['kept']++;

                    continue;
                }
                $out['made'][] = ['type' => $it['type'], 'id' => (int) $it['id'], 'code' => $this->generate($it['type'], (int) $it['id'], $by)];
            } catch (CodeException $e) {
                $out['failed'][] = ['type' => $it['type'], 'id' => (int) $it['id'], 'message' => $e->getMessage()];
            }
        }

        return $out;
    }

    // ------------------------------------------------------------ finding what a scanned code is

    /**
     * What a scanned or typed code belongs to. Tries the code as it is, as a UPC-A/EAN-13 twin (a scanner may add or drop the leading 0), as a SKU, as a batch or asset code and,
     * last, among codes an item used to have (marked retired).
     *
     * @return array<int, array<string, mixed>>
     */
    public function lookup(string $scanned): array
    {
        $code = trim($scanned);
        if ($code === '') {
            return [];
        }
        $tries = [$code];
        if (ctype_digit($code)) {
            if (strlen($code) === 12) {
                $tries[] = '0' . $code;
            } elseif (strlen($code) === 13 && $code[0] === '0') {
                $tries[] = substr($code, 1);
            }
        }
        $found = [];
        $add = function (string $type, $id, bool $retired = false) use (&$found) {
            $key = $type . ':' . $id;
            if (! isset($found[$key]) && ($item = $this->find($type, (int) $id))) {
                $found[$key] = $item + ['retired' => $retired];
            }
        };
        foreach ($tries as $t) {
            foreach (DB::table('product_variants')->whereNull('deleted_at')->where('barcode', $t)->pluck('id') as $id) {
                $add('variant', $id);
            }
            if (self::packsReady()) {
                foreach (DB::table('product_variant_units')->where('barcode', $t)->pluck('id') as $id) {
                    $add('pack', $id);
                }
            }
            foreach (DB::table('inventory_instances')->whereNull('deleted_at')->where(fn ($w) => $w->where('barcode', $t)->orWhere('asset_tag', $t)->orWhere('serial_number', $t))->pluck('id') as $id) {
                $add('asset', $id);
            }
            if (preg_match('/^LOT(\d{8})$/i', $t, $m)) {
                $add('batch', (int) $m[1]);
            }
        }
        if (! $found) {
            foreach (DB::table('product_variants')->whereNull('deleted_at')->whereRaw('LOWER(sku) = ?', [strtolower($code)])->pluck('id') as $id) {
                $add('variant', $id);
            }
        }
        if (! $found && Schema::hasTable('code_aliases')) {
            foreach (DB::table('code_aliases')->whereIn('code', $tries)->get(['item_type', 'item_id']) as $a) {
                $add($a->item_type, $a->item_id, true);
            }
        }

        return array_values($found);
    }
}
