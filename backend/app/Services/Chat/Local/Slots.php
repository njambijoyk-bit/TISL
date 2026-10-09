<?php

namespace App\Services\Chat\Local;

/**
 * Pulls references out of a question (order, payment and customer numbers, emails) and leaves placeholder words behind, so
 * "show me order WNKJ-SO-00012" is compared as "show order ordref". The order-number pattern is built from the voucher series prefixes in Books,
 * because voucher numbers are configurable (the old regex only matched year-style numbers).
 */
final class Slots
{
    private string $order;

    /** @param  string[]  $prefixes  voucher_series.prefix values, e.g. "WNKJ-SO-" or "INV/{YYYY}/" */
    public function __construct(array $prefixes = [])
    {
        // safety nets that need no database: the year-style numbers the old pattern handled, and the general shape of a voucher number (WNKJ-SO-00012)
        $parts = ['[A-Z]+-\d{4}-\d+', '[A-Z]{2,8}(?:-[A-Z0-9]{1,8})*-\d{3,}'];
        foreach ($prefixes as $p) {
            $p = trim((string) $p);
            if ($p === '') {
                continue;
            }
            $rx = strtr(preg_quote(rtrim($p, '-/'), '/'), ['\{YYYY\}' => '\d{4}', '\{YY\}' => '\d{2}', '\{MM\}' => '\d{2}', '\{BR\}' => '[A-Z0-9]+']);
            $parts[] = $rx . '[-\/]?\d+';
        }
        $this->order = '/\b(?:' . implode('|', array_unique($parts)) . ')\b/i';
    }

    public function orderPattern(): string
    {
        return $this->order;
    }

    /** @return array{text:string,slots:array<string,string>} */
    public function extract(string $q): array
    {
        $slots = [];
        $t = $q;
        $take = function (string $rx, string $name, string $ph) use (&$t, &$slots): void {
            $t = preg_replace_callback($rx, function ($m) use (&$slots, $name, $ph) {
                $slots[$name] ??= $m[0];

                return ' ' . $ph . ' ';
            }, $t) ?? $t;
        };
        $take('/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i', 'email', 'emailaddr');
        $take('/\bPAY-\d{4}-\d+-\d+\b/i', 'payref', 'payref');
        $take('/\bCUST-\d{4}-\d+\b/i', 'custref', 'custref');
        $take($this->order, 'ordref', 'ordref');
        $take('/\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{10}\b/', 'payref', 'payref');
        $t = preg_replace_callback('/\border\s*#?\s*(\d{1,8})\b/i', function ($m) use (&$slots) {
            $slots['ordnum'] = $m[1];

            return ' order ordref ';
        }, $t) ?? $t;

        return ['text' => $t, 'slots' => $slots];
    }
}
