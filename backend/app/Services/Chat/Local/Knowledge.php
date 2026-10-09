<?php

namespace App\Services\Chat\Local;

use DOMDocument;
use DOMElement;
use DOMNode;
use DOMXPath;

/** Reads the knowledge entries from the structured HTML file. No database needed to start with. */
final class Knowledge
{
    /** @var Entry[] */
    private array $entries = [];

    /** @param  array<string,string>  $placeholders  e.g. ['company.name' => 'TISL Store'] */
    public function __construct(string $html, private array $placeholders = [])
    {
        $doc = new DOMDocument;
        $prev = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="utf-8"?>' . $html);
        libxml_clear_errors();
        libxml_use_internal_errors($prev);

        $xp = new DOMXPath($doc);
        foreach ($xp->query('//article[contains(concat(" ", normalize-space(@class), " "), " kb ")]') as $a) {
            /** @var DOMElement $a */
            $this->entries[] = $this->entry($a, $xp);
        }
    }

    /** @param  Entry[]  $entries */
    public static function fromEntries(array $entries, array $placeholders = []): self
    {
        $k = new self('', $placeholders);
        $k->entries = $entries;

        return $k;
    }

    public static function fromFile(string $path, array $placeholders = []): self
    {
        return new self((string) file_get_contents($path), $placeholders);
    }

    /** @return Entry[] */
    public function all(): array
    {
        return $this->entries;
    }

    public function find(string $id): ?Entry
    {
        foreach ($this->entries as $e) {
            if ($e->id === $id) {
                return $e;
            }
        }

        return null;
    }

    public function fill(string $text): string
    {
        return preg_replace_callback('/\{\{\s*([\w.]+)\s*\}\}/', fn ($m) => $this->placeholders[$m[1]] ?? $m[0], $text);
    }

    private function entry(DOMElement $a, DOMXPath $xp): Entry
    {
        $list = fn (string $attr): array => preg_split('/\s+/', trim($a->getAttribute($attr)), -1, PREG_SPLIT_NO_EMPTY);
        $part = function (string $cls) use ($a, $xp): ?DOMElement {
            $n = $xp->query('.//*[contains(concat(" ", normalize-space(@class), " "), " ' . $cls . ' ")]', $a)->item(0);

            return $n instanceof DOMElement ? $n : null;
        };
        $variants = [];
        foreach ($xp->query('.//*[contains(concat(" ", normalize-space(@class), " "), " kb-q ")]/li', $a) as $li) {
            /** @var DOMElement $li */
            $variants[] = ['text' => trim($li->textContent), 'lang' => $li->getAttribute('lang') ?: 'en'];
        }
        $text = fn (?DOMElement $n): string => $n ? trim(preg_replace('/\s+/', ' ', $n->textContent)) : '';

        return new Entry(
            id: $a->getAttribute('id'),
            title: $text($part('kb-title')),
            audience: $list('data-audience'),
            requires: $list('data-requires'),
            sensitivity: $a->getAttribute('data-sensitivity') ?: 'public',
            resolver: $a->getAttribute('data-resolver'),
            keywords: $a->getAttribute('data-keywords'),
            follow: $list('data-follow'),
            status: $a->getAttribute('data-status'),
            reviewed: $a->getAttribute('data-reviewed'),
            variants: $variants,
            answer: $part('kb-a') ? trim($this->markdown($part('kb-a'))) : '',
            more: $text($part('kb-more')),
            denied: $text($part('kb-denied')),
            empty: $text($part('kb-empty')),
        );
    }

    /** The chat renders a small markdown subset (bold, italic, code, bullets): convert the answer's HTML to it. Links become "text (url)". */
    private function markdown(DOMNode $n): string
    {
        $out = '';
        foreach ($n->childNodes as $c) {
            if ($c->nodeType === XML_TEXT_NODE) {
                $out .= preg_replace('/\s+/', ' ', $c->textContent);
            } elseif ($c instanceof DOMElement) {
                $in = $this->markdown($c);
                $out .= match (strtolower($c->tagName)) {
                    'strong', 'b' => '**' . trim($in) . '**',
                    'em', 'i' => '*' . trim($in) . '*',
                    'code' => '`' . trim($in) . '`',
                    'a' => ($u = $c->getAttribute('href')) !== '' && ! str_starts_with($u, 'mailto:') ? trim($in) . ' (' . $u . ')' : trim($in),
                    'li' => "\n- " . trim($in),
                    'ul', 'ol' => $in . "\n",
                    'p', 'div' => "\n" . trim($in) . "\n",
                    'br' => "\n",
                    default => $in,
                };
            }
        }

        return $out;
    }
}
