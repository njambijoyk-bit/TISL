<?php

namespace App\Services\Menus;

use App\Services\Books\BooksException;
use App\Services\Memberships\MembershipBenefits;

/** Meal plans as a membership benefit: a percentage off the price of a meal plan for members. (Whether a meal plan needs a membership at all is set on the meal plan.) */
final class MembershipBenefit
{
    public static function register(MembershipBenefits $r): void
    {
        $r->register('meals', 'Meal plans', 'menus', [self::class, 'validate'], [self::class, 'describe']);
    }

    /** @param array<string, mixed> $c @return array<string, mixed> */
    public static function validate(array $c): array
    {
        $pct = round((float) ($c['discount_pct'] ?? 0), 2);
        if ($pct < 0 || $pct > 100) {
            throw new BooksException('The meal plan discount is between 0 and 100 percent.');
        }

        return ['discount_pct' => $pct];
    }

    /** @param array<string, mixed> $c */
    public static function describe(array $c): string
    {
        $p = (float) ($c['discount_pct'] ?? 0);

        return $p > 0 ? rtrim(rtrim(number_format($p, 2), '0'), '.').'% off meal plans' : 'Can subscribe to meal plans';
    }
}
