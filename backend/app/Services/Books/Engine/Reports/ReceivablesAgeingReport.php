<?php

namespace App\Services\Books\Engine\Reports;

/** What customers owe us, by age, and the credit we hold for them. See AgeingReport. */
final class ReceivablesAgeingReport extends AgeingReport
{
    public function key(): string
    {
        return 'receivables-ageing';
    }

    public function title(): string
    {
        return 'Receivables ageing';
    }

    protected function side(): string
    {
        return 'receivables';
    }
}
