<?php

namespace App\Services;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * "Are you looking for…" suggestions when an exact search finds nothing.
 *
 * 1. Pull candidates whose searchable columns contain the first or last three
 *    letters of any search word, or a word starting with its first two letters
 *    (so typos anywhere in a word still match).
 * 2. Rank them in PHP by how closely each search word matches a word in the
 *    name (Levenshtein), and keep only reasonable matches.
 *
 * Plain LIKE queries only, so it works the same on MySQL and MariaDB.
 */
class FuzzySuggestService
{
    private const MIN_WORD = 3;
    private const CANDIDATES = 60;
    private const MIN_SCORE = 0.55;

    /**
     * @param Builder  $query   Base query with visibility filters already applied
     * @param string   $search  What the customer typed
     * @param string[] $columns Columns to look for candidates in (first one is ranked)
     */
    public function suggest(Builder $query, string $search, array $columns, int $limit = 6): Collection
    {
        $words = $this->words($search);
        if ($words === []) {
            return collect();
        }

        $fragments = [];
        foreach ($words as $word) {
            $fragments[] = mb_substr($word, 0, self::MIN_WORD);
            $fragments[] = mb_substr($word, -self::MIN_WORD);
        }
        $fragments = array_values(array_unique($fragments));

        // First two letters at the start of a word, for swapped letters early on ("glvoes")
        $starts = array_values(array_unique(array_map(fn ($w) => mb_substr($w, 0, 2), $words)));

        $candidates = $query
            ->where(function (Builder $q) use ($fragments, $starts, $columns) {
                foreach ($columns as $column) {
                    foreach ($fragments as $fragment) {
                        $q->orWhere($column, 'like', '%' . $this->escapeLike($fragment) . '%');
                    }
                    foreach ($starts as $start) {
                        $q->orWhere($column, 'like', $this->escapeLike($start) . '%')
                          ->orWhere($column, 'like', '% ' . $this->escapeLike($start) . '%');
                    }
                }
            })
            ->limit(self::CANDIDATES)
            ->get();

        $nameColumn = $columns[0];

        return $candidates
            ->map(fn ($item) => ['item' => $item, 'score' => $this->score($words, (string) $item->{$nameColumn})])
            ->filter(fn ($row) => $row['score'] >= self::MIN_SCORE)
            ->sortByDesc('score')
            ->take($limit)
            ->pluck('item')
            ->values();
    }

    /** Lowercased words of at least MIN_WORD letters. */
    private function words(string $text): array
    {
        $parts = preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower(trim($text)), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return array_values(array_unique(array_filter($parts, fn ($w) => mb_strlen($w) >= self::MIN_WORD)));
    }

    /**
     * 0–1. For each search word, its best similarity to any word in the name;
     * then 70% the strongest word + 30% the average, so one good match counts
     * but names matching every word rank higher.
     */
    private function score(array $searchWords, string $name): float
    {
        $nameWords = $this->words($name);
        if ($nameWords === []) {
            return 0.0;
        }

        $scores = [];
        foreach ($searchWords as $sw) {
            $best = 0.0;
            foreach ($nameWords as $nw) {
                if (str_contains($nw, $sw) || str_contains($sw, $nw)) {
                    $best = 1.0;
                    break;
                }
                $max = max(strlen($sw), strlen($nw));
                $best = max($best, 1 - levenshtein($sw, $nw) / $max);
            }
            $scores[] = $best;
        }

        return 0.7 * max($scores) + 0.3 * (array_sum($scores) / count($scores));
    }

    private function escapeLike(string $value): string
    {
        return addcslashes($value, '%_\\');
    }
}
