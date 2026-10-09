<?php

namespace Tests\Unit;

use App\Services\CostCentres\CostCentreService;
use App\Services\Departments\DepartmentService;
use PHPUnit\Framework\TestCase;

/** Shares in force on any date must total 100. */
class EmployeeCostCentreSharesTest extends TestCase
{
    private function problem(array $rows): ?string
    {
        return (new DepartmentService(new CostCentreService))->shareProblem($rows);
    }

    private const HOME = ['cost_centre_id' => 1, 'kind' => 'home'];

    public function test_one_open_ended_row_of_100_is_fine(): void
    {
        $this->assertNull($this->problem([self::HOME + ['share_percent' => 100]]));
    }

    public function test_a_project_split_for_some_dates_must_leave_the_total_at_100_throughout(): void
    {
        $ok = [
            self::HOME + ['share_percent' => 100, 'valid_from' => null, 'valid_to' => '2026-02-28'],
            self::HOME + ['share_percent' => 60, 'valid_from' => '2026-03-01', 'valid_to' => null],
            ['cost_centre_id' => 2, 'kind' => 'project', 'share_percent' => 40, 'valid_from' => '2026-03-01', 'valid_to' => null],
        ];
        $this->assertNull($this->problem($ok));

        // the project share stops on 30 June but nothing takes its 40% back
        $gap = [
            self::HOME + ['share_percent' => 60],
            ['cost_centre_id' => 2, 'kind' => 'project', 'share_percent' => 40, 'valid_from' => '2026-03-01', 'valid_to' => '2026-06-30'],
        ];
        $msg = $this->problem($gap);
        $this->assertNotNull($msg);
        $this->assertStringContainsString('60%', $msg);
    }

    public function test_more_than_100_is_refused(): void
    {
        $this->assertNotNull($this->problem([self::HOME + ['share_percent' => 70], ['cost_centre_id' => 2, 'kind' => 'project', 'share_percent' => 50]]));
    }

    public function test_less_than_100_is_refused(): void
    {
        $this->assertNotNull($this->problem([self::HOME + ['share_percent' => 99.5]]));
    }
}
