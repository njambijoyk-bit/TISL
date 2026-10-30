<?php

namespace App\Services\Inventory;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Inventory\InventoryCategory;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Books and the asset register kept as one: a ledger made under Fixed Assets in the chart of accounts is also an asset type (a category) in Assets, under the type "Fixed Assets",
 * posting to that ledger, its accumulated depreciation and its depreciation expense. The caller runs this in the SAME transaction as the ledger, so if the register refuses (a type of
 * that name already belongs to another ledger) the ledger is not made either.
 *
 * Not every ledger under Fixed Assets is an asset type: accumulated depreciation (it reduces an asset), capital work in progress (not yet in use) and the depreciation ledgers are not.
 * The accumulated-depreciation and depreciation ledgers are found by name first ("Accumulated Depreciation – Computers", with either dash) and made only when missing, in the
 * Accumulated Depreciation and Depreciation groups when the chart has them. Land does not depreciate: it gets neither, and its type does not depreciate.
 */
class FixedAssetLedgers
{
    /** Groups under Fixed Assets whose ledgers are not asset types. */
    private const NOT_TYPES = ['accumulated depreciation', 'capital work in progress'];

    public static function ready(): bool
    {
        return Schema::hasTable('inventory_categories') && Schema::hasColumn('inventory_categories', 'asset_ledger_id');
    }

    /** Is a ledger in this group an asset type? */
    public function isAssetTypeGroup(int $groupId): bool
    {
        $fixed = LedgerGroup::where('name', 'Fixed Assets')->first();
        if (! $fixed || ! in_array($groupId, array_map('intval', $fixed->selfAndDescendantIds()), true)) {
            return false;
        }
        foreach (self::NOT_TYPES as $name) {
            $g = LedgerGroup::whereRaw('LOWER(name) = ?', [$name])->first();
            if ($g && in_array($groupId, array_map('intval', $g->selfAndDescendantIds()), true)) {
                return false;
            }
        }

        return true;
    }

    private static function nonDepreciating(string $name): bool
    {
        return (bool) preg_match('/^(freehold )?land$/i', trim($name));
    }

    /** "Accumulated Depreciation – Computers" written with any dash. */
    public static function existing(string $prefix, string $name): ?Ledger
    {
        return Ledger::whereIn('name', ["{$prefix} – {$name}", "{$prefix} — {$name}", "{$prefix} - {$name}"])->orderBy('id')->first();
    }

    /** A ledger named either way ("–" or "—"), else made where it belongs. */
    private function findOrMake(string $prefix, string $name, array $groupNames): int
    {
        if ($found = self::existing($prefix, $name)) {
            return (int) $found->id;
        }
        $group = null;
        foreach ($groupNames as $g) {
            $group ??= LedgerGroup::where('name', $g)->first();
        }
        if (! $group) {
            throw ValidationException::withMessages(['name' => "The chart has no {$groupNames[count($groupNames) - 1]} group for the {$prefix} ledger, so the asset type could not be set up."]);
        }

        return (int) Ledger::create(['group_id' => $group->id, 'name' => "{$prefix} – {$name}", 'opening_balance' => 0, 'opening_side' => $prefix === 'Accumulated Depreciation' ? 'C' : 'D', 'is_active' => true])->id;
    }

    /** The accumulated-depreciation and depreciation-expense ledgers for an asset ledger (null for land). @return array{0: ?int, 1: ?int} */
    public function contraLedgers(string $name): array
    {
        if (self::nonDepreciating($name)) {
            return [null, null];
        }

        return [$this->findOrMake('Accumulated Depreciation', $name, ['Accumulated Depreciation', 'Fixed Assets']),
            $this->findOrMake('Depreciation', $name, ['Depreciation', 'Indirect Expenses'])];
    }

    /**
     * Make (or link) the asset type for a ledger made under Fixed Assets. Returns the category, or null when the ledger is not an asset type.
     *
     * @throws ValidationException when the register already has a type of that name belonging to another ledger
     */
    public function forNewLedger(Ledger $ledger, ?int $userId = null): ?InventoryCategory
    {
        if (! self::ready() || ! $this->isAssetTypeGroup((int) $ledger->group_id) || preg_match('/^(accumulated )?depreciation\b/i', $ledger->name)) {
            return null;
        }
        $parent = InventoryCategory::whereNull('parent_id')->where('name', 'Fixed Assets')->first()
            ?? InventoryCategory::create(['name' => 'Fixed Assets', 'slug' => 'fixed-assets', 'description' => 'Asset types made from the Fixed Assets ledgers in Books.', 'is_active' => true, 'created_by' => $userId]);
        $existing = InventoryCategory::where('name', $ledger->name)->where('id', '!=', $parent->id)->first();
        if ($existing && $existing->asset_ledger_id && (int) $existing->asset_ledger_id !== (int) $ledger->id) {
            throw ValidationException::withMessages(['name' => "Assets already has a type called \"{$ledger->name}\" that posts to another ledger. Choose another name, or change that type first. Nothing was saved."]);
        }
        [$acc, $exp] = $this->contraLedgers($ledger->name);
        $fields = ['asset_ledger_id' => $ledger->id, 'accumulated_ledger_id' => $existing?->accumulated_ledger_id ?: $acc, 'expense_ledger_id' => $existing?->expense_ledger_id ?: $exp];
        if ($existing) {
            $existing->update($fields);

            return $existing->fresh();
        }

        return InventoryCategory::create($fields + ['name' => $ledger->name, 'slug' => \Illuminate\Support\Str::slug($ledger->name), 'parent_id' => $parent->id, 'is_active' => true, 'created_by' => $userId,
            'default_method' => 'none', 'description' => self::nonDepreciating($ledger->name) ? 'Made from the ledger in Books. Land does not depreciate.' : 'Made from the ledger in Books. Set its depreciation method and life here.']);
    }

    /** After a ledger is edited: its asset type takes the new name, or one is made when the ledger has moved under Fixed Assets. */
    public function forChangedLedger(Ledger $ledger, string $wasName, int $wasGroup, ?int $userId = null): void
    {
        if (! self::ready()) {
            return;
        }
        $linked = InventoryCategory::where('asset_ledger_id', $ledger->id)->first();
        if ($linked) {
            if ($ledger->name !== $wasName && $linked->name === $wasName) {
                if (InventoryCategory::where('name', $ledger->name)->where('id', '!=', $linked->id)->exists()) {
                    throw ValidationException::withMessages(['name' => "Assets already has a type called \"{$ledger->name}\". Nothing was saved."]);
                }
                $linked->update(['name' => $ledger->name, 'slug' => \Illuminate\Support\Str::slug($ledger->name)]);
            }

            return;
        }
        if ((int) $ledger->group_id !== $wasGroup) {
            $this->forNewLedger($ledger, $userId);
        }
    }
}
