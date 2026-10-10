<?php

namespace App\Services\Security;

use Illuminate\Support\Str;

/**
 * What makes a password acceptable, in one place: used at register, change, reset, the temporary-password door and when an administrator sets one.
 *
 * Length is what counts, so the rules are few: long enough, not one of the passwords everybody tries first (also not when dressed up with digits, symbols or letter swaps),
 * not made of the person's own name or email or "tisl", and not one letter or one short piece over and over.
 */
final class PasswordPolicy
{
    /** @var array<string, true>|null */
    private static ?array $common = null;

    public static function minLength(): int
    {
        return max(8, (int) config('security.password.min_length', 10));
    }

    public static function maxLength(): int
    {
        return (int) config('security.password.max_length', 128);
    }

    /**
     * Why this password is not acceptable, in plain words; null when it is fine.
     *
     * @param  array<int, string|null>  $personal  things about the person that must not be in it: name, email, phone
     */
    public static function problem(string $password, array $personal = []): ?string
    {
        $length = mb_strlen($password);
        if ($length < self::minLength()) {
            return 'Use at least '.self::minLength().' characters. A few unrelated words strung together make a strong one that is easy to remember.';
        }
        if ($length > self::maxLength()) {
            return 'That is too long: use at most '.self::maxLength().' characters.';
        }
        if (self::isCommon($password)) {
            return 'That password is one of the first ones anybody would try. Pick something only you would think of, such as three or four unrelated words.';
        }
        if (self::isRepetitive($password)) {
            return 'That password repeats the same few characters. Mix it up, or use a few unrelated words.';
        }
        if (self::containsPersonal($password, $personal)) {
            return 'Your password should not contain your name, your email, your phone number or the word TISL.';
        }

        return null;
    }

    public static function isCommon(string $password): bool
    {
        $list = self::common();
        foreach (self::variants($password) as $candidate) {
            if (isset($list[$candidate])) {
                return true;
            }
        }

        return false;
    }

    /** One character over and over, a straight run (12345678, abcdefgh), or one short piece repeated (abcabcabc). */
    public static function isRepetitive(string $password): bool
    {
        $lower = mb_strtolower($password);
        $chars = preg_split('//u', $lower, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        if (count(array_unique($chars)) < 5) {
            return true;
        }
        if (preg_match('/^(.{1,6}?)\1{2,}$/us', $lower)) {
            return true;
        }
        $codes = array_map('mb_ord', $chars);
        $steps = array_unique(array_map(fn ($i) => $codes[$i] - $codes[$i - 1], range(1, count($codes) - 1)));

        return count($steps) === 1 && in_array($steps[0], [1, -1], true);
    }

    /** @param array<int, string|null> $personal */
    public static function containsPersonal(string $password, array $personal): bool
    {
        $banned = array_merge((array) config('security.password.banned_words', ['tisl']), self::wordsFrom($personal));
        foreach (self::variants($password, strip: false) as $candidate) {
            foreach ($banned as $word) {
                if ($word !== '' && str_contains($candidate, $word)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * The pieces of a person's details worth refusing: each name part, the email's name part, the whole name run together, a phone number. Short pieces are left out (they would block half of all passwords).
     *
     * @param  array<int, string|null>  $personal
     * @return array<int, string>
     */
    public static function wordsFrom(array $personal): array
    {
        $words = [];
        foreach ($personal as $item) {
            $item = mb_strtolower(trim((string) $item));
            if ($item === '') {
                continue;
            }
            if (str_contains($item, '@')) {
                $item = explode('@', $item)[0];
            }
            $digits = preg_replace('/\D+/', '', $item);
            if (strlen($digits) >= 7) {
                $words[] = $digits;
            }
            $parts = preg_split('/[^\p{L}\p{N}]+/u', $item, -1, PREG_SPLIT_NO_EMPTY) ?: [];
            foreach ($parts as $p) {
                if (mb_strlen($p) >= 4) {
                    $words[] = $p;
                }
            }
            $joined = preg_replace('/[^\p{L}\p{N}]+/u', '', $item);
            if (mb_strlen($joined) >= 4 && count($parts) > 1) {
                $words[] = $joined;
            }
        }

        return array_values(array_unique($words));
    }

    /** A password nobody knows, long and made of characters that survive being read out or pasted: for accounts made without one. */
    public static function random(): string
    {
        return Str::random(24).'-'.random_int(10, 99);
    }

    /** The lower-case password as typed, with its symbol-for-letter swaps undone, and each of those with leading and trailing digits and symbols taken off. */
    private static function variants(string $password, bool $strip = true): array
    {
        $lower = mb_strtolower($password);
        $swap = ['@' => 'a', '4' => 'a', '3' => 'e', '0' => 'o', '$' => 's', '5' => 's', '7' => 't', '+' => 't'];
        $out = [$lower, strtr($lower, $swap + ['1' => 'i']), strtr($lower, $swap + ['1' => 'l'])];   // a 1 may stand for an i or an l
        if ($strip) {
            foreach ($out as $v) {
                $stripped = preg_replace('/^[^\p{L}]+|[^\p{L}]+$/u', '', $v);
                $out[] = $stripped;
                $run = preg_replace('/[^\p{L}\p{N}]+/u', '', $stripped);   // letmein-letmein -> letmeinletmein
                $out[] = $run;
                $half = intdiv(mb_strlen($run), 2);
                if ($half >= 3 && mb_strlen($run) % 2 === 0 && mb_substr($run, 0, $half) === mb_substr($run, $half)) {
                    $out[] = mb_substr($run, 0, $half);   // ...the same word twice
                }
            }
        }

        return array_values(array_unique(array_filter($out, fn ($v) => $v !== null && $v !== '')));
    }

    /** @return array<string, true> */
    private static function common(): array
    {
        if (self::$common === null) {
            $file = resource_path('security/common-passwords.txt');
            $lines = is_file($file) ? (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: []) : [];
            self::$common = array_fill_keys(array_map('mb_strtolower', array_map('trim', $lines)), true);
        }

        return self::$common;
    }
}
