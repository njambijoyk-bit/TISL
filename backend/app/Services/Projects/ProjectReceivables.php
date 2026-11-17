<?php

namespace App\Services\Projects;

use App\Services\Books\Engine\Figures;

/**
 * What is still owed on a set of Books invoices, and how late, read from Books' receivables ageing (the same report finance reads). When the
 * books cannot answer, it answers nothing and nothing is guessed.
 */
class ProjectReceivables
{
    /** @param int[] $voucherIds @return array{owed: float, days_late: int}|null */
    public function open(array $voucherIds): ?array
    {
        if (! $voucherIds) {
            return ['owed' => 0.0, 'days_late' => 0];
        }
        try {
            $wanted = array_flip($voucherIds);
            $owed = 0.0;
            $late = 0;
            foreach (app(Figures::class)->ageing('receivables', now()->toDateString())['rows'] ?? [] as $row) {
                foreach ($row['bills'] ?? [] as $b) {
                    if (isset($wanted[(int) ($b['voucher_id'] ?? 0)])) {
                        $owed += (float) $b['open'];
                        $late = max($late, (int) ($b['days_late'] ?? 0));
                    }
                }
            }

            return ['owed' => round($owed, 2), 'days_late' => $owed > 0.005 ? $late : 0];
        } catch (\Throwable $e) {
            report($e);

            return null;
        }
    }
}
