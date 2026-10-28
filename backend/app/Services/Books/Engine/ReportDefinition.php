<?php

namespace App\Services\Books\Engine;

/**
 * A report on the engine. It says what it is called, who may run it, over what kind of dates, and how to work it out; the engine adds the dates,
 * the filters, the banners, the display settings and the export around it, the same way for every report.
 */
abstract class ReportDefinition
{
    /** The report's key in the address (lower case, hyphens). */
    abstract public function key(): string;

    abstract public function title(): string;

    /** 'range' (from and to) or 'asof' (one date). */
    public function kind(): string
    {
        return 'range';
    }

    /** The permission needed to run it. Each report names its own, so a stock report can need stock.view and a books report books.view. */
    public function permission(): string
    {
        return 'books.view';
    }

    /** Which branch-limit area applies to it (books, stock). */
    public function area(): string
    {
        return 'books';
    }

    /** Can the engine run it twice, over the period and over the one it is compared with? */
    public function supportsComparison(): bool
    {
        return false;
    }

    /** Which dimension filters the screen offers for it: any of 'branch', 'cost_centre'. */
    public function filters(): array
    {
        return ['branch', 'cost_centre'];
    }

    /**
     * Choices the screen offers besides the dates, drawn as drop-downs and sent back with the request: a list of
     * ['key' => ..., 'label' => ..., 'choices' => [value => label], 'default' => value].
     */
    public function options(): array
    {
        return [];
    }

    /**
     * Work the report out. The scope carries the dates (a range report has both; an as-of report has `to`) and the filters.
     *
     * @param  array<string, mixed>  $options  anything else the screen sent (a ledger id, a switch)
     */
    abstract public function run(Scope $scope, array $options): array;

    /**
     * The report as a flat table for the export: title, subtitle, columns (key => label), rows, and optionally a totals row.
     *
     * @param  array<string, mixed>  $data  what run() returned
     */
    abstract public function table(array $data, Scope $scope): array;

    /** The subtitle under the title in the export and on paper. */
    protected function period(Scope $scope): string
    {
        return $this->kind() === 'asof' ? 'As of ' . ($scope->to ?? 'today') : trim(($scope->from ?? 'start') . ' to ' . ($scope->to ?? 'today'));
    }
}
