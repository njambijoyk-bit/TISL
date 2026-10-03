<?php

namespace App\Services\Insight;

use App\Models\Books\FinancialYear;
use Carbon\Carbon;

/** How far back an insight looks: 30 / 60 / 90 days, 6 months, 1 year, or the current financial year. Never more than a year. */
class Lookback
{
    public const CHOICES = ['30' => '30 days', '60' => '60 days', '90' => '90 days', '180' => '6 months', '365' => '1 year', 'fy' => 'This financial year'];
    public const DEFAULT = '90';

    private function __construct(public readonly string $key, public readonly Carbon $from, public readonly Carbon $to) {}

    public static function make(?string $key = null): self
    {
        $key = isset(self::CHOICES[(string) $key]) ? (string) $key : self::DEFAULT;
        $to = Carbon::today();
        if ($key === 'fy') {
            $fy = FinancialYear::containing($to->toDateString());
            $from = $fy ? Carbon::parse($fy->start_date) : $to->copy()->startOfYear();
            if ($from->lt($to->copy()->subDays(365))) {
                $from = $to->copy()->subDays(365);   // capped at a year
            }

            return new self($key, $from->startOfDay(), $to);
        }

        return new self($key, $to->copy()->subDays((int) $key)->startOfDay(), $to);
    }

    public function label(): string
    {
        return self::CHOICES[$this->key] . ' (' . $this->from->toDateString() . ' to ' . $this->to->toDateString() . ')';
    }
}
