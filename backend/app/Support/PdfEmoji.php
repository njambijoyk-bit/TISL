<?php

namespace App\Support;

/**
 * Emoji for PDFs. The PDF writer has no emoji font, so a "💙" in a tagline or note comes out as "?". Each emoji in the text of the page is swapped for a small
 * picture of it, taken from the Twemoji set kept in resources/emoji (graphics by Twitter and contributors, CC-BY 4.0), so nothing is fetched from the internet.
 * An emoji with no picture is left out rather than printed as a question mark. Symbols the text font draws itself (©, ™, ✓) are left alone.
 */
class PdfEmoji
{
    /** A flag, a keycap, or a pictograph with its modifiers and joined partners. */
    private const PATTERN = '/[\x{1F1E6}-\x{1F1FF}]{2}|[#*0-9]\x{FE0F}?\x{20E3}|\p{Extended_Pictographic}(?:\x{FE0F}|[\x{1F3FB}-\x{1F3FF}])*(?:\x{200D}\p{Extended_Pictographic}(?:\x{FE0F}|[\x{1F3FB}-\x{1F3FF}])*)*/u';

    /** The HTML with every emoji in its text (not its tags, styles or scripts) replaced by an inline picture. */
    public static function html(string $html): string
    {
        if (! preg_match(self::PATTERN, $html)) {
            return $html;
        }
        $parts = preg_split('/(<style\b.*?<\/style>|<script\b.*?<\/script>|<[^>]*>)/is', $html, -1, PREG_SPLIT_DELIM_CAPTURE);
        foreach ($parts as $i => $part) {
            if ($i % 2 === 0 && $part !== '') {   // text between tags
                $parts[$i] = preg_replace_callback(self::PATTERN, fn ($m) => self::one($m[0]), $part);
            }
        }

        return implode('', $parts);
    }

    private static function one(string $seq): string
    {
        $cps = array_map(fn ($c) => mb_ord($c, 'UTF-8'), mb_str_split($seq, 1, 'UTF-8'));
        $plain = count($cps) === 1 && $cps[0] < 0x1F000 && ! ($cps[0] >= 0x1F1E6 && $cps[0] <= 0x1F1FF);
        if ($plain) {
            return $seq;   // a lone symbol the text font draws itself
        }
        $pic = self::picture($cps);

        return $pic ? '<img src="'.$pic.'" style="height:1.1em;width:1.1em;vertical-align:-0.18em" alt="">' : '';
    }

    /** The picture of an emoji as a data address, or null when the set has none. @param array<int, int> $cps */
    private static function picture(array $cps): ?string
    {
        if (! in_array(0x200D, $cps, true)) {
            $cps = array_values(array_filter($cps, fn ($c) => $c !== 0xFE0F));   // the set names a joined emoji with its selectors, the rest without
        }
        $file = resource_path('emoji/'.implode('-', array_map(fn ($c) => dechex($c), $cps)).'.svg');
        if (! is_file($file)) {
            return null;
        }

        return 'data:image/svg+xml;base64,'.base64_encode((string) file_get_contents($file));
    }
}
