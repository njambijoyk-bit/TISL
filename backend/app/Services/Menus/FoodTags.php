<?php

namespace App\Services\Menus;

/**
 * The allergens and "what it is" tags an ingredient can carry; a dish inherits them from its ingredients. The lists are rows an admin keeps (Menus, Allergens, script 186);
 * until that script is run, or if every row is removed, the lists Menus always had (DEFAULTS) are used. Each row also says which diet badges it rules out.
 */
final class FoodTags
{
    /** The diets a dish can be badged with. Which of them a tag rules out is kept with the tag. */
    public const DIETS = ['vegetarian', 'vegan', 'halal_friendly', 'gluten_free', 'dairy_free', 'nut_free'];

    /** [kind, code, label, diets it rules out]. The same rows script 186 puts in. */
    public const DEFAULTS = [
        ['allergen', 'milk', 'Milk', ['vegan', 'dairy_free']],
        ['allergen', 'eggs', 'Eggs', ['vegan']],
        ['allergen', 'fish', 'Fish', ['vegetarian', 'vegan']],
        ['allergen', 'shellfish', 'Crustaceans', ['vegetarian', 'vegan']],
        ['allergen', 'molluscs', 'Molluscs', ['vegetarian', 'vegan']],
        ['allergen', 'peanuts', 'Peanuts', ['nut_free']],
        ['allergen', 'tree_nuts', 'Tree nuts', ['nut_free']],
        ['allergen', 'wheat', 'Wheat / gluten', ['gluten_free']],
        ['allergen', 'soy', 'Soya', []],
        ['allergen', 'sesame', 'Sesame', []],
        ['allergen', 'celery', 'Celery', []],
        ['allergen', 'mustard', 'Mustard', []],
        ['allergen', 'lupin', 'Lupin', []],
        ['allergen', 'sulphites', 'Sulphites', []],
        ['tag', 'meat', 'Meat', ['vegetarian', 'vegan']],
        ['tag', 'poultry', 'Poultry', ['vegetarian', 'vegan']],
        ['tag', 'fish', 'Fish', ['vegetarian', 'vegan']],
        ['tag', 'pork', 'Pork', ['halal_friendly']],
        ['tag', 'alcohol', 'Alcohol', ['halal_friendly']],
        ['tag', 'dairy', 'Dairy', ['vegan', 'dairy_free']],
        ['tag', 'egg', 'Egg', ['vegan']],
        ['tag', 'honey', 'Honey', ['vegan']],
        ['tag', 'gluten', 'Gluten', ['gluten_free']],
        ['tag', 'caffeine', 'Caffeine', []],
        ['tag', 'spicy', 'Spicy', []],
    ];

    /** code => label. The allergens a menu can declare. @return array<string, string> */
    public static function allergens(): array
    {
        return app(FoodTagCatalog::class)->labels('allergen');
    }

    /** code => label. What an ingredient is, so a dish can be shown as vegetarian, vegan, halal-friendly and so on. @return array<string, string> */
    public static function tags(): array
    {
        return app(FoodTagCatalog::class)->labels('tag');
    }

    /** The diets that something with these allergens and tags is ruled out of. @return string[] */
    public static function ruledOut(array $allergens, array $tags): array
    {
        $catalog = app(FoodTagCatalog::class);
        $out = [];
        foreach ([['allergen', $allergens], ['tag', $tags]] as [$kind, $codes]) {
            foreach ($codes as $code) {
                foreach ($catalog->rulesOut($kind, (string) $code) as $diet) {
                    $out[$diet] = true;
                }
            }
        }

        return array_keys($out);
    }

    /** Keep only known codes, once each, in a steady order. @return string[] */
    public static function clean(array $codes, array $known): array
    {
        $codes = array_values(array_unique(array_map(fn ($c) => mb_strtolower(trim((string) $c)), $codes)));
        $order = array_keys($known);

        return array_values(array_filter($order, fn ($k) => in_array($k, $codes, true)));
    }

    /** The codes that are not known (so the form can say which). @return string[] */
    public static function unknown(array $codes, array $known): array
    {
        return array_values(array_diff(array_map(fn ($c) => mb_strtolower(trim((string) $c)), $codes), array_keys($known)));
    }
}
