<?php

namespace App\Services\Menus;

use App\Models\Menus\DishRecipeLine;
use App\Models\Menus\Ingredient;
use App\Models\Menus\IngredientKind;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Keeping the kinds of ingredient (Menus, Ingredients, Kinds). A kind says what its ingredients may be used for. A code is made once from the name and never changes; the name and
 * the uses can. Until script 190 is run there are no kinds and every ingredient behaves as a cooking ingredient.
 */
class IngredientKinds
{
    /** What script 190 puts in: code, name, uses. */
    public const DEFAULTS = [
        ['cooking', 'Cooking ingredient', ['in_recipes']],
        ['ready_to_serve', 'Ready to serve', ['sold_as_is']],
        ['condiment', 'Condiment or extra', ['in_recipes', 'free_extra']],
        ['packaging', 'Packaging', ['packaging']],
    ];

    private static ?bool $installed = null;

    /** Has script 190 been run? */
    public static function installed(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasTable('menus_ingredient_kinds') && Schema::hasColumn('menus_ingredients', 'kind_id');
        }

        return self::$installed ??= Schema::hasTable('menus_ingredient_kinds') && Schema::hasColumn('menus_ingredients', 'kind_id');
    }

    /** Put in the four kinds script 190 does, for the ones not there yet. */
    public function seedDefaults(): int
    {
        $n = 0;
        foreach (self::DEFAULTS as $i => [$code, $name, $uses]) {
            if (! IngredientKind::where('code', $code)->exists()) {
                IngredientKind::create(['code' => $code, 'name' => $name, 'sort_order' => $i + 1] + $this->flags($uses));
                $n++;
            }
        }

        return $n;
    }

    /** The kind a new ingredient gets (made first if the kinds were never put in); null before script 190. */
    public function defaultKind(): ?IngredientKind
    {
        if (! self::installed()) {
            return null;
        }
        $this->seedDefaults();

        return IngredientKind::where('code', IngredientKind::DEFAULT_CODE)->first();
    }

    /** @return array{kinds: array<int, array>, uses: array<string, string>} each kind with how many ingredients have it */
    public function list(): array
    {
        $counts = Ingredient::query()->whereNotNull('kind_id')->selectRaw('kind_id, COUNT(*) as n')->groupBy('kind_id')->pluck('n', 'kind_id');
        $kinds = IngredientKind::orderBy('sort_order')->orderBy('id')->get()->map(fn (IngredientKind $k) => $this->row($k) + ['ingredients' => (int) ($counts[$k->id] ?? 0)])->values()->all();

        return ['kinds' => $kinds, 'uses' => IngredientKind::USES];
    }

    public function row(IngredientKind $k): array
    {
        return ['id' => $k->id, 'code' => $k->code, 'name' => $k->name] + array_map(fn ($x) => (bool) $x, array_intersect_key($k->only(array_keys(IngredientKind::USES)), IngredientKind::USES));
    }

    /** @param array{name: string, in_recipes?: bool, sold_as_is?: bool, free_extra?: bool, packaging?: bool} $d */
    public function save(array $d, ?IngredientKind $kind = null): IngredientKind
    {
        $name = mb_substr(trim((string) ($d['name'] ?? '')), 0, 60);
        if ($name === '') {
            throw new BooksException('Give the kind a name.');
        }
        if (IngredientKind::whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->when($kind, fn ($q) => $q->where('id', '!=', $kind->id))->exists()) {
            throw new BooksException("There is already a kind called {$name}.");
        }
        $uses = array_values(array_filter(array_keys(IngredientKind::USES), fn ($u) => ! empty($d[$u])));
        if (! $uses) {
            throw new BooksException('Say what it is used for: recipes, sold as it is, a free extra, or packaging.');
        }
        if ($kind && ! in_array('in_recipes', $uses, true) && $kind->in_recipes && ($n = $this->recipeIngredients($kind))) {
            throw new BooksException("{$kind->name} can not stop being used in recipes: {$n} of its ingredient".($n === 1 ? ' is' : 's are').' in a recipe. Take '.($n === 1 ? 'it' : 'them').' out of the recipes first.');
        }

        return DB::transaction(function () use ($kind, $name, $uses) {
            if ($kind) {
                $kind->update(['name' => $name] + $this->flags($uses));

                return $kind;
            }

            return IngredientKind::create(['code' => $this->codeFor($name), 'name' => $name, 'sort_order' => (int) IngredientKind::max('sort_order') + 1] + $this->flags($uses));
        });
    }

    /** @param int[] $ids the ids in the order to show them */
    public function reorder(array $ids): void
    {
        DB::transaction(function () use ($ids) {
            foreach (array_values($ids) as $i => $id) {
                IngredientKind::whereKey((int) $id)->update(['sort_order' => $i + 1]);
            }
        });
    }

    public function delete(IngredientKind $kind): void
    {
        if ($kind->code === IngredientKind::DEFAULT_CODE) {
            throw new BooksException("{$kind->name} is the kind a new ingredient gets, so it stays. Rename it if you like.");
        }
        $n = Ingredient::where('kind_id', $kind->id)->count();
        if ($n) {
            throw new BooksException("{$kind->name} is the kind of {$n} ingredient".($n === 1 ? '' : 's').'. Give '.($n === 1 ? 'it' : 'them').' another kind first.');
        }
        $kind->delete();
    }

    /** Is this ingredient allowed as a line of a recipe? (No kind yet, before script 190, counts as yes.) */
    public static function allowedInRecipe(Ingredient $ingredient): bool
    {
        if (! self::installed() || ! $ingredient->kind_id) {
            return true;
        }

        return (bool) ($ingredient->relationLoaded('kind') ? $ingredient->kind : $ingredient->kind()->first())?->in_recipes;
    }

    /** How many ingredients of a kind are lines of a recipe. */
    public function recipeIngredients(IngredientKind $kind): int
    {
        return DishRecipeLine::whereIn('ingredient_id', Ingredient::where('kind_id', $kind->id)->select('id'))->distinct()->count('ingredient_id');
    }

    /** @param string[] $uses */
    private function flags(array $uses): array
    {
        return array_map(fn ($u) => in_array($u, $uses, true), array_combine(array_keys(IngredientKind::USES), array_keys(IngredientKind::USES)));
    }

    private function codeFor(string $name): string
    {
        $base = mb_substr(Str::slug($name, '_') ?: 'kind', 0, 36);
        $code = $base;
        for ($i = 2; IngredientKind::where('code', $code)->exists(); $i++) {
            $code = $base.'_'.$i;
        }

        return $code;
    }
}
