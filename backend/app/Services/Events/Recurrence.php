<?php

namespace App\Services\Events;

use Illuminate\Support\Carbon;

/** Makes the dates of a repeating event ("every Saturday at 10 for 8 weeks") so staff do not type them one by one. */
final class Recurrence
{
    public const MAX = 100;

    /**
     * @param  array{start: string, minutes?: int, repeat: string, every?: int, weekdays?: int[], until?: ?string, count?: ?int}  $rule
     *   repeat: daily | weekly | monthly; weekdays: 0 (Sunday) to 6, for weekly; until: last date (inclusive); count: how many sessions
     * @return array<int, array{starts_at: string, ends_at: ?string}>
     */
    public static function dates(array $rule): array
    {
        $start = Carbon::parse($rule['start']);
        $minutes = isset($rule['minutes']) ? (int) $rule['minutes'] : null;
        $every = max(1, min(12, (int) ($rule['every'] ?? 1)));
        $until = ! empty($rule['until']) ? Carbon::parse($rule['until'])->endOfDay() : null;
        $count = isset($rule['count']) ? (int) $rule['count'] : null;
        if ($until === null && $count === null) {
            throw new EventException('Say when it stops: a last date, or how many sessions.');
        }
        if ($count !== null && ($count < 1 || $count > self::MAX)) {
            throw new EventException('A repeat can make 1 to ' . self::MAX . ' sessions.');
        }
        if ($until !== null && $until->lt($start)) {
            throw new EventException('The last date is before the first session.');
        }
        $repeat = $rule['repeat'] ?? '';
        if (! in_array($repeat, ['daily', 'weekly', 'monthly'], true)) {
            throw new EventException('Repeat daily, weekly or monthly.');
        }
        $weekdays = array_values(array_unique(array_map('intval', $rule['weekdays'] ?? [$start->dayOfWeek])));
        foreach ($weekdays as $d) {
            if ($d < 0 || $d > 6) {
                throw new EventException('A weekday is 0 (Sunday) to 6 (Saturday).');
            }
        }
        sort($weekdays);

        $out = [];
        $limit = $count ?? self::MAX;
        $add = function (Carbon $at) use (&$out, $minutes) {
            $out[] = ['starts_at' => $at->format('Y-m-d H:i:s'), 'ends_at' => $minutes ? $at->copy()->addMinutes($minutes)->format('Y-m-d H:i:s') : null];
        };
        if ($repeat === 'daily') {
            for ($i = 0; count($out) < $limit; $i++) {
                $at = $start->copy()->addDays($i * $every);
                if ($until !== null && $at->gt($until)) {
                    break;
                }
                $add($at);
            }
        } elseif ($repeat === 'weekly') {
            $weekStart = $start->copy()->startOfWeek(Carbon::SUNDAY);
            for ($w = 0; count($out) < $limit && $w < 600; $w += $every) {
                foreach ($weekdays as $d) {
                    $at = $weekStart->copy()->addWeeks($w)->addDays($d)->setTime($start->hour, $start->minute, $start->second);
                    if ($at->lt($start)) {
                        continue;
                    }
                    if (($until !== null && $at->gt($until)) || count($out) >= $limit) {
                        break 2;
                    }
                    $add($at);
                }
            }
        } else {
            for ($i = 0; count($out) < $limit && $i < 600; $i++) {
                $at = $start->copy()->addMonthsNoOverflow($i * $every);
                if ($until !== null && $at->gt($until)) {
                    break;
                }
                $add($at);
            }
        }

        return $out;
    }
}
