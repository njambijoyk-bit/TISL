<?php

namespace Tests\Unit;

use App\Models\TaxRate;
use PHPUnit\Framework\TestCase;

/**
 * The rate types that put a percentage and an amount per unit together (docs/TAX_CONTROL_PLAN.md, step T4): the excise cases a plain percentage or a plain
 * per-unit rate cannot say.
 */
class TaxRateMixedTypesTest extends TestCase
{
    private function rate(string $type, float $percent, float $perUnit, ?int $unit = 7): TaxRate
    {
        return new TaxRate(['rate_type' => $type, 'rate_value' => $percent, 'secondary_rate_value' => $perUnit, 'unit_of_measure_id' => $unit]);
    }

    public function test_combined_adds_the_percentage_and_the_per_unit_amount(): void
    {
        $this->assertEquals(100 + 2000, $this->rate('combined', 10, 20)->calculate(1000, 100), '10% of 1,000 plus 20 a litre for 100 litres');
        $this->assertSame('combined', $this->rate('combined', 10, 20)->rate_type);
    }

    public function test_higher_of_and_lower_of_pick_one(): void
    {
        $this->assertEquals(2000, $this->rate('higher_of', 10, 20)->calculate(1000, 100));
        $this->assertEquals(100, $this->rate('lower_of', 10, 20)->calculate(1000, 100));
        $this->assertEquals(500, $this->rate('higher_of', 50, 1)->calculate(1000, 3), 'the percentage wins when it is larger');
    }

    public function test_the_plain_types_are_unchanged(): void
    {
        $this->assertEquals(160, (new TaxRate(['rate_type' => 'percentage', 'rate_value' => 16]))->calculate(1000, 5));
        $this->assertEquals(100, (new TaxRate(['rate_type' => 'fixed_amount', 'rate_value' => 20, 'unit_of_measure_id' => 7]))->calculate(1000, 5));
    }

    public function test_a_mixed_rate_depends_on_the_quantity_like_a_per_unit_one(): void
    {
        $this->assertTrue($this->rate('combined', 10, 20)->isFixedPerUnit());
        $this->assertFalse($this->rate('combined', 10, 20, null)->isFixedPerUnit(), 'no unit, no quantity to record');
        $this->assertFalse((new TaxRate(['rate_type' => 'percentage', 'rate_value' => 16]))->isFixedPerUnit());
    }
}
