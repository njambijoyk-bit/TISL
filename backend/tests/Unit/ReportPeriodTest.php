<?php

namespace Tests\Unit;

use App\Services\Books\Engine\ReportPeriod;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

/** Which dates a report opens on, and what "the previous period" and "the same period last year" mean (docs/BOOKS_REPORTS_PLAN.md, step 4). */
class ReportPeriodTest extends TestCase
{
    private function year(string $name, string $from, string $to): array
    {
        return ['name' => $name, 'start_date' => $from, 'end_date' => $to];
    }

    public function test_it_opens_on_the_financial_year_so_far(): void
    {
        $years = [$this->year('FY 2025', '2025-01-01', '2025-12-31'), $this->year('FY 2026', '2026-01-01', '2026-12-31')];
        $this->assertSame(['from' => '2026-01-01', 'to' => '2026-10-28', 'year' => 'FY 2026'], ReportPeriod::defaultFor($years, '2026-10-28'));
    }

    public function test_a_year_that_does_not_follow_the_calendar_is_honoured(): void
    {
        $years = [$this->year('FY 2026/27', '2026-07-01', '2027-06-30')];
        $this->assertSame(['from' => '2026-07-01', 'to' => '2027-02-10', 'year' => 'FY 2026/27'], ReportPeriod::defaultFor($years, '2027-02-10'));
    }

    public function test_when_no_year_covers_today_the_latest_one_that_started_is_shown_in_full(): void
    {
        $years = [$this->year('FY 2024', '2024-01-01', '2024-12-31'), $this->year('FY 2025', '2025-01-01', '2025-12-31'), $this->year('FY 2027', '2027-01-01', '2027-12-31')];
        $this->assertSame(['from' => '2025-01-01', 'to' => '2025-12-31', 'year' => 'FY 2025'], ReportPeriod::defaultFor($years, '2026-03-01'));
    }

    public function test_with_no_years_at_all_it_is_the_calendar_year_so_far(): void
    {
        $this->assertSame(['from' => '2026-01-01', 'to' => '2026-10-28', 'year' => null], ReportPeriod::defaultFor([], '2026-10-28'));
        $this->assertSame(['from' => '2026-01-01', 'to' => '2026-10-28', 'year' => null], ReportPeriod::defaultFor([$this->year('FY 2027', '2027-01-01', '2027-12-31')], '2026-10-28'), 'a year that has not started is ignored');
    }

    public function test_the_last_day_of_a_year_is_still_inside_it(): void
    {
        $years = [$this->year('FY 2026', '2026-01-01', '2026-12-31')];
        $this->assertSame('2026-12-31', ReportPeriod::defaultFor($years, '2026-12-31')['to']);
    }

    public function test_the_previous_period_of_whole_months_is_that_many_months_back(): void
    {
        $this->assertSame(['from' => '2026-02-01', 'to' => '2026-02-28'], ReportPeriod::previousPeriod('2026-03-01', '2026-03-31'));
        $this->assertSame(['from' => '2024-02-01', 'to' => '2024-02-29'], ReportPeriod::previousPeriod('2024-03-01', '2024-03-31'), 'a leap February');
        $this->assertSame(['from' => '2025-10-01', 'to' => '2025-12-31'], ReportPeriod::previousPeriod('2026-01-01', '2026-03-31'), 'a quarter');
        $this->assertSame(['from' => '2025-01-01', 'to' => '2025-12-31'], ReportPeriod::previousPeriod('2026-01-01', '2026-12-31'), 'a year');
        $this->assertSame(['from' => '2025-07-01', 'to' => '2026-06-30'], ReportPeriod::previousPeriod('2026-07-01', '2027-06-30'), 'a year from July');
    }

    public function test_any_other_period_moves_back_by_its_own_length(): void
    {
        $this->assertSame(['from' => '2026-02-28', 'to' => '2026-03-09'], ReportPeriod::previousPeriod('2026-03-10', '2026-03-19'));
        $this->assertSame(['from' => '2026-03-31', 'to' => '2026-03-31'], ReportPeriod::previousPeriod('2026-04-01', '2026-04-01'), 'one day');
        $p = ReportPeriod::previousPeriod('2026-01-01', '2026-10-28');   // 301 days; starts on the 1st but does not end on a month end
        $this->assertSame('2025-03-06', $p['from']);
        $this->assertSame('2025-12-31', $p['to']);
    }

    public function test_the_same_period_last_year(): void
    {
        $this->assertSame(['from' => '2025-01-01', 'to' => '2025-10-28'], ReportPeriod::sameLastYear('2026-01-01', '2026-10-28'));
        $this->assertSame(['from' => '2023-02-01', 'to' => '2023-02-28'], ReportPeriod::sameLastYear('2024-02-01', '2024-02-29'), '29 February becomes 28 February');
        $this->assertSame(['from' => '2024-02-01', 'to' => '2024-02-29'], ReportPeriod::sameLastYear('2025-02-01', '2025-02-28'), 'the last day of February stays the last day');
        $this->assertSame(['from' => '2025-04-01', 'to' => '2025-04-30'], ReportPeriod::sameLastYear('2026-04-01', '2026-04-30'));
    }

    public function test_compare_picks_the_rule_and_none_means_no_comparison(): void
    {
        $this->assertNull(ReportPeriod::compare('none', '2026-01-01', '2026-03-31'));
        $this->assertNull(ReportPeriod::compare('', '2026-01-01', '2026-03-31'));
        $this->assertSame(ReportPeriod::previousPeriod('2026-01-01', '2026-03-31'), ReportPeriod::compare('previous_period', '2026-01-01', '2026-03-31'));
        $this->assertSame(ReportPeriod::sameLastYear('2026-01-01', '2026-03-31'), ReportPeriod::compare('previous_year', '2026-01-01', '2026-03-31'));
        $this->assertSame(['none', 'previous_period', 'previous_year'], ReportPeriod::COMPARISONS);
    }

    public function test_an_as_of_date_is_compared_with_a_year_earlier_or_the_previous_period_end(): void
    {
        $this->assertSame('2025-10-28', ReportPeriod::compareDate('previous_year', '2026-10-28'));
        $this->assertSame('2023-02-28', ReportPeriod::compareDate('previous_year', '2024-02-29'));
        $this->assertSame('2026-09-30', ReportPeriod::compareDate('previous_period', '2026-10-31'), 'a month end goes to the previous month end');
        $this->assertSame('2026-02-28', ReportPeriod::compareDate('previous_period', '2026-03-31'));
        $this->assertSame('2024-02-29', ReportPeriod::compareDate('previous_period', '2024-03-31'), 'a leap February');
        $this->assertSame('2026-09-28', ReportPeriod::compareDate('previous_period', '2026-10-28'), 'any other day goes back a month');
        $this->assertSame('2026-02-28', ReportPeriod::compareDate('previous_period', '2026-03-30'), 'clamped to the shorter month');
        $this->assertSame('2025-12-15', ReportPeriod::compareDate('previous_period', '2026-01-15'), 'across a year end');
        $this->assertNull(ReportPeriod::compareDate('none', '2026-10-28'));
        $this->assertNull(ReportPeriod::compareDate('', '2026-10-28'));
    }

    public function test_bad_input_is_refused_not_guessed(): void
    {
        foreach ([
            fn () => ReportPeriod::compare('last_quarter', '2026-01-01', '2026-03-31'),
            fn () => ReportPeriod::previousPeriod('2026-03-31', '2026-03-01'),
            fn () => ReportPeriod::sameLastYear('2026-02-30', '2026-03-01'),
            fn () => ReportPeriod::defaultFor([], 'yesterday'),
            fn () => ReportPeriod::compareDate('last_quarter', '2026-10-28'),
        ] as $i => $call) {
            try {
                $call();
                $this->fail("case {$i} was accepted");
            } catch (InvalidArgumentException $e) {
                $this->assertNotSame('', $e->getMessage());
            }
        }
    }
}
