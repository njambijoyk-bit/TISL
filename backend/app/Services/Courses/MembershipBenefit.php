<?php

namespace App\Services\Courses;

use App\Models\Courses\Offering;
use App\Models\Memberships\Membership;
use App\Services\Books\BooksException;
use App\Services\Memberships\MemberStanding;
use App\Services\Memberships\MembershipBenefits;

/**
 * Courses as a membership benefit: the plan opens every offering, or those of chosen kinds or categories, or a chosen list, and may waive the tuition fee for members (registration, exam, materials
 * and kit fees are still charged). The access is an ordinary course access with the source "membership", so the library, the player and the certificates work as they do for a paid enrolment; it is
 * given when the member is in good standing and taken back when they pause, lapse or leave. An offering published after the membership began is picked up by `sync`.
 */
final class MembershipBenefit
{
    public const MODES = ['all' => 'Every course', 'kind' => 'All of some kinds (recipes, notes ...)', 'category' => 'All of some categories', 'selected' => 'Chosen offerings'];

    public static function register(MembershipBenefits $r): void
    {
        $r->register('courses', 'Courses', 'courses', [self::class, 'validate'], [self::class, 'describe'], [self::class, 'grant'], [self::class, 'revoke']);
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

    /** Does this benefit cover the offering? @param array<string, mixed> $c */
    public static function covers(array $c, Offering $o): bool
    {
        return match ($c['mode'] ?? 'all') {
            'kind' => in_array($o->kind, $c['kinds'] ?? [], true),
            'category' => $o->category !== null && in_array(mb_strtolower($o->category), array_map('mb_strtolower', $c['categories'] ?? []), true),
            'selected' => in_array((int) $o->id, array_map('intval', $c['offering_ids'] ?? []), true),
            default => true,
        };
    }

    /** @param array<string, mixed> $c */
    private static function offerings(array $c)
    {
        return Offering::where('status', 'published')->get()->filter(fn (Offering $o) => self::covers($c, $o));
    }

    private static function ref(Membership $m): string
    {
        return 'membership:'.$m->id;
    }

    /** Open the offerings the plan covers to the member. @param array<string, mixed> $c */
    public static function grant(Membership $m, array $c): void
    {
        $access = app(CourseAccess::class);
        foreach (self::offerings($c) as $o) {
            try {
                $access->grant((int) $m->member_user_id, (int) $o->id, 'membership', self::ref($m));
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }

    /** @param array<string, mixed> $c */
    public static function revoke(Membership $m, array $c): void
    {
        app(CourseAccess::class)->revoke('membership', self::ref($m));
    }

    /** What membership means for this person on this offering: null when it gives them nothing there. @return array{waive_tuition: bool}|null */
    public static function coverage(?int $userId, Offering $o): ?array
    {
        $c = MemberStanding::benefit($userId, 'courses');

        return $c !== null && self::covers($c, $o) ? ['waive_tuition' => (bool) ($c['waive_tuition'] ?? false)] : null;
    }
}
