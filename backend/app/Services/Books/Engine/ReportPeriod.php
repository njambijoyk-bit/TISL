<?php

namespace App\Services\Books\Engine;

use DateTimeImmutable;
use InvalidArgumentException;

/**
 * Which dates a report runs over when nobody has chosen, and what "the previous period" and "the same period last year" mean for a chosen one.
 * Dates are 'Y-m-d' strings. It needs no database: the financial years are passed in (see current()), so the rules can be tested on their own.
 */
final class ReportPeriod
{
    public const COMPARISONS = ['none', 'previous_period', 'previous_year'];

    /**
     * The period a report opens on: the financial year that today falls in, from its start to today (or to its end, if that is earlier); with no
     * year covering today, the latest year that has already started; with no years at all, the calendar year so far.
     *
     * @param  array<int, array{name?: string, start_date: string, end_date: string}>  $years
     * @return array{from: string, to: string, year: ?string}
     */
    public static function defaultFor(array $years, string $today): array
    {
        $t = self::day($today);
        $started = array_values(array_filter($years, fn ($y) => self::day($y['start_date']) <= $t));
        usort($started, fn ($a, $b) => strcmp($b['start_date'], $a['start_date']));
        foreach ($started as $y) {
            if (self::day($y['end_date']) >= $t) {
                return ['from' => $y['start_date'], 'to' => $today, 'year' => $y['name'] ?? null];
            }
        }
        if ($started) {   // every year that has started has ended: the latest one, in full
            return ['from' => $started[0]['start_date'], 'to' => $started[0]['end_date'], 'year' => $started[0]['name'] ?? null];
        }

        return ['from' => $t->format('Y') . '-01-01', 'to' => $today, 'year' => null];
    }

    /** The default period, from the financial years in the books. */
    public static function current(?string $today = null): array
    {
        $years = \App\Models\Books\FinancialYear::query()->get(['name', 'start_date', 'end_date'])
            ->map(fn ($y) => ['name' => $y->name, 'start_date' => $y->start_date->toDateString(), 'end_date' => $y->end_date->toDateString()])->all();

        return self::defaultFor($years, $today ?? now()->toDateString());
    }

    /**
     * The period just before: a run of whole calendar months moves back by that many months (a month gives the month before, a financial year the year
     * before); anything else moves back by its own length in days.
     *
     * @return array{from: string, to: string}
     */
    public static function previousPeriod(string $from, string $to): array
    {
        $f = self::day($from);
        $t = self::day($to);
        self::assertOrder($f, $t);
        if ($f->format('d') === '01' && $t->format('Y-m-d') === $t->modify('last day of this month')->format('Y-m-d')) {
            $months = ((int) $t->format('Y') - (int) $f->format('Y')) * 12 + (int) $t->format('n') - (int) $f->format('n') + 1;

            return [
                'from' => $f->modify("-{$months} months")->format('Y-m-d'),
                'to' => $f->modify('-1 day')->format('Y-m-d'),
            ];
        }
        $days = (int) $f->diff($t)->days + 1;
        $prevTo = $f->modify('-1 day');

        return ['from' => $prevTo->modify('-' . ($days - 1) . ' days')->format('Y-m-d'), 'to' => $prevTo->format('Y-m-d')];
    }

    /**
     * The same dates a year earlier. 29 February becomes 28 February, and the last day of a month stays the last day of that month.
     *
     * @return array{from: string, to: string}
     */
    public static function sameLastYear(string $from, string $to): array
    {
        $f = self::day($from);
        $t = self::day($to);
        self::assertOrder($f, $t);

        return ['from' => self::yearBack($f), 'to' => self::yearBack($t)];
    }

    /** @return array{from: string, to: string}|null null when no comparison is wanted */
    public static function compare(string $mode, string $from, string $to): ?array
    {
        return match ($mode) {
            'previous_period' => self::previousPeriod($from, $to),
            'previous_year' => self::sameLastYear($from, $to),
            'none', '' => null,
            default => throw new InvalidArgumentException("There is no comparison called {$mode}."),
        };
    }

    private static function yearBack(DateTimeImmutable $d): string
    {
        $back = $d->modify('-1 year');
        if ($d->format('m-d') === '02-29') {
            return $back->format('Y') . '-02-28';
        }
        if ($d->format('Y-m-d') === $d->modify('last day of this month')->format('Y-m-d')) {
            return $back->modify('last day of this month')->format('Y-m-d');
        }

        return $back->format('Y-m-d');
    }

    private static function day(string $date): DateTimeImmutable
    {
        $d = DateTimeImmutable::createFromFormat('!Y-m-d', substr($date, 0, 10));
        if (! $d || $d->format('Y-m-d') !== substr($date, 0, 10)) {
            throw new InvalidArgumentException("{$date} is not a date (use year-month-day).");
        }

        return $d;
    }

    private static function assertOrder(DateTimeImmutable $from, DateTimeImmutable $to): void
    {
        if ($from > $to) {
            throw new InvalidArgumentException('The start date is after the end date.');
        }
    }
}
