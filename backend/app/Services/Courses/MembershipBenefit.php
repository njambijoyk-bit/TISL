<?php

namespace App\Services\Courses;

use App\Models\Courses\Offering;
use App\Services\Books\BooksException;
use App\Services\Memberships\MembershipBenefits;

/**
 * Courses as a membership benefit: the plan opens every offering, or those of chosen kinds or categories, or a chosen list, and may waive the tuition fee for members (registration, exam, materials
 * and kit fees are still charged). Granting and ending the access is added when memberships can be held.
 */
final class MembershipBenefit
{
    public const MODES = ['all' => 'Every course', 'kind' => 'All of some kinds (recipes, notes ...)', 'category' => 'All of some categories', 'selected' => 'Chosen offerings'];

    public static function register(MembershipBenefits $r): void
    {
        $r->register('courses', 'Courses', 'courses', [self::class, 'validate'], [self::class, 'describe']);
    }

    /** @param array<string, mixed> $c @return array<string, mixed> */
    public static function validate(array $c): array
    {
        $mode = (string) ($c['mode'] ?? 'all');
        if (! isset(self::MODES[$mode])) {
            throw new BooksException('Choose which courses the plan opens.');
        }
        $out = ['mode' => $mode, 'waive_tuition' => (bool) ($c['waive_tuition'] ?? false), 'kinds' => [], 'categories' => [], 'offering_ids' => []];
        if ($mode === 'kind') {
            $out['kinds'] = array_values(array_unique(array_map('strval', (array) ($c['kinds'] ?? []))));
            if (! $out['kinds'] || array_diff($out['kinds'], array_keys(Offering::KINDS))) {
                throw new BooksException('Choose one or more kinds of offering.');
            }
        } elseif ($mode === 'category') {
            $out['categories'] = array_values(array_unique(array_filter(array_map(fn ($x) => mb_substr(trim((string) $x), 0, 80), (array) ($c['categories'] ?? [])))));
            if (! $out['categories']) {
                throw new BooksException('Name one or more categories.');
            }
        } elseif ($mode === 'selected') {
            $out['offering_ids'] = array_values(array_unique(array_map('intval', (array) ($c['offering_ids'] ?? []))));
            if (! $out['offering_ids'] || Offering::whereIn('id', $out['offering_ids'])->count() !== count($out['offering_ids'])) {
                throw new BooksException('Choose offerings that exist.');
            }
        }

        return $out;
    }

    /** @param array<string, mixed> $c */
    public static function describe(array $c): string
    {
        $mode = $c['mode'] ?? 'all';
        $what = match ($mode) {
            'kind' => 'Access to all '.strtolower(implode(', ', array_map(fn ($k) => Offering::KINDS[$k] ?? $k, $c['kinds'] ?? []))),
            'category' => 'Access to all courses in '.implode(', ', $c['categories'] ?? []),
            'selected' => 'Access to '.count($c['offering_ids'] ?? []).' chosen course'.(count($c['offering_ids'] ?? []) === 1 ? '' : 's'),
            default => 'Access to every course',
        };

        return $what.(! empty($c['waive_tuition']) ? ', tuition free' : '');
    }
}
