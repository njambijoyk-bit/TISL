<?php

namespace App\Services\Menus;

use App\Models\Menus\Audience;
use App\Models\Menus\ModifierPolicy;
use App\Models\Menus\Serving;
use App\Services\Books\BooksException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The small lists Menus configuration keeps, each the restaurant's own: servings (Jumbo, Medium, Kids), audiences (Adults, Kids) and the policies that price removing or adding something
 * (free, a fixed fee, a percentage of the dish price). Exactly one policy is the default.
 */
class MenusLists
{
    /** list => [model, what one is called] */
    public const TYPES = ['servings' => [Serving::class, 'serving'], 'audiences' => [Audience::class, 'audience'], 'policies' => [ModifierPolicy::class, 'policy']];

    public const POLICY_KINDS = ['free' => 'Free', 'fixed' => 'A fixed fee', 'percent' => 'A percentage of the dish price'];

    /** Has script 193 been run? */
    public static function installed(): bool
    {
        return Schema::hasTable('menus_servings') && Schema::hasTable('menus_audiences') && Schema::hasTable('menus_modifier_policies');
    }

    /** @return array{servings: array, audiences: array, policies: array, policy_kinds: array<string, string>} */
    public function all(): array
    {
        $out = ['policy_kinds' => self::POLICY_KINDS];
        foreach (self::TYPES as $type => [$model]) {
            $out[$type] = $model::orderBy('sort_order')->orderBy('id')->get()->map(fn ($r) => $this->row($type, $r))->values()->all();
        }

        return $out;
    }

    /** @param array{name?: string, kind?: string, amount?: mixed, is_default?: bool, is_active?: bool} $d */
    public function save(string $type, array $d, ?int $id = null): Model
    {
        [$model, $word] = self::TYPES[$type] ?? throw new BooksException('That is not a list Menus keeps.');
        $name = mb_substr(trim((string) ($d['name'] ?? '')), 0, 60);
        if ($name === '') {
            throw new BooksException("Give the {$word} a name.");
        }
        if ($model::whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->when($id, fn ($q) => $q->where('id', '!=', $id))->exists()) {
            throw new BooksException("There is already a {$word} called {$name}.");
        }
        $row = $id ? $model::findOrFail($id) : new $model(['sort_order' => (int) $model::max('sort_order') + 1, 'is_active' => true]);
        if ($type === 'policies' && ! $row->exists) {
            $row->is_default = false;
        }
        $row->name = $name;
        if (array_key_exists('is_active', $d)) {
            $row->is_active = (bool) $d['is_active'];
        }
        if ($type === 'policies') {
            $this->policy($row, $d);
            if ($row->exists && array_key_exists('is_active', $d) && ! $d['is_active'] && ($n = DishModifiers::usedBy((int) $row->id)) > 0) {
                throw new BooksException("That policy prices removals or extras on {$n} dish".($n === 1 ? '' : 'es').'. Choose another policy on them before switching it off.');
            }
        }

        return DB::transaction(function () use ($row, $type, $d) {
            if ($type === 'policies') {
                $asked = array_key_exists('is_default', $d) ? (bool) $d['is_default'] : null;
                if ($asked === false && $row->is_default) {
                    throw new BooksException('One policy has to be the default. Make another one the default instead.');
                }
                $makeDefault = $asked === true || (! $row->is_default && ! ModifierPolicy::where('is_default', true)->where('id', '!=', (int) $row->id)->exists());
                if ($makeDefault) {
                    if (! $row->is_active) {
                        throw new BooksException('The default policy has to be switched on.');
                    }
                    ModifierPolicy::where('is_default', true)->update(['is_default' => false]);
                    $row->is_default = true;
                }
                if ($row->is_default && ! $row->is_active) {
                    throw new BooksException('The default policy has to be switched on. Make another one the default first.');
                }
            }
            $row->save();

            return $row;
        });
    }

    public function delete(string $type, int $id): void
    {
        [$model, $word] = self::TYPES[$type] ?? throw new BooksException('That is not a list Menus keeps.');
        $row = $model::findOrFail($id);
        if ($type === 'policies' && $row->is_default) {
            throw new BooksException('That is the default policy. Make another one the default first.');
        }
        if ($type === 'policies' && ($n = DishModifiers::usedBy($id)) > 0) {
            throw new BooksException("That policy prices removals or extras on {$n} dish".($n === 1 ? '' : 'es').'. Choose another policy on them first (Menus, Dishes, Modifiers).');
        }
        $row->delete();
    }

    /** @param int[] $ids the ids in the order to show them */
    public function reorder(string $type, array $ids): void
    {
        [$model] = self::TYPES[$type] ?? throw new BooksException('That is not a list Menus keeps.');
        DB::transaction(function () use ($model, $ids) {
            foreach (array_values($ids) as $i => $id) {
                $model::whereKey((int) $id)->update(['sort_order' => $i + 1]);
            }
        });
    }

    private function policy(ModifierPolicy $row, array $d): void
    {
        $kind = (string) ($d['kind'] ?? $row->kind ?? 'free');
        if (! isset(self::POLICY_KINDS[$kind])) {
            throw new BooksException('Choose free, a fixed fee or a percentage.');
        }
        $amount = $kind === 'free' ? 0.0 : round((float) ($d['amount'] ?? $row->amount ?? 0), 2);
        if ($kind !== 'free' && $amount <= 0) {
            throw new BooksException($kind === 'percent' ? 'Enter the percentage of the dish price.' : 'Enter the fee.');
        }
        if ($kind === 'percent' && $amount > 100) {
            throw new BooksException('A percentage can not be more than 100.');
        }
        $row->kind = $kind;
        $row->amount = $amount;
    }

    private function row(string $type, Model $r): array
    {
        $base = ['id' => (int) $r->id, 'name' => $r->name, 'is_active' => (bool) $r->is_active];

        return $type === 'policies' ? $base + ['kind' => $r->kind, 'amount' => (float) $r->amount, 'is_default' => (bool) $r->is_default] : $base;
    }
}
