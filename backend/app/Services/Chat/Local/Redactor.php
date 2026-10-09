<?php

namespace App\Services\Chat\Local;

/**
 * Builds what may leave the server when an outside AI is asked: the question with emails, phones and reference numbers swapped for tokens, plus
 * public snippets. The swap table stays here and is used to put the real values back into the reply. A seatbelt, not the brakes: the real control is
 * that account and business data are never put into the payload at all.
 */
final class Redactor
{
    /** @return array{text:string,swaps:array<string,string>} */
    public function redact(string $q, Slots $slots = new Slots): array
    {
        $swaps = [];
        $n = [];
        $sub = function (string $rx, string $label) use (&$q, &$swaps, &$n): void {
            $q = preg_replace_callback($rx, function ($m) use (&$swaps, &$n, $label) {
                $n[$label] = ($n[$label] ?? 0) + 1;
                $tok = "[{$label}_{$n[$label]}]";
                $swaps[$tok] = $m[0];

                return $tok;
            }, $q) ?? $q;
        };
        $sub('/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i', 'EMAIL');
        $sub('/\bPAY-\d{4}-\d+-\d+\b/i', 'PAYMENT');
        $sub('/\bCUST-\d{4}-\d+\b/i', 'CUSTOMER');
        $sub($slots->orderPattern(), 'ORDER');
        $sub('/\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{10}\b/', 'PAYMENT');
        $sub('/(?:\+?254|\b0)[\s-]?[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/', 'PHONE');
        $sub('/\b\d[\d\s-]{7,}\d\b/', 'NUMBER');

        return ['text' => $q, 'swaps' => $swaps];
    }

    public function restore(string $reply, array $swaps): string
    {
        return strtr($reply, $swaps);
    }
}
