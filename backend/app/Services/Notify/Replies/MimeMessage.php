<?php

namespace App\Services\Notify\Replies;

/** Just enough of an email to file a reply: who from, who to, the subject, its id, and the plain text (or the HTML made plain). */
class MimeMessage
{
    /** @return array{message_id: ?string, from: string, from_name: ?string, to: string[], subject: string, date: ?string, body: string} */
    public static function parse(string $raw): array
    {
        [$head, $body] = self::split($raw);
        $h = self::headers($head);
        [$fromName, $from] = self::address($h['from'] ?? '');
        $to = [];
        foreach (['to', 'cc', 'delivered-to', 'x-original-to', 'envelope-to'] as $k) {
            foreach (preg_split('/,(?=(?:[^"]*"[^"]*")*[^"]*$)/', $h[$k] ?? '') as $part) {
                [, $addr] = self::address($part);
                if ($addr !== '') {
                    $to[] = $addr;
                }
            }
        }
        $date = isset($h['date']) && strtotime($h['date']) ? date('Y-m-d H:i:s', strtotime($h['date'])) : null;

        return ['message_id' => isset($h['message-id']) ? trim($h['message-id'], " <>\t") : null, 'from' => $from, 'from_name' => $fromName, 'to' => array_values(array_unique($to)),
            'subject' => self::decodeWords($h['subject'] ?? ''), 'date' => $date, 'body' => self::text($h, $body)];
    }

    /** @return array{0: string, 1: string} */
    private static function split(string $raw): array
    {
        $raw = str_replace("\r\n", "\n", $raw);
        $at = strpos($raw, "\n\n");

        return $at === false ? [$raw, ''] : [substr($raw, 0, $at), substr($raw, $at + 2)];
    }

    /** @return array<string, string> lower-case name => value (the first of each, unfolded) */
    private static function headers(string $head): array
    {
        $out = [];
        foreach (explode("\n", preg_replace("/\n[ \t]+/", ' ', $head)) as $line) {
            if (str_contains($line, ':')) {
                [$k, $v] = explode(':', $line, 2);
                $out[strtolower(trim($k))] ??= trim($v);
            }
        }

        return $out;
    }

    /** @return array{0: ?string, 1: string} name, address */
    private static function address(string $v): array
    {
        $v = self::decodeWords(trim($v));
        if (preg_match('/^(.*)<([^>]+)>\s*$/', $v, $m)) {
            $name = trim(trim($m[1]), "\"' ");

            return [$name !== '' ? $name : null, strtolower(trim($m[2]))];
        }

        return [null, filter_var(trim($v), FILTER_VALIDATE_EMAIL) ? strtolower(trim($v)) : ''];
    }

    private static function decodeWords(string $v): string
    {
        if (! str_contains($v, '=?')) {
            return $v;
        }
        $d = @iconv_mime_decode($v, ICONV_MIME_DECODE_CONTINUE_ON_ERROR, 'UTF-8');

        return $d !== false ? $d : $v;
    }

    /** The first text/plain part; failing that, the first text/html part made plain. */
    private static function text(array $h, string $body): string
    {
        $type = strtolower($h['content-type'] ?? 'text/plain');
        if (str_starts_with($type, 'multipart/') && preg_match('/boundary="?([^";]+)"?/i', $h['content-type'], $m)) {
            $html = null;
            foreach (explode('--' . $m[1], $body) as $part) {
                $part = ltrim($part, "\n");
                if ($part === '' || str_starts_with($part, '--')) {
                    continue;
                }
                [$ph, $pb] = self::split($part);
                $phh = self::headers($ph);
                $pt = strtolower($phh['content-type'] ?? 'text/plain');
                if (str_contains(strtolower($phh['content-disposition'] ?? ''), 'attachment')) {
                    continue;
                }
                if (str_starts_with($pt, 'multipart/')) {
                    $inner = self::text($phh, $pb);
                    if ($inner !== '') {
                        return $inner;
                    }
                } elseif (str_starts_with($pt, 'text/plain')) {
                    return self::decode($phh, $pb);
                } elseif (str_starts_with($pt, 'text/html')) {
                    $html ??= self::plain(self::decode($phh, $pb));
                }
            }

            return $html ?? '';
        }
        $text = self::decode($h, $body);

        return str_starts_with($type, 'text/html') ? self::plain($text) : $text;
    }

    private static function decode(array $h, string $body): string
    {
        $enc = strtolower(trim($h['content-transfer-encoding'] ?? ''));
        $body = match ($enc) { 'base64' => (string) base64_decode(preg_replace('/\s+/', '', $body)), 'quoted-printable' => quoted_printable_decode($body), default => $body };
        if (preg_match('/charset="?([^";\s]+)"?/i', $h['content-type'] ?? '', $m) && strtolower($m[1]) !== 'utf-8') {
            $converted = @mb_convert_encoding($body, 'UTF-8', $m[1]);
            $body = is_string($converted) ? $converted : $body;
        }

        return trim($body);
    }

    private static function plain(string $html): string
    {
        $html = preg_replace(['#<(br|/p|/div|/li|/tr)[^>]*>#i', '#<blockquote.*?</blockquote>#is', '#<(style|script)[^>]*>.*?</\1>#is'], ["\n", '', ''], $html);

        return trim(html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }
}
