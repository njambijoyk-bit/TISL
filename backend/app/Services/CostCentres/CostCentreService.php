<?php

namespace App\Services\CostCentres;

use App\Models\CostCentre;
use App\Models\Location;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Cost centres and their defaults. A cost centre is never missing: every document kind has a default (script 100 fills them with General),
 * and resolve() walks the fallbacks so no screen can fail for lack of one.
 */
class CostCentreService
{
    /** The kinds of document that have a default cost centre. key => label. */
    public const DEFAULT_KEYS = [
        'default_sales' => 'Sales',
        'default_purchases' => 'Purchases',
        'default_expenses' => 'Expenses and payments',
        'default_payroll' => 'Payroll',
        'default_stock' => 'Stock adjustments',
    ];

    // ------------------------------------------------------------------ tree

    /** Every cost centre as a flat list in tree order, each with its depth, path name and whether it has children. */
    public function tree(bool $withInactive = true): array
    {
        $rows = CostCentre::query()->orderBy('sort_order')->orderBy('name')->get();
        $locations = Location::pluck('name', 'id');
        $by = $rows->groupBy(fn ($r) => $r->parent_id ?? 0);
        $out = [];
        $walk = function ($parent, $depth, $path) use (&$walk, $by, &$out, $locations, $withInactive) {
            foreach ($by[$parent] ?? [] as $r) {
                if (! $withInactive && ! $r->is_active) {
                    continue;
                }
                $full = $path ? $path . ' › ' . $r->name : $r->name;
                $out[] = $r->toArray() + ['depth' => $depth, 'path' => $full, 'has_children' => isset($by[$r->id]), 'location_name' => $locations[$r->location_id] ?? null];
                $walk($r->id, $depth + 1, $full);
            }
        };
        $walk(0, 0, '');

        return $out;
    }

    /** The id of a cost centre and every cost centre beneath it (for roll-ups). */
    public function withDescendants(int $id): array
    {
        $ids = [$id];
        $frontier = [$id];
        while ($frontier) {
            $frontier = CostCentre::whereIn('parent_id', $frontier)->pluck('id')->all();
            $ids = array_merge($ids, $frontier);
        }

        return $ids;
    }

    // ------------------------------------------------------------ changes

    public function create(array $d): CostCentre
    {
        $this->checkParent(null, $d['parent_id'] ?? null);
        $parent = ! empty($d['parent_id']) ? CostCentre::find($d['parent_id']) : null;
        $row = CostCentre::create([
            'parent_id' => $parent?->id,
            // a child of a branch belongs to that branch's location
            'location_id' => $d['location_id'] ?? $parent?->location_id,
            'name' => $d['name'],
            'code' => $this->uniqueCode($d['code'] ?? null, $d['name']),
            'type' => 'other',
            'purpose' => $d['purpose'] ?? null,
            'description' => $d['description'] ?? null,
            'is_system' => false,
            'is_active' => true,
            'sort_order' => (int) ($d['sort_order'] ?? 100),
        ]);

        return $row;
    }

    public function update(CostCentre $c, array $d): CostCentre
    {
        if (array_key_exists('parent_id', $d)) {
            $this->checkParent($c->id, $d['parent_id']);
            if ($c->is_system && $d['parent_id'] !== $c->parent_id) {
                throw ValidationException::withMessages(['parent_id' => 'The built-in cost centres stay where they are.']);
            }
        }
        if (isset($d['is_active']) && ! $d['is_active'] && $c->is_system) {
            throw ValidationException::withMessages(['is_active' => 'The built-in cost centres cannot be switched off.']);
        }
        $c->fill(array_intersect_key($d, array_flip(['parent_id', 'name', 'purpose', 'description', 'is_active', 'sort_order'])));
        if (isset($d['code']) && $d['code'] !== $c->code) {
            $c->code = $this->uniqueCode($d['code'], $c->name, $c->id);
        }
        $c->save();

        return $c;
    }

    public function delete(CostCentre $c): void
    {
        if ($c->is_system) {
            throw ValidationException::withMessages(['id' => 'The built-in cost centres cannot be deleted.']);
        }
        if ($c->children()->exists()) {
            throw ValidationException::withMessages(['id' => 'Move or delete the cost centres under it first.']);
        }
        if (DB::table('cost_centre_settings')->where('value', (string) $c->id)->whereNot('key', 'line_override')->exists()) {
            throw ValidationException::withMessages(['id' => 'It is used as a default. Pick another default first.']);
        }
        $c->delete();
    }

    /** A cost centre may not sit under itself or one of its own descendants. */
    private function checkParent(?int $id, $parentId): void
    {
        if (! $parentId) {
            return;
        }
        if (! CostCentre::whereKey($parentId)->exists()) {
            throw ValidationException::withMessages(['parent_id' => 'That parent does not exist.']);
        }
        if ($id && in_array((int) $parentId, $this->withDescendants($id), true)) {
            throw ValidationException::withMessages(['parent_id' => 'A cost centre cannot sit under itself or under one of its own children.']);
        }
    }

    private function uniqueCode(?string $wanted, string $name, ?int $ignore = null): string
    {
        $base = strtoupper(preg_replace('/[^A-Za-z0-9]+/', '-', trim($wanted ?: $name), -1)) ?: 'CC';
        $base = trim(Str::limit($base, 26, ''), '-') ?: 'CC';
        $code = $base;
        $i = 2;
        while (CostCentre::where('code', $code)->when($ignore, fn ($q) => $q->whereKeyNot($ignore))->exists()) {
            $code = $base . '-' . $i++;
        }

        return $code;
    }

    // ----------------------------------------------------------- locations

    /** The branch's own cost centre: made once, named like the location, kept in step when the location is renamed. */
    public function ensureForLocation(Location $l): ?CostCentre
    {
        if (! CostCentre::ready() || ! \Illuminate\Support\Facades\Schema::hasColumn('locations', 'cost_centre_id')) {
            return null;
        }
        $cc = $l->cost_centre_id ? CostCentre::find($l->cost_centre_id) : CostCentre::where('location_id', $l->id)->where('type', 'branch')->first();
        if (! $cc) {
            $cc = CostCentre::create([
                'location_id' => $l->id, 'name' => $l->name, 'type' => 'branch', 'purpose' => 'branch', 'is_system' => true, 'is_active' => true,
                'code' => $this->uniqueCode('BR-' . ($l->code ?: $l->id), $l->name), 'sort_order' => 10 + (int) $l->sort_order,
            ]);
        } elseif ($cc->type === 'branch' && $cc->name !== $l->name) {
            $cc->update(['name' => $l->name]);
        }
        if ((int) $l->cost_centre_id !== $cc->id) {
            DB::table('locations')->where('id', $l->id)->update(['cost_centre_id' => $cc->id]);
        }

        return $cc;
    }

    // ------------------------------------------------------------ defaults

    public function settings(): array
    {
        return DB::table('cost_centre_settings')->pluck('value', 'key')->all();
    }

    public function saveSettings(array $d, ?int $by): array
    {
        $now = now();
        foreach (array_merge(['head_office', 'general'], array_keys(self::DEFAULT_KEYS)) as $k) {
            if (! array_key_exists($k, $d)) {
                continue;
            }
            if (! CostCentre::active()->whereKey((int) $d[$k])->exists()) {
                throw ValidationException::withMessages([$k => 'Pick an active cost centre.']);
            }
            DB::table('cost_centre_settings')->updateOrInsert(['key' => $k], ['value' => (string) (int) $d[$k], 'updated_by' => $by, 'updated_at' => $now]);
        }
        if (array_key_exists('line_override', $d)) {
            DB::table('cost_centre_settings')->updateOrInsert(['key' => 'line_override'], ['value' => $d['line_override'] ? '1' : '0', 'updated_by' => $by, 'updated_at' => $now]);
        }

        return $this->settings();
    }

    /**
     * The cost centre for a document that was given none: the configured default for its kind (sales, purchases ...), else the location's own,
     * else General. Never null once script 100 has run.
     */
    public function resolve(?string $kind = null, ?int $locationId = null): ?int
    {
        if (! CostCentre::ready()) {
            return null;
        }
        $s = $this->settings();
        $active = fn ($id) => $id && CostCentre::active()->whereKey((int) $id)->exists() ? (int) $id : null;

        return ($kind ? $active($s['default_' . $kind] ?? null) : null)
            ?? ($locationId ? $active(Location::whereKey($locationId)->value('cost_centre_id')) : null)
            ?? $active($s['general'] ?? null)
            ?? CostCentre::where('type', 'general')->value('id');
    }
}
