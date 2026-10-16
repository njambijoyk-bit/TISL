<?php

namespace App\Services\Menus;

/**
 * From the allergens and tags of what a dish is made of: which diets it suits. Each allergen and tag says which diets it rules out (Menus, Allergens), so a dish suits a diet
 * when nothing in it rules it out. Only ever claims what the ingredients say; a dish with unclassified ingredients claims nothing (the caller checks that).
 */
final class DietBadges
{
    public const LABELS = ['vegetarian' => 'Vegetarian', 'vegan' => 'Vegan', 'halal_friendly' => 'No pork or alcohol', 'gluten_free' => 'Gluten free', 'dairy_free' => 'Dairy free', 'nut_free' => 'Nut free'];

    /** @param string[] $allergens @param string[] $tags @return string[] the badge codes, in a steady order */
    public static function for(array $allergens, array $tags): array
    {
        $out = FoodTags::ruledOut($allergens, $tags);

        return array_values(array_filter(array_keys(self::LABELS), fn ($diet) => ! in_array($diet, $out, true)));
    }
}
