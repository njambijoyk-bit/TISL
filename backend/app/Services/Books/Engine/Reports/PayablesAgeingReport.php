<?php

namespace App\Services\Books\Engine\Reports;

/** What we owe suppliers, by age, and what we prepaid them. See AgeingReport. */
final class PayablesAgeingReport extends AgeingReport
{
    public function key(): string
    {
        return 'payables-ageing';
    }

    public function title(): string
    {
        return 'Payables ageing';
    }

    protected function side(): string
    {
        return 'payables';
    }
}
