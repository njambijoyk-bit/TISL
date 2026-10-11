<?php

namespace App\Services\Menus;

/** The allergens and "what it is" tags an ingredient can carry. A dish inherits them from its ingredients. */
final class FoodTags
{
    /** code => label. The common allergens a menu has to be able to declare. */
    public const ALLERGENS = [
        'milk' => 'Milk', 'eggs' => 'Eggs', 'fish' => 'Fish', 'shellfish' => 'Crustaceans', 'molluscs' => 'Molluscs', 'peanuts' => 'Peanuts', 'tree_nuts' => 'Tree nuts',
        'wheat' => 'Wheat / gluten', 'soy' => 'Soya', 'sesame' => 'Sesame', 'celery' => 'Celery', 'mustard' => 'Mustard', 'lupin' => 'Lupin', 'sulphites' => 'Sulphites',
    ];

    /** code => label. What an ingredient is, so a dish can be shown as vegetarian, vegan, halal-friendly and so on. */
    public const TAGS = ['meat' => 'Meat', 'poultry' => 'Poultry', 'fish' => 'Fish', 'pork' => 'Pork', 'alcohol' => 'Alcohol', 'dairy' => 'Dairy', 'egg' => 'Egg', 'honey' => 'Honey', 'gluten' => 'Gluten', 'caffeine' => 'Caffeine', 'spicy' => 'Spicy'];

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
