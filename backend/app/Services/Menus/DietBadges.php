<?php

namespace App\Services\Menus;

/** From the allergens and tags of what a dish is made of: which diets it suits. Only ever claims what the ingredients say; a dish with unclassified ingredients claims nothing. */
final class DietBadges
{
    public const LABELS = ['vegetarian' => 'Vegetarian', 'vegan' => 'Vegan', 'halal_friendly' => 'No pork or alcohol', 'gluten_free' => 'Gluten free', 'dairy_free' => 'Dairy free', 'nut_free' => 'Nut free'];

    /** @param string[] $allergens @param string[] $tags @return string[] the badge codes, in a steady order */
    public static function for(array $allergens, array $tags): array
    {
        $has = fn (array $set, array $any) => (bool) array_intersect($set, $any);
        $vegetarian = ! $has($tags, ['meat', 'poultry', 'fish']) && ! $has($allergens, ['fish', 'shellfish', 'molluscs']);
        $out = [];
        if ($vegetarian) {
            $out[] = 'vegetarian';
        }
        if ($vegetarian && ! $has($tags, ['dairy', 'egg', 'honey']) && ! $has($allergens, ['milk', 'eggs'])) {
            $out[] = 'vegan';
        }
        if (! $has($tags, ['pork', 'alcohol'])) {
            $out[] = 'halal_friendly';
        }
        if (! $has($allergens, ['wheat']) && ! $has($tags, ['gluten'])) {
            $out[] = 'gluten_free';
        }
        if (! $has($allergens, ['milk']) && ! $has($tags, ['dairy'])) {
            $out[] = 'dairy_free';
        }
        if (! $has($allergens, ['peanuts', 'tree_nuts'])) {
            $out[] = 'nut_free';
        }

        return $out;
    }
}
