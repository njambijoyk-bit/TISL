<?php

namespace App\Services\Catalogue;

/**
 * The building blocks of a brochure page. Each item type has its own sections, and each section carries a theme (the look: colours, fonts, pattern).
 * Three layers decide what an item shows, the first one set winning: this catalogue's choice for that entry, the item's own brochure settings,
 * then the type's default (the shop-wide setting, or the built-in one below). The website draws the sections; this only keeps the lists honest.
 */
class BrochureSections
{
    public const SIZES = ['full', 'half', 'card'];

    /** Every section an item type can use. */
    public const KEYS = [
        'product' => ['hero', 'gallery', 'story', 'features', 'specs', 'prices', 'details'],
        'service' => ['hero', 'gallery', 'story', 'features', 'packages', 'charges', 'details'],
        'hamper'  => ['hero', 'inside', 'story', 'price', 'terms'],
        'auction' => ['hero', 'lot', 'schedule', 'price', 'terms'],
    ];

    /** The look a section can take. Drawn by the website. */
    public const THEMES = ['paper', 'blush', 'sage', 'ocean', 'sunset', 'night', 'sand', 'mono'];

    /** What each type starts with when nothing else is chosen: its sections in order, each with a theme. */
    public const BUILT_IN = [
        'product' => [['hero', 'paper'], ['gallery', 'sand'], ['story', 'paper'], ['features', 'sage'], ['specs', 'mono'], ['prices', 'paper']],
        'service' => [['hero', 'ocean'], ['gallery', 'sand'], ['story', 'paper'], ['features', 'sage'], ['packages', 'paper'], ['charges', 'sand']],
        'hamper'  => [['hero', 'blush'], ['inside', 'sand'], ['story', 'paper'], ['price', 'blush'], ['terms', 'mono']],
        'auction' => [['hero', 'night'], ['lot', 'paper'], ['schedule', 'sunset'], ['price', 'night'], ['terms', 'mono']],
    ];

    public static function types(): array
    {
        return array_keys(self::KEYS);
    }

    /** A list of {key, theme} for a type: unknown sections and themes dropped, repeats dropped. */
    public static function cleanList(string $type, $list): array
    {
        $out = [];
        foreach (is_array($list) ? $list : [] as $s) {
            $key = is_array($s) ? (string) ($s['key'] ?? '') : '';
            $theme = is_array($s) ? (string) ($s['theme'] ?? '') : '';
            if (! in_array($key, self::KEYS[$type] ?? [], true) || isset($out[$key])) {
                continue;
            }
            $out[$key] = ['key' => $key, 'theme' => in_array($theme, self::THEMES, true) ? $theme : 'paper'];
        }

        return array_values($out);
    }

    public static function builtIn(string $type): array
    {
        return array_map(fn ($p) => ['key' => $p[0], 'theme' => $p[1]], self::BUILT_IN[$type] ?? []);
    }

    /** The shop-wide defaults per type: what the settings hold, with the built-in set filling any type left blank. */
    public static function cleanDefaults($saved): array
    {
        $out = [];
        foreach (self::types() as $t) {
            $list = self::cleanList($t, $saved[$t]['sections'] ?? $saved[$t] ?? []);
            $out[$t] = ['sections' => $list ?: self::builtIn($t)];
        }

        return $out;
    }

    /**
     * An item's own settings: {enabled, sections}. `enabled` false keeps the item out of customer downloads. No sections = fall back to the default.
     * @return array{enabled:bool,sections:array}
     */
    public static function cleanMeta(string $type, $meta): array
    {
        $meta = is_array($meta) ? $meta : [];

        return ['enabled' => ! array_key_exists('enabled', $meta) || (bool) $meta['enabled'], 'sections' => self::cleanList($type, $meta['sections'] ?? [])];
    }

    /**
     * The sections an entry shows, and where they came from.
     * @return array{sections:array,source:string}
     */
    public static function resolve(string $type, ?array $entry, ?array $itemMeta, array $defaults): array
    {
        if ($entry && ($l = self::cleanList($type, $entry['sections'] ?? []))) {
            return ['sections' => $l, 'source' => 'entry'];
        }
        if ($itemMeta && ($l = self::cleanList($type, $itemMeta['sections'] ?? []))) {
            return ['sections' => $l, 'source' => 'item'];
        }
        $d = self::cleanList($type, $defaults[$type]['sections'] ?? []);

        return ['sections' => $d ?: self::builtIn($type), 'source' => 'default'];
    }
}
