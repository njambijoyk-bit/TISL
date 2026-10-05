<?php

namespace App\Services\Campaigns;

/**
 * The six starting layouts for moodboards. An artboard has a ratio [width, height]; each slot is placed in percent of the artboard
 * (x and w of its width, y and h of its height), so it scales to any screen. Slot types: photo (a pin), color, text, sticker.
 * Shapes: rect, rounded, circle, polaroid. Staff can also save any moodboard's layout as their own template.
 */
class MoodboardPresets
{
    public const FONTS = ['sans', 'serif', 'script', 'mono', 'display'];
    public const STICKERS = ['⭐', '❤️', '✨', '🌿', '🌸', '🔥', '🎁', '🛍️', '📍', '☀️', '🌙', '🎨', '💎', '🏷️', '👑', '🍃'];

    private static function s(string $id, string $type, float $x, float $y, float $w, float $h, string $hint, string $shape = 'rect', float $rot = 0, int $z = 1): array
    {
        return compact('id', 'type', 'x', 'y', 'w', 'h', 'hint', 'shape', 'rot', 'z');
    }

    /** @return array<string,array{label:string,description:string,layout:array}> */
    public static function all(): array
    {
        $s = [self::class, 's'];

        return [
            'grid' => ['label' => 'Simple grid', 'description' => 'Six pictures in tidy rows.', 'layout' => ['ratio' => [3, 2], 'background' => '#ffffff', 'slots' => [
                $s('a', 'photo', 3, 4, 30, 44, 'Photo 1', 'rounded'), $s('b', 'photo', 35, 4, 30, 44, 'Photo 2', 'rounded'), $s('c', 'photo', 67, 4, 30, 44, 'Photo 3', 'rounded'),
                $s('d', 'photo', 3, 52, 30, 44, 'Photo 4', 'rounded'), $s('e', 'photo', 35, 52, 30, 44, 'Photo 5', 'rounded'), $s('f', 'photo', 67, 52, 30, 44, 'Photo 6', 'rounded'),
            ]]],
            'collage' => ['label' => 'Overlap collage', 'description' => 'Pictures that overlap, with a colour dot, a sticker and a line of text.', 'layout' => ['ratio' => [4, 5], 'background' => '#f6f1ea', 'slots' => [
                $s('a', 'photo', 4, 4, 52, 40, 'Photo 1', 'rounded', -3, 1), $s('b', 'photo', 42, 8, 52, 32, 'Photo 2', 'rounded', 4, 2), $s('c', 'photo', 6, 40, 44, 34, 'Photo 3', 'rounded', 3, 3), $s('d', 'photo', 48, 44, 46, 40, 'Photo 4', 'rounded', -4, 4),
                $s('e', 'color', 36, 34, 16, 12.8, 'Colour', 'circle', 0, 5), $s('f', 'text', 8, 85, 60, 8, 'Words', 'rect', 0, 5), $s('g', 'sticker', 78, 30, 14, 11.2, 'Sticker', 'rect', 8, 6),
            ]]],
            'swatch' => ['label' => 'Colour-led', 'description' => 'One big picture and four colours that go with it.', 'layout' => ['ratio' => [4, 5], 'background' => '#ffffff', 'slots' => [
                $s('a', 'photo', 6, 5, 88, 58, 'Main photo', 'rounded'),
                $s('b', 'color', 6, 68, 16, 12.8, 'Colour 1', 'circle'), $s('c', 'color', 28, 68, 16, 12.8, 'Colour 2', 'circle'), $s('d', 'color', 50, 68, 16, 12.8, 'Colour 3', 'circle'), $s('e', 'color', 72, 68, 16, 12.8, 'Colour 4', 'circle'),
                $s('f', 'text', 6, 85, 88, 10, 'Title'),
            ]]],
            'hero' => ['label' => 'Hero and details', 'description' => 'A wide main picture with three close-ups under it.', 'layout' => ['ratio' => [1, 1], 'background' => '#ffffff', 'slots' => [
                $s('a', 'photo', 0, 0, 100, 58, 'Main photo'),
                $s('b', 'photo', 3, 62, 30, 24, 'Detail 1', 'rounded'), $s('c', 'photo', 35, 62, 30, 24, 'Detail 2', 'rounded'), $s('d', 'photo', 67, 62, 30, 24, 'Detail 3', 'rounded'),
                $s('e', 'text', 3, 88, 94, 8, 'Caption'),
            ]]],
            'polaroid' => ['label' => 'Polaroid scatter', 'description' => 'Five instant-photo cards tossed on the table.', 'layout' => ['ratio' => [4, 3], 'background' => '#e9e3da', 'slots' => [
                $s('a', 'photo', 6, 8, 26, 46, 'Photo 1', 'polaroid', -6, 1), $s('b', 'photo', 28, 22, 26, 46, 'Photo 2', 'polaroid', 4, 2), $s('c', 'photo', 50, 6, 26, 46, 'Photo 3', 'polaroid', -3, 3),
                $s('d', 'photo', 66, 30, 26, 46, 'Photo 4', 'polaroid', 7, 4), $s('e', 'photo', 38, 48, 26, 46, 'Photo 5', 'polaroid', -5, 5), $s('f', 'sticker', 5, 66, 10, 13.3, 'Sticker', 'rect', -8, 6),
            ]]],
            'editorial' => ['label' => 'Editorial', 'description' => 'A headline, a tall picture, two smaller ones and a colour block with words.', 'layout' => ['ratio' => [3, 4], 'background' => '#ffffff', 'slots' => [
                $s('a', 'text', 6, 4, 88, 12, 'Headline'), $s('b', 'photo', 6, 18, 60, 46, 'Main photo'), $s('c', 'photo', 58, 40, 36, 28, 'Photo 2', 'rounded', 2, 2), $s('d', 'photo', 6, 68, 36, 26, 'Photo 3'),
                $s('e', 'color', 46, 72, 48, 22, 'Colour block'), $s('f', 'text', 50, 76, 40, 14, 'Words', 'rect', 0, 2),
            ]]],
        ];
    }

    public static function find(string $key): ?array
    {
        return self::all()[$key] ?? null;
    }
}
