<?php

namespace App\Services\Menus;

use App\Models\Menus\Menu;
use Illuminate\Support\Carbon;

/** When a menu is served: on which days, between which hours (an end before the start runs past midnight). */
final class MenuSchedule
{
    public const DAYS = [0 => 'Sun', 1 => 'Mon', 2 => 'Tue', 3 => 'Wed', 4 => 'Thu', 5 => 'Fri', 6 => 'Sat'];

    public static function serving(Menu $m, Carbon $now): bool
    {
        if (! $m->is_active) {
            return false;
        }
        $days = $m->days ?: null;
        [$from, $to] = [self::minutes($m->starts_at), self::minutes($m->ends_at)];
        $at = $now->hour * 60 + $now->minute;
        $today = in_array($now->dayOfWeek, $days ?? array_keys(self::DAYS), true);
        if ($from === null || $to === null || $from === $to) {
            return $today;   // all day
        }
        if ($from < $to) {
            return $today && $at >= $from && $at < $to;
        }
        // past midnight: the evening belongs to the day it started on, the small hours to the next day
        $yesterday = in_array(($now->dayOfWeek + 6) % 7, $days ?? array_keys(self::DAYS), true);

        return ($today && $at >= $from) || ($yesterday && $at < $to);
    }

    /** "Mon–Fri, 06:00–11:00" for a customer. */
    public static function words(Menu $m): string
    {
        $days = $m->days ?: null;
        $d = 'Every day';
        if ($days) {
            $days = array_values(array_unique(array_map('intval', $days)));
            sort($days);
            $run = count($days) > 2 && $days === range($days[0], $days[0] + count($days) - 1);
            $d = $run ? self::DAYS[$days[0]].'–'.self::DAYS[end($days)] : implode(', ', array_map(fn ($x) => self::DAYS[$x], $days));
        }
        [$from, $to] = [self::hhmm($m->starts_at), self::hhmm($m->ends_at)];

        return $from && $to && $from !== $to ? "{$d}, {$from}–{$to}" : $d;
    }

    private static function minutes(?string $t): ?int
    {
        if (! $t || ! preg_match('/^(\d{1,2}):(\d{2})/', $t, $x)) {
            return null;
        }

        return ((int) $x[1]) * 60 + (int) $x[2];
    }

    private static function hhmm(?string $t): ?string
    {
        return $t && preg_match('/^(\d{1,2}):(\d{2})/', $t, $x) ? sprintf('%02d:%02d', $x[1], $x[2]) : null;
    }
}
