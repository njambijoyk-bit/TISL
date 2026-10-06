<?php

namespace App\Services\Campaigns;

/**
 * The six starting layouts for moodboards. An artboard has a ratio [width, height]; each slot is placed in percent of the artboard
 * (x and w of its width, y and h of its height), so it scales to any screen. Slot types: photo (a pin), color, text, sticker.
 * Shapes: rect, rounded, circle, polaroid, torn (paper edge), blob, arch, corner, pill. A slot can carry a default (a tape strip, a colour for a paper note) that new moodboards start with. Staff can also save any moodboard's layout as their own template.
 */
class MoodboardPresets
{
    public const FONTS = ['sans', 'serif', 'script', 'mono', 'display', 'elegant', 'signature', 'brush', 'wide', 'headline', 'poster'];
    public const PATTERNS = ['none', 'grid', 'dots', 'lines', 'paper'];
    public const STICKERS = [
        '⭐', '❤️', '✨', '🌿', '🌸', '🔥', '🎁', '🛍️', '📍', '☀️', '🌙', '🎨', '💎', '🏷️', '👑', '🍃',
        '🎀', '🎗️', '🦋', '🌺', '🌷', '🌼', '🌹', '🪻', '🍀', '🍂', '💐', '🕊️', '☁️', '🌈', '💫', '🤍',
        '🖤', '💗', '🧸', '🕯️', '☕', '🍓', '🍒', '🍋', '📌', '📎', '✂️', '🧵', '📷', '🎞️', '🎧', '🎵',
        '💄', '👗', '👜', '👠', '🕶️', '💍', '🪞', '🛋️', '🏡', '✈️', '🌊', '🏔️', '🌴', '🥂', '🎂', '🧿',
    ];
    /** Drawn (line-art) stickers; the pictures themselves are in the website's moodboard kit. */
    public const DRAWN = ['arrow-curve', 'arrow-curve-back', 'arrow-dashed', 'arrow-straight', 'leaf', 'branch', 'sprig', 'flower', 'butterfly', 'star', 'heart', 'sparkle', 'squiggle', 'underline', 'scribble', 'bow', 'paperclip', 'pin', 'tape'];

    public static function stickerOk(string $v): bool
    {
        return in_array($v, self::STICKERS, true) || (str_starts_with($v, 'svg:') && in_array(substr($v, 4), self::DRAWN, true));
    }

    /** What a new moodboard starts with: each slot's default, if it has one (a tape strip, a paper colour). */
    public static function seed(array $layout): array
    {
        $out = [];
        foreach ($layout['slots'] ?? [] as $slot) {
            if (! empty($slot['default'])) {
                $out[$slot['id']] = $slot['default'];
            }
        }

        return $out;
    }

    private static function s(string $id, string $type, float $x, float $y, float $w, float $h, string $hint, string $shape = 'rect', float $rot = 0, int $z = 1, ?array $default = null): array
    {
        $slot = compact('id', 'type', 'x', 'y', 'w', 'h', 'hint', 'shape', 'rot', 'z');

        return $default ? $slot + ['default' => $default] : $slot;
    }

    /** @return array<string,array{label:string,description:string,layout:array}> */
    public static function all(): array
    {
        return self::classic() + self::scrapbooks();
    }

    /** @return array<string,array{label:string,description:string,layout:array}> */
    private static function classic(): array
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

    /** The ten richer layouts: torn paper, tape, pins, polaroids, colour chips and line-art. @return array<string,array{label:string,description:string,layout:array}> */
    private static function scrapbooks(): array
    {
        $s = [self::class, 's'];
        $tape = fn (string $id, float $x, float $y, float $w, float $rot, int $z = 9) => self::s($id, 'sticker', $x, $y, $w, 6, 'Tape', 'rect', $rot, $z, ['value' => 'svg:tape', 'color' => '#efe9dc']);
        $pin = fn (string $id, float $x, float $y, int $z = 9) => self::s($id, 'sticker', $x, $y, 3.4, 4.2, 'Pin', 'rect', 0, $z, ['value' => 'svg:pin', 'color' => '#b08d57']);
        $chip = fn (string $id, float $x, float $y, float $w, float $h, string $hint, string $shape = 'rect', int $z = 3) => self::s($id, 'color', $x, $y, $w, $h, $hint, $shape, 0, $z);
        $sq = fn (float $w, array $r) => round($w * $r[0] / $r[1], 2);
        $r54 = [5, 4]; $r57 = [5, 7]; $r75 = [7, 5]; $r35 = [3, 5]; $r23 = [2, 3]; $r11 = [1, 1]; $r45 = [4, 5];

        return [
            'scrapbook' => ['label' => 'Scrapbook', 'description' => 'Grid paper, polaroids, a torn note, a cork circle and paint chips.', 'layout' => ['ratio' => $r54, 'background' => '#dcdad5', 'pattern' => 'grid', 'slots' => [
                $s('a', 'photo', 12, 9, 40, 42, 'Photo 1', 'polaroid', 0, 1), $s('b', 'color', 49, 15, 14, $sq(14, $r54), 'Cork circle', 'circle', 0, 2, ['value' => '#c9a46b']), $s('c', 'photo', 58, 25, 30, 40, 'Photo 2', 'polaroid', 0, 3),
                $s('d', 'color', 6, 42, 36, 30, 'Paper note', 'torn', 0, 2, ['value' => '#ece4d2']), $s('e', 'text', 9, 45, 28, 9, 'Heading', 'rect', 0, 4), $s('f', 'text', 10, 58, 26, 7, 'Words', 'rect', 0, 4),
                $s('g', 'photo', 31, 49, 32, 40, 'Photo 3', 'polaroid', 0, 5), $chip('h', 62, 71, 8, 13, 'Colour 1', 'polaroid', 2), $chip('i', 72, 71, 8, 13, 'Colour 2', 'polaroid', 2), $chip('j', 82, 71, 8, 13, 'Colour 3', 'polaroid', 2),
                $s('k', 'text', 72, 8, 22, 12, 'Label', 'rect', -6, 4), $s('l', 'sticker', 62, 10, 12, 14, 'Arrow', 'rect', 0, 4, ['value' => 'svg:arrow-curve', 'color' => '#222222']), $s('m', 'sticker', 84, 36, 11, 24, 'Plant', 'rect', 0, 4),
            ]]],
            'interior' => ['label' => 'Interior two-tone', 'description' => 'A torn colour field, tall colour strip, framed photos and dashed arrows.', 'layout' => ['ratio' => $r54, 'background' => '#fbfaf8', 'pattern' => 'none', 'slots' => [
                $s('a', 'color', 0, 26, 100, 74, 'Colour field', 'torn', 0, 1, ['value' => '#3d7a68']), $s('b', 'text', 3, 3, 36, 9, 'Title', 'rect', 0, 6), $s('c', 'text', 30, 4, 24, 9, 'Subtitle', 'rect', 0, 6),
                $chip('d', 7, 18, 6, 8.4, 'Colour 1', 'rect', 3), $chip('e', 7, 26.4, 6, 8.4, 'Colour 2', 'rect', 3), $chip('f', 7, 34.8, 6, 8.4, 'Colour 3', 'rect', 3), $chip('g', 7, 43.2, 6, 8.4, 'Colour 4', 'rect', 3),
                $s('h', 'photo', 22, 17, 37, 42, 'Main photo', 'rect', 0, 4), $s('i', 'photo', 57, 5, 28, 30, 'Photo 2', 'rect', 0, 3), $s('j', 'photo', 47, 44, 22, 34, 'Photo 3', 'polaroid', 0, 5), $s('k', 'photo', 71, 49, 22, 34, 'Photo 4', 'polaroid', 0, 4),
                $s('l', 'photo', 9, 63, 31, 27, 'Photo 5', 'polaroid', 0, 6), $s('m', 'photo', 56, 69, 28, 27, 'Photo 6', 'polaroid', 0, 7), $s('n', 'text', 76, 38, 22, 8, 'Note', 'rect', 0, 6), $s('o', 'text', 13, 90, 42, 9, 'Caption', 'rect', 0, 8),
                $s('p', 'sticker', 84, 12, 14, 22, 'Arrow', 'rect', 0, 6, ['value' => 'svg:arrow-dashed', 'color' => '#222222']), $s('q', 'sticker', 38, 76, 10, 16, 'Arrow', 'rect', 0, 8, ['value' => 'svg:arrow-curve-back', 'color' => '#222222']),
            ]]],
            'poster' => ['label' => 'Tall poster', 'description' => 'A tall board with a column of colour circles, an arch photo and a round photo.', 'layout' => ['ratio' => $r57, 'background' => '#f2f1ee', 'pattern' => 'paper', 'slots' => [
                $s('a', 'text', 8, 3, 40, 9, 'Title', 'rect', 0, 4), $s('b', 'text', 8, 11, 38, 5, 'Subtitle', 'rect', 0, 4), $s('c', 'text', 8, 16, 40, 3, 'Small line', 'rect', 0, 4),
                $s('d', 'photo', 50, 3, 46, 30, 'Big photo', 'corner', 0, 2), $s('e', 'photo', 50, 36, 46, 14, 'Wide photo', 'rect', 0, 2), $s('f', 'photo', 50, 53, 46, 42, 'Tall photo', 'rect', 0, 2),
                $s('g', 'photo', 19, 20, 28, 25, 'Photo 4', 'rect', 0, 2), $s('h', 'color', 19, 47, 28, 34, 'Card', 'pill', 0, 1, ['value' => '#e7dccf']), $s('i', 'photo', 22, 29, 30, $sq(30, $r57), 'Round photo', 'circle', 0, 5),
                $s('j', 'text', 21, 60, 24, 5, 'Words', 'rect', 0, 3), $s('k', 'text', 21, 66, 24, 5, 'More words', 'rect', 0, 3),
                $chip('l', 4, 20, 10, $sq(10, $r57), 'Colour 1', 'circle'), $chip('m', 4, 30.5, 10, $sq(10, $r57), 'Colour 2', 'circle'), $chip('n', 4, 41, 10, $sq(10, $r57), 'Colour 3', 'circle'),
                $chip('o', 4, 51.5, 10, $sq(10, $r57), 'Colour 4', 'circle'), $chip('p', 4, 62, 10, $sq(10, $r57), 'Colour 5', 'circle'), $chip('q', 4, 72.5, 10, $sq(10, $r57), 'Colour 6', 'circle'),
                $s('r', 'color', 0, 97, 100, 3, 'Bottom bar', 'rect', 0, 1, ['value' => '#12606f']),
            ]]],
            'airy' => ['label' => 'Light and airy', 'description' => 'Plenty of white, overlapping photos with colour blocks, line-art leaves.', 'layout' => ['ratio' => $r54, 'background' => '#ffffff', 'pattern' => 'none', 'slots' => [
                $s('a', 'text', 8, 5, 34, 5, 'Title', 'rect', 0, 5), $s('b', 'photo', 31, 15, 33, 49, 'Main photo', 'rect', 0, 1), $chip('c', 24, 16, 8, 9, 'Colour block', 'rect', 2),
                $s('d', 'color', 12, 32, 22, 38, 'Frame colour', 'rect', 0, 1, ['value' => '#dfc3b3']), $s('e', 'photo', 13.5, 34, 19, 34, 'Framed photo', 'rect', 0, 2),
                $s('f', 'photo', 56, 46, 26, 43, 'Room photo', 'rect', 0, 2), $chip('g', 51, 44, 20, 5, 'Colour block 2', 'rect', 1), $chip('h', 51, 44, 5, 44, 'Colour strip', 'rect', 1),
                $s('i', 'photo', 22, 60, 19, 34, 'Leaf photo', 'rect', 0, 1), $chip('j', 43, 62, 6, $sq(6, $r54), 'Colour 1', 'circle'), $chip('k', 43, 73, 6, $sq(6, $r54), 'Colour 2', 'circle'), $chip('l', 43, 84, 6, $sq(6, $r54), 'Colour 3', 'circle'),
                $s('m', 'sticker', 63, 12, 10, 14, 'Leaf', 'rect', 0, 4, ['value' => 'svg:leaf', 'color' => '#222222']), $s('n', 'sticker', 4, 76, 14, 20, 'Splash', 'rect', 0, 4),
            ]]],
            'brandgrid' => ['label' => 'Brand grid', 'description' => 'A title, lines of words and colour bars beside a neat six-photo grid.', 'layout' => ['ratio' => $r11, 'background' => '#ffffff', 'pattern' => 'none', 'slots' => [
                $s('a', 'text', 7, 9, 32, 9, 'Title', 'rect', 0, 3), $s('b', 'text', 7, 18, 32, 9, 'Title line 2', 'rect', 0, 3), $s('c', 'text', 7, 32, 32, 3, 'Small line', 'rect', 0, 3), $s('d', 'text', 7, 42, 32, 3, 'Words', 'rect', 0, 3),
                $chip('e', 7, 52, 32, 5, 'Colour 1', 'rect', 2), $chip('f', 7, 58.5, 32, 5, 'Colour 2', 'rect', 2), $chip('g', 7, 65, 32, 5, 'Colour 3', 'rect', 2), $chip('h', 7, 71.5, 32, 5, 'Colour 4', 'rect', 2), $chip('i', 7, 78, 32, 5, 'Colour 5', 'rect', 2), $chip('j', 7, 84.5, 32, 5, 'Colour 6', 'rect', 2),
                $s('k', 'photo', 42, 9, 26, 27, 'Photo 1', 'rect', 0, 1), $s('l', 'photo', 70, 9, 26, 27, 'Photo 2', 'rect', 0, 1), $s('m', 'photo', 42, 38, 26, 27, 'Photo 3', 'rect', 0, 1), $s('n', 'photo', 70, 38, 26, 27, 'Photo 4', 'rect', 0, 1),
                $s('o', 'photo', 42, 67, 26, 27, 'Photo 5', 'rect', 0, 1), $s('p', 'photo', 70, 67, 26, 27, 'Photo 6', 'rect', 0, 1), $s('q', 'text', 36, 95, 28, 2.5, 'Footer', 'rect', 0, 3),
            ]]],
            'woodnote' => ['label' => 'Torn paper and polaroids', 'description' => 'Torn photo and note, a scalloped colour tag, polaroids, colour chips and a branch.', 'layout' => ['ratio' => $r75, 'background' => '#ffffff', 'pattern' => 'none', 'slots' => [
                $s('a', 'text', 13, 4, 40, 7, 'Title', 'rect', 0, 8), $s('b', 'photo', 17, 14, 36, 50, 'Torn photo', 'torn', 0, 2), $s('c', 'photo', 46, 8, 27, 27, 'Photo 2', 'polaroid', 0, 5),
                $s('d', 'color', 59, 7, 24, 34, 'Colour tag', 'blob', 0, 3, ['value' => '#b5693e']), $s('e', 'text', 63, 14, 16, 14, 'Tag words', 'rect', -8, 6), $s('f', 'photo', 48, 36, 22, 45, 'Tall photo', 'rect', 0, 2),
                $s('g', 'photo', 68, 38, 22, 30, 'Photo 4', 'polaroid', 0, 4), $s('h', 'photo', 18, 62, 22, 28, 'Photo 5', 'polaroid', 0, 5), $s('i', 'photo', 57, 67, 23, 27, 'Photo 6', 'polaroid', 0, 6),
                $s('j', 'color', 69, 60, 22, 26, 'Paper note', 'torn', 0, 1, ['value' => '#e9ebe8']), $s('k', 'text', 72, 66, 17, 12, 'Words', 'rect', 0, 3),
                $chip('l', 90, 9, 4.5, 7.5, 'Colour 1', 'rect', 3), $chip('m', 90, 17, 4.5, 7.5, 'Colour 2', 'rect', 3), $chip('n', 90, 25, 4.5, 7.5, 'Colour 3', 'rect', 3), $chip('o', 90, 33, 4.5, 7.5, 'Colour 4', 'rect', 3), $chip('p', 90, 41, 4.5, 7.5, 'Colour 5', 'rect', 3), $chip('q', 90, 49, 4.5, 7.5, 'Colour 6', 'rect', 3),
                $s('r', 'color', 4, 40, 14, 19, 'Colour blob', 'blob', 0, 3, ['value' => '#cfc3e6']), $s('s', 'text', 5, 45, 12, 9, 'Blob words', 'rect', -8, 4),
                $s('t', 'sticker', 1, 76, 14, 22, 'Branch', 'rect', 0, 4, ['value' => 'svg:branch', 'color' => '#111111']), $s('u', 'sticker', 74, 28, 6, 12, 'Paperclip', 'rect', 0, 7, ['value' => 'svg:paperclip', 'color' => '#222222']),
            ]]],
            'kraft' => ['label' => 'Kraft and tape', 'description' => 'Warm paper-brown board with photos held down by tape.', 'layout' => ['ratio' => $r54, 'background' => '#b99079', 'pattern' => 'none', 'slots' => [
                $s('a', 'photo', 3, 5, 24, 42, 'Photo 1', 'rect', 0, 1), $s('b', 'text', 30, 8, 26, 16, 'Words', 'rect', 0, 3), $s('c', 'photo', 6, 40, 26, 56, 'Photo 2', 'rect', 0, 2), $s('d', 'photo', 57, 5, 40, 44, 'Photo 3', 'rect', 0, 1),
                $s('e', 'photo', 38, 36, 28, 30, 'Photo 4', 'rect', 0, 3), $s('f', 'photo', 40, 68, 28, 28, 'Photo 5', 'rect', 0, 3), $s('g', 'photo', 72, 49, 25, 46, 'Photo 6', 'rect', 0, 2),
                $tape('h', 6, 1, 20, -4), $tape('i', 62, 2, 26, 3), $tape('j', 36, 33, 22, -3), $tape('k', 23, 38, 14, 12, 10), $tape('l', 42, 64, 22, 2), $tape('m', 70, 46, 24, -2),
            ]]],
            'pinboard' => ['label' => 'Pinboard wall', 'description' => 'A dense wall of photos, quotes and cards, each held with a pin.', 'layout' => ['ratio' => $r45, 'background' => '#f3ebe5', 'pattern' => 'paper', 'slots' => [
                $s('a', 'photo', 0, 0, 20, 24, 'Photo 1', 'rect', 0, 1), $s('b', 'photo', 21, 0, 22, 18, 'Photo 2', 'rect', 0, 1), $s('c', 'photo', 44, 0, 18, 16, 'Photo 3', 'rect', 0, 1), $s('d', 'photo', 64, 8, 18, 20, 'Photo 4', 'rect', 0, 2), $s('e', 'photo', 83, 0, 17, 26, 'Photo 5', 'rect', 0, 1),
                $s('f', 'photo', 2, 28, 34, 36, 'Photo 6', 'rect', 0, 2), $s('g', 'color', 33, 22, 30, 28, 'Quote card', 'rect', 0, 2, ['value' => '#faf7f2']), $s('h', 'text', 36, 27, 24, 12, 'Quote', 'rect', 0, 3), $s('i', 'photo', 64, 30, 34, 24, 'Photo 7', 'rect', 0, 2),
                $s('j', 'photo', 36, 52, 18, 26, 'Photo 8', 'rect', 0, 2), $s('k', 'photo', 56, 56, 42, 26, 'Photo 9', 'rect', 0, 3), $s('l', 'color', 3, 68, 24, 24, 'Note card', 'rect', 0, 2, ['value' => '#f7f2ec']), $s('m', 'photo', 26, 70, 26, 22, 'Photo 10', 'rect', 0, 3),
                $s('n', 'text', 5, 82, 40, 12, 'Big words', 'rect', 0, 4), $s('o', 'photo', 56, 83, 22, 16, 'Photo 11', 'rect', 0, 3), $s('p', 'photo', 78, 84, 22, 16, 'Photo 12', 'rect', 0, 3),
                $pin('q', 8, 1), $pin('r', 30, 1), $pin('s', 70, 9), $pin('t', 90, 1), $pin('u', 10, 29), $pin('v', 46, 23), $pin('w', 80, 31), $pin('x', 62, 57), $pin('y', 30, 71),
            ]]],
            'springpink' => ['label' => 'Spring pink', 'description' => 'A tall pastel board: big poster words, a centre photo, torn page and colour squares.', 'layout' => ['ratio' => $r35, 'background' => '#ffffff', 'pattern' => 'none', 'slots' => [
                $s('a', 'text', 38, 3, 56, 3, 'Title', 'rect', 0, 5), $chip('b', 73, 12, 21, $sq(21, $r35), 'Pink square', 'rect', 1), $s('c', 'text', 8, 14, 52, 11, 'Big words', 'rect', 0, 6),
                $s('d', 'photo', 22, 25, 58, 35, 'Main photo', 'rect', 0, 1), $s('e', 'photo', 6, 45, 26, 14, 'Photo 2', 'rect', 0, 2), $s('f', 'photo', 18, 57, 44, 21, 'Photo 3', 'rect', 0, 2), $s('g', 'photo', 48, 54, 36, 29, 'Photo 4', 'torn', 0, 3),
                $s('h', 'color', 71, 30, 21, 22, 'Torn page', 'torn', 0, 2, ['value' => '#f2efe6']), $s('i', 'text', 73, 33, 17, 16, 'Page words', 'rect', 0, 3),
                $chip('j', 30, 37, 14, $sq(14, $r35), 'Colour 1', 'rect', 3), $chip('k', 62, 45, 14, $sq(14, $r35), 'Colour 2', 'rect', 3), $s('l', 'color', 8, 62, 22, $sq(22, $r35), 'Colour 3', 'rect', 0, 3, ['value' => '#d9a3a6']),
                $s('m', 'sticker', 14, 64, 10, 7, 'Butterfly', 'rect', 0, 4, ['value' => 'svg:butterfly', 'color' => '#a56a70']), $chip('n', 38, 74, 16, $sq(16, $r35), 'Colour 4', 'rect', 4), $chip('o', 18, 84, 16, $sq(16, $r35), 'Colour 5', 'rect', 4),
                $s('p', 'text', 30, 95, 40, 2, 'Footer', 'rect', 0, 5),
            ]]],
            'springgreen' => ['label' => 'Spring green', 'description' => 'Staggered photos around a big brush-script title.', 'layout' => ['ratio' => $r23, 'background' => '#eef0ec', 'pattern' => 'none', 'slots' => [
                $s('a', 'photo', 1, 1, 44, 20, 'Photo 1', 'rect', 0, 1), $s('b', 'photo', 40, 1, 26, 22, 'Photo 2', 'rect', 0, 2), $s('c', 'photo', 63, 9, 36, 20, 'Photo 3', 'rect', 0, 1),
                $s('d', 'text', 12, 31, 74, 15, 'Title', 'rect', 0, 5), $s('e', 'text', 42, 48, 50, 3, 'Subtitle', 'rect', 0, 5),
                $s('f', 'photo', 1, 47, 34, 27, 'Photo 4', 'rect', 0, 1), $s('g', 'photo', 36, 57, 32, 19, 'Photo 5', 'rect', 0, 2), $s('h', 'photo', 66, 59, 33, 31, 'Photo 6', 'rect', 0, 1), $s('i', 'photo', 24, 74, 42, 25, 'Photo 7', 'rect', 0, 3),
                $s('j', 'text', 58, 95, 40, 2.5, 'Footer', 'rect', 0, 5),
            ]]],
        ];
    }

    public static function find(string $key): ?array
    {
        return self::all()[$key] ?? null;
    }
}
