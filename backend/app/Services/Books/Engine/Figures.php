<?php

namespace App\Services\Books\Engine;

use App\Services\Books\Engine\Reports\BalanceSheetReport;
use App\Services\Books\Engine\Reports\PayablesAgeingReport;
use App\Services\Books\Engine\Reports\ProfitLossReport;
use App\Services\Books\Engine\Reports\RatioAnalysisReport;
use App\Services\Books\Engine\Reports\ReceivablesAgeingReport;
use App\Services\Books\Engine\Reports\TrialBalanceReport;
use App\Services\Books\Engine\Reports\LedgerStatementReport;

/**
 * The report engine's figures for the parts of the system that are not report screens: the customer's own account, the dashboard, the insight packs, the exports.
 * They ask the same definitions the Reports screens run, so a figure shown anywhere is the figure in the report (docs/BOOKS_REPORTS_PLAN.md, step 12). Nothing here
 * works anything out; it only chooses the dates and the options.
 */
class Figures
{
    private function scope(?string $from, ?string $to, ?int $locationId = null): Scope
    {
        return Scope::fromInput(['from' => $from, 'to' => $to, 'location_id' => $locationId]);
    }

    /** Every line of one ledger's statement for a period (a customer's statement is never paged). */
    public function ledgerStatement(int $ledgerId, ?string $from, ?string $to): array
    {
        return (new LedgerStatementReport())->run($this->scope($from, $to), ['ledger_id' => $ledgerId, '_export' => true]);
    }

    /** What is owed to us ('receivables') or by us ('payables') on a date (today when none), for everyone or one ledger. */
    public function ageing(string $kind, ?string $asOf = null, ?int $ledgerId = null): array
    {
        $report = $kind === 'payables' ? new PayablesAgeingReport() : new ReceivablesAgeingReport();

        $r = $report->run($this->scope(null, $asOf ?: now()->toDateString()), $ledgerId ? ['ledger_id' => $ledgerId] : []);
        $notDue = $r['totals'][$r['buckets'][0]['key']] ?? 0.0;   // the first bucket is "not yet due"; everything else is late
        $r['totals']['overdue'] = round(($r['totals']['total'] ?? 0.0) - $notDue, 2);

        return $r;
    }

    public function profitLoss(?string $from, ?string $to): array
    {
        return (new ProfitLossReport())->run($this->scope($from, $to), []);
    }

    public function balanceSheet(?string $asOf): array
    {
        return (new BalanceSheetReport())->run($this->scope(null, $asOf), []);
    }

    public function trialBalance(?string $from, ?string $to, ?int $locationId = null): array
    {
        return (new TrialBalanceReport())->run($this->scope($from, $to, $locationId), []);
    }

    public function ratios(?string $from, ?string $to): array
    {
        return (new RatioAnalysisReport())->run($this->scope($from, $to), []);
    }
}
