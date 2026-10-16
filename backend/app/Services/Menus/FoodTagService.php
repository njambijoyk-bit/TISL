<?php

namespace App\Services\Menus;

use App\Models\Menus\FoodTag;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Keeping the allergens and "what it is" tags (Menus, Allergens). A code is made once from the label and never changes; the label and what it rules out can. */
class FoodTagService
{
    /** @return array{allergens: array, tags: array, diets: array<string, string>, kinds: array<string, string>} each row with how many ingredients and dishes carry it */
    public function list(): array
    {
        $rows = FoodTag::orderBy('sort_order')->orderBy('id')->get();
        $out = ['allergen' => [], 'tag' => []];
        foreach ($rows as $t) {
            $out[$t->kind][] = ['id' => $t->id, 'code' => $t->code, 'label' => $t->label, 'rules_out' => array_values((array) $t->rules_out), 'used' => $this->usage($t)];
        }

        return ['allergens' => $out['allergen'], 'tags' => $out['tag'], 'diets' => DietBadges::LABELS, 'kinds' => FoodTag::KINDS];
    }

    /** Put in the lists Menus always had (what script 186 does), for the ones not there yet. */
    public function seedDefaults(): int
    {
        $n = 0;
        foreach (FoodTags::DEFAULTS as $i => [$kind, $code, $label, $rules]) {
            if (! FoodTag::where('kind', $kind)->where('code', $code)->exists()) {
                FoodTag::create(['kind' => $kind, 'code' => $code, 'label' => $label, 'rules_out' => $rules ?: null, 'sort_order' => $i + 1]);
                $n++;
            }
        }
        $this->forget();

        return $n;
    }

    /** @param array{kind?: string, label: string, rules_out?: array} $d */
    public function save(array $d, ?FoodTag $tag = null): FoodTag
    {
        $label = mb_substr(trim((string) ($d['label'] ?? '')), 0, 60);
        if ($label === '') {
            throw new BooksException('Give it a name.');
        }
        $kind = $tag?->kind ?? (string) ($d['kind'] ?? '');
        if (! isset(FoodTag::KINDS[$kind])) {
            throw new BooksException('Say whether it is an allergen or what the ingredient is.');
        }
        $rules = array_values(array_unique(array_map('strval', (array) ($d['rules_out'] ?? []))));
        if ($bad = array_diff($rules, FoodTags::DIETS)) {
            throw new BooksException('Unknown diet: '.implode(', ', $bad).'.');
        }
        $rules = array_values(array_filter(FoodTags::DIETS, fn ($x) => in_array($x, $rules, true)));
        $same = FoodTag::where('kind', $kind)->whereRaw('LOWER(label) = ?', [mb_strtolower($label)])->when($tag, fn ($q) => $q->where('id', '!=', $tag->id))->exists();
        if ($same) {
            throw new BooksException("There is already one called {$label}.");
        }
        $saved = DB::transaction(function () use ($tag, $kind, $label, $rules) {
            if ($tag) {
                $tag->update(['label' => $label, 'rules_out' => $rules ?: null]);

                return $tag;
            }

            return FoodTag::create(['kind' => $kind, 'code' => $this->codeFor($kind, $label), 'label' => $label, 'rules_out' => $rules ?: null, 'sort_order' => (int) FoodTag::where('kind', $kind)->max('sort_order') + 1]);
        });
        $this->forget();

        return $saved;
    }

    /** @param int[] $ids the ids of one kind, in the order to show them */
    public function reorder(string $kind, array $ids): void
    {
        DB::transaction(function () use ($kind, $ids) {
            foreach (array_values($ids) as $i => $id) {
                FoodTag::where('kind', $kind)->whereKey((int) $id)->update(['sort_order' => $i + 1]);
            }
        });
        $this->forget();
    }

    public function delete(FoodTag $tag): void
    {
        $use = $this->usage($tag);
        if ($use['ingredients'] || $use['dishes']) {
            $bits = array_filter([$use['ingredients'] ? $use['ingredients'].' ingredient'.($use['ingredients'] === 1 ? '' : 's') : null, $use['dishes'] ? $use['dishes'].' dish'.($use['dishes'] === 1 ? '' : 'es').' that declare'.($use['dishes'] === 1 ? 's' : '').' their own' : null]);
            throw new BooksException("{$tag->label} is used by ".implode(' and ', $bits).'. Take it off first.');
        }
        $tag->delete();
        $this->forget();
    }

    /** How many ingredients and dishes carry it. @return array{ingredients: int, dishes: int} */
    public function usage(FoodTag $tag): array
    {
        [$ing, $dish] = $tag->kind === 'allergen' ? ['allergens', 'allergens_override'] : ['tags', 'tags_override'];
        $count = function (string $table, string $col) use ($tag) {
            if (! \Illuminate\Support\Facades\Schema::hasTable($table)) {
                return 0;
            }

            return DB::table($table)->whereNotNull($col)->pluck($col)->filter(fn ($json) => in_array($tag->code, (array) json_decode((string) $json, true), true))->count();
        };

        return ['ingredients' => $count('menus_ingredients', $ing), 'dishes' => $count('menus_dishes', $dish)];
    }

    private function codeFor(string $kind, string $label): string
    {
        $base = mb_substr(Str::slug($label, '_') ?: 'item', 0, 36);
        $code = $base;
        for ($i = 2; FoodTag::where('kind', $kind)->where('code', $code)->exists(); $i++) {
            $code = $base.'_'.$i;
        }

        return $code;
    }

    private function forget(): void
    {
        app(FoodTagCatalog::class)->forget();
    }
}
