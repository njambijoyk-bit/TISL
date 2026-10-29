<?php

namespace App\Services\Books\Engine;

use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Access\BranchFilter;
use App\Services\Books\Engine\Reports\AdjustedTrialBalanceReport;
use App\Services\Books\Engine\Reports\BalanceSheetReport;
use App\Services\Books\Engine\Reports\CashFlowReport;
use App\Services\Books\Engine\Reports\ChangesInEquityReport;
use App\Services\Books\Engine\Reports\PayablesAgeingReport;
use App\Services\Books\Engine\Reports\RatioAnalysisReport;
use App\Services\Books\Engine\Reports\ReceivablesAgeingReport;
use App\Services\Books\Engine\Reports\TaxReturnReport;
use App\Services\Books\Engine\Reports\MoneyFlowReport;
use App\Services\Books\Engine\Reports\StockJournalReport;
use App\Services\Books\Engine\Reports\StockItemMonthlyReport;
use App\Services\Books\Engine\Reports\StockItemMovementsReport;
use App\Services\Books\Engine\Reports\StockLocationSummaryReport;
use App\Services\Books\Engine\Reports\StockQueryReport;
use App\Services\Books\Engine\Reports\StockSummaryReport;
use App\Services\Books\Engine\Reports\TradeReport;
use App\Services\Books\Engine\Reports\WithholdingReport;
use App\Services\Books\Engine\Reports\DayBookReport;
use App\Services\Books\Engine\Reports\LedgerStatementReport;
use App\Services\Books\Engine\Reports\ProfitLossReport;
use App\Services\Books\Engine\Reports\TrialBalanceReport;
use App\Services\Books\ReportSettings;
use App\Services\Books\RestatedBase;
use InvalidArgumentException;

/**
 * Runs a report definition: works out the dates (the financial year when none are given), builds the scope, checks the person may run it, runs it
 * (and again over the comparison period when asked), and wraps the result with what every report shows the same way: the banners ("limited to your
 * branches", "filtered", "restated"), the display settings (decimals, units, negative style) and the dates it actually used.
 */
final class ReportEngine
{
    /** @var array<int, class-string<ReportDefinition>> */
    private const DEFINITIONS = [
        TrialBalanceReport::class,
        ProfitLossReport::class,
        BalanceSheetReport::class,
        ChangesInEquityReport::class,
        AdjustedTrialBalanceReport::class,
        DayBookReport::class,
        LedgerStatementReport::class,
        ReceivablesAgeingReport::class,
        PayablesAgeingReport::class,
        TaxReturnReport::class,
        WithholdingReport::class,
        RatioAnalysisReport::class,
        TradeReport::class,
        MoneyFlowReport::class,
        CashFlowReport::class,
        StockJournalReport::class,
        StockSummaryReport::class,
        StockLocationSummaryReport::class,
        StockQueryReport::class,
        StockItemMonthlyReport::class,
        StockItemMovementsReport::class,
    ];

    /** The display settings a screen needs to draw every amount the same way. */
    private const FORMAT_KEYS = ['decimals', 'units', 'negative_format', 'show_zero_balances', 'default_group_depth', 'report_header', 'report_footer', 'signatories'];

    /** @var array<string, ReportDefinition>|null */
    private ?array $registry = null;

    /** @return array<string, ReportDefinition> by key */
    public function definitions(): array
    {
        if ($this->registry === null) {
            $this->registry = [];
            foreach (self::DEFINITIONS as $class) {
                $d = new $class();
                $this->registry[$d->key()] = $d;
            }
        }

        return $this->registry;
    }

    /** Teach the engine another definition (used by tests, and by modules that bring their own reports). */
    public function register(ReportDefinition $definition): void
    {
        $this->definitions();
        $this->registry[$definition->key()] = $definition;
    }

    public function find(string $key): ReportDefinition
    {
        return $this->definitions()[$key] ?? abort(404, 'There is no such report.');
    }

    /** The reports this person may run. */
    public function catalogue(User $user): array
    {
        $access = app(Authorizer::class);
        $out = [];
        foreach ($this->definitions() as $d) {
            if ($access->allows($user, $d->permission())) {
                $out[] = ['key' => $d->key(), 'title' => $d->title(), 'kind' => $d->kind(), 'filters' => $d->filters(), 'supports_comparison' => $d->supportsComparison(), 'options' => $d->options()];
            }
        }

        return $out;
    }

    /**
     * @param  array<string, mixed>  $input  from, to, compare, cost_centre_id, location_id, and anything the report itself takes
     */
    public function run(string $key, array $input, User $user): array
    {
        $def = $this->find($key);
        abort_unless(app(Authorizer::class)->allows($user, $def->permission()), 403, 'You do not have the permission to run this report.');

        $scope = $this->scopeFor($def, $input);
        $data = $def->run($scope, $input);

        $compare = null;
        $mode = (string) ($input['compare'] ?? 'none');
        if ($mode !== 'none' && $mode !== '') {
            abort_unless($def->supportsComparison(), 422, 'This report cannot be compared with another period.');
            try {
                if ($def->kind() === 'asof') {   // one date: a year earlier, or the end of the previous period
                    $date = ReportPeriod::compareDate($mode, (string) $scope->to);
                    $other = ['from' => null, 'to' => $date];
                } else {
                    abort_unless($scope->from && $scope->to, 422, 'A comparison needs a period.');
                    $other = ReportPeriod::compare($mode, $scope->from, $scope->to);
                }
            } catch (InvalidArgumentException $e) {
                abort(422, $e->getMessage());
            }
            $compare = ['mode' => $mode, 'from' => $other['from'], 'to' => $other['to'], 'data' => $def->run($scope->between($other['from'], $other['to']), $input)];
        }

        return [
            'report' => ['key' => $def->key(), 'title' => $def->title(), 'kind' => $def->kind(), 'filters' => $def->filters(), 'supports_comparison' => $def->supportsComparison(), 'options' => $def->options()],
            'scope' => [
                'from' => $scope->from, 'to' => $scope->to, 'location_id' => $scope->locationId, 'cost_centre_id' => ! empty($input['cost_centre_id']) && in_array('cost_centre', $def->filters(), true) ? (int) $input['cost_centre_id'] : null,
                'default_period' => ReportPeriod::current(),
            ],
            'format' => $this->format(),
            'banners' => [
                'branch_limited' => app(BranchFilter::class)->enforcing($def->area(), $user),
                'filtered' => $scope->dimensional(),
                'restated_vouchers' => RestatedBase::restatedCount(),
            ],
            'data' => $data,
            'compare' => $compare,
        ];
    }

    /**
     * The report as an export table, and a file name for it.
     *
     * @return array{0: array, 1: string}
     */
    public function exportTable(string $key, array $input, User $user): array
    {
        $def = $this->find($key);
        abort_unless(app(Authorizer::class)->allows($user, $def->permission()), 403, 'You do not have the permission to run this report.');
        $scope = $this->scopeFor($def, $input);
        $input['_export'] = true;   // a file holds every row, not a page

        return [$def->table($def->run($scope, $input), $scope), $def->key()];
    }

    private function scopeFor(ReportDefinition $def, array $input): Scope
    {
        $default = ReportPeriod::current();
        if ($def->kind() === 'asof') {
            $from = null;
            $to = ! empty($input['to']) ? (string) $input['to'] : now()->toDateString();
        } else {
            $from = ! empty($input['from']) ? (string) $input['from'] : $default['from'];
            $to = ! empty($input['to']) ? (string) $input['to'] : ($from > $default['to'] ? $from : $default['to']);
        }
        abort_if($from !== null && $from > $to, 422, 'The start date is after the end date.');

        $offered = $def->filters();   // a filter the report does not offer is ignored, so the banners never claim a filter that was not applied

        return Scope::fromInput([
            'from' => $from, 'to' => $to,
            'cost_centre_id' => in_array('cost_centre', $offered, true) ? ($input['cost_centre_id'] ?? null) : null,
            'location_id' => in_array('branch', $offered, true) ? ($input['location_id'] ?? null) : null,
        ], $def->area());
    }

    private function format(): array
    {
        return array_intersect_key(app(ReportSettings::class)->values(), array_flip(self::FORMAT_KEYS));
    }
}
