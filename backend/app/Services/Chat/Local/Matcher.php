<?php

namespace App\Services\Chat\Local;

/**
 * The transparent matcher: normalise, drop filler, stem, spell-correct against our own vocabulary, fold synonyms, then score each entry's question
 * variants by how much of the question they explain (coverage) and how much of the variant the question explains (precision), weighted by rarity.
 * No training, nothing hidden. The same algorithm runs in the guide's playground. Pure PHP: no framework needed.
 */
final class Matcher
{
    private const STOP = 'a an the is are was were be been am to of for in on at by do does did can could would should will shall may might i me my mine we our us you your yours it its this that these those and or but so if then than too very just please pls kindly about with there here any some up out as from into over also get got have has had having tell yangu zangu wako yako langu iko';

    private const PLACEHOLDERS = ['ordref', 'payref', 'custref', 'emailaddr'];

    /** @var array<string,string> stem => canonical stem */
    private array $canon = [];

    /** @var array<string,true> every word we know, stemmed: the spell-checker's dictionary */
    private array $dict = [];

    /** @var array<string,true> */
    private array $stop;

    /**
     * @param  string[][]  $groups  synonym groups, first word canonical
     * @param  Entry[]  $entries  every entry (to build the dictionary from)
     */
    public function __construct(array $groups, array $entries)
    {
        $this->stop = array_fill_keys(explode(' ', self::STOP), true);
        foreach ($groups as $g) {
            $c = $this->stem($g[0]);
            foreach ($g as $m) {
                $this->canon[$this->stem($m)] = $c;
            }
        }
        $add = function (string $text): void {
            foreach ($this->words($text) as $w) {
                if (! isset($this->stop[$w])) {
                    $this->dict[$this->stem($w)] = true;
                }
            }
        };
        foreach ($groups as $g) {
            foreach ($g as $m) {
                $add($m);
            }
        }
        foreach ($entries as $e) {
            $add($e->title);
            $add($e->keywords);
            foreach ($e->variants as $v) {
                $add($v['text']);
            }
        }
        foreach (self::PLACEHOLDERS as $p) {
            $this->dict[$p] = true;
        }
    }

    public function squash(string $s): string
    {
        if (class_exists(\Normalizer::class)) {
            $s = \Normalizer::normalize($s, \Normalizer::FORM_KD) ?: $s;
        }
        $s = mb_strtolower((string) preg_replace('/\p{Mn}+/u', '', $s));

        return (string) preg_replace('/m[\s-]?pesa/', 'mpesa', $s);
    }

    /** @return string[] */
    private function words(string $text): array
    {
        return preg_split('/\s+/', trim((string) preg_replace('/[^a-z0-9]+/', ' ', $this->squash($text))), -1, PREG_SPLIT_NO_EMPTY);
    }

    public function stem(string $w): string
    {
        $n = strlen($w);
        if ($n > 4 && str_ends_with($w, 'ies')) {
            return substr($w, 0, -3) . 'y';
        }
        if ($n > 5 && str_ends_with($w, 'ing')) {
            $w = substr($w, 0, -3);
        } elseif ($n > 4 && str_ends_with($w, 'ed')) {
            $w = substr($w, 0, -2);
        } elseif ($n > 4 && preg_match('/(ss|x|z|ch|sh)es$/', $w)) {
            $w = substr($w, 0, -2);
        } elseif ($n > 3 && str_ends_with($w, 's') && ! preg_match('/(ss|us|is)$/', $w)) {
            $w = substr($w, 0, -1);
        }
        if (strlen($w) > 3 && preg_match('/([^aeiouls])\1$/', $w)) {
            $w = substr($w, 0, -1);
        }

        return $w;
    }

    private function correct(string $s): string
    {
        if (isset($this->dict[$s]) || strlen($s) < 5) {
            return $s;
        }
        $lim = strlen($s) >= 8 ? 2 : 1;
        $best = $s;
        $bd = $lim + 1;
        foreach ($this->dict as $d => $_) {
            $d = (string) $d;
            if ($d[0] !== $s[0] || strlen($d) < 4 || abs(strlen($d) - strlen($s)) > $lim) {
                continue;
            }
            $x = levenshtein($s, $d);
            if ($x < $bd) {
                $bd = $x;
                $best = $d;
            }
        }

        return $best;
    }

    /** @return string[] canonical tokens, in order */
    public function tokens(string $text): array
    {
        $out = [];
        foreach ($this->words($text) as $w) {
            if (isset($this->stop[$w])) {
                continue;
            }
            $s = $this->correct($this->stem($w));
            $out[] = $this->canon[$s] ?? $s;
        }

        return $out;
    }

    /** Turn a variant's {order} style slots into the placeholder words the question side produces. */
    public static function variantText(string $v): string
    {
        return strtr($v, ['{order}' => ' ordref ', '{payment}' => ' payref ', '{customer}' => ' custref ', '{email}' => ' emailaddr ']);
    }

    private function sim(string $a, string $b): float
    {
        if ($a === $b) {
            return 1.0;
        }
        $la = strlen($a);
        $lb = strlen($b);
        if ($la < 5 || $lb < 5 || $a[0] !== $b[0]) {
            return 0.0;
        }
        $lim = max($la, $lb) >= 8 ? 2 : 1;

        return abs($la - $lb) <= $lim && levenshtein($a, $b) <= $lim ? 0.7 : 0.0;
    }

    /**
     * Rank entries against a question (already stripped of slots). Rarity (IDF) is measured over the entries given, so a hidden entry can never
     * influence how a visible one is scored.
     *
     * @param  Entry[]  $entries
     * @return array<int,array{entry:Entry,score:float}>  best first
     */
    public function rank(array $entries, string $text): array
    {
        $Q = array_values(array_unique($this->tokens($text)));
        if (! $Q || ! $entries) {
            return [];
        }
        $df = [];
        $rec = [];
        foreach ($entries as $e) {
            $vars = [];
            foreach (array_merge([$e->title], array_column($e->variants, 'text')) as $v) {
                $vars[] = array_values(array_unique($this->tokens(self::variantText($v))));
            }
            $kw = array_values(array_unique($this->tokens($e->keywords)));
            $seen = [];
            foreach ($vars as $set) {
                foreach ($set as $t) {
                    $seen[$t] = true;
                }
            }
            foreach ($kw as $t) {
                $seen[$t] = true;
            }
            foreach ($seen as $t => $_) {
                $df[$t] = ($df[$t] ?? 0) + 1;
            }
            $rec[] = [$e, $vars, $kw];
        }
        $N = count($entries);
        $idf = fn (string $t): float => log(1 + $N / ($df[$t] ?? 0.5));

        $out = [];
        foreach ($rec as [$e, $vars, $kw]) {
            $out[] = ['entry' => $e, 'score' => $this->score($vars, $kw, $Q, $idf)];
        }
        usort($out, fn ($a, $b) => $b['score'] <=> $a['score']);

        return $out;
    }

    private function score(array $vars, array $kw, array $Q, \Closure $idf): float
    {
        $best = 0.0;
        foreach ($vars as $v) {
            if (! $v) {
                continue;
            }
            $cn = $cd = $pn = $pd = 0.0;
            foreach ($Q as $q) {
                $w = $idf($q);
                $cd += $w;
                $m = 0.0;
                foreach ($v as $t) {
                    $m = max($m, $this->sim($q, $t));
                    if ($m === 1.0) {
                        break;
                    }
                }
                $cn += $w * $m;
            }
            foreach ($v as $t) {
                $w = $idf($t);
                $pd += $w;
                $m = 0.0;
                foreach ($Q as $q) {
                    $m = max($m, $this->sim($t, $q));
                    if ($m === 1.0) {
                        break;
                    }
                }
                $pn += $w * $m;
            }
            $cov = $cn / $cd;
            $pre = $pn / $pd;
            $f = $cov > 0 && $pre > 0 ? 2 * $cov * $pre / ($cov + $pre) : 0.0;
            $best = max($best, $f);
        }
        $kn = $kd = 0.0;
        foreach ($Q as $q) {
            $w = $idf($q);
            $kd += $w;
            foreach ($kw as $k) {
                if ($this->sim($q, $k) > 0) {
                    $kn += $w;
                    break;
                }
            }
        }

        return min(1.0, $best + ($best > 0.2 && $kd > 0 ? 0.15 * $kn / $kd : 0.0));
    }

    /** Share of the question's words that appear nowhere in the knowledge: a high share suggests another language. */
    public function unknownShare(string $text): float
    {
        $T = array_values(array_unique($this->tokens($text)));
        if (! $T) {
            return 0.0;
        }
        $known = 0;
        foreach ($T as $t) {
            foreach ($this->dict as $d => $_) {
                if ($this->sim($t, $this->canon[(string) $d] ?? (string) $d) > 0 || $this->sim($t, (string) $d) > 0) {
                    $known++;
                    break;
                }
            }
        }

        return 1 - $known / count($T);
    }
}
