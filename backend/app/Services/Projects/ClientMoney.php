<?php

namespace App\Services\Projects;

use App\Services\Books\Engine\Figures;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What clients owe, read from the books (docs/PROJECTS_STAGE3_SPEC.md, build 3.5). Projects holds no money: this asks Books for the receivables
 * ageing once and reads each client's ledger from it, so a list of clients costs one report, not one per row. When the books are not there or
 * cannot answer, it answers nothing, and nothing is guessed.
 */
class ClientMoney
{
    /** @param int[] $customerIds @return array<int, array{owed: float, overdue: float, days_late: int, currency: ?string}> customer id => what they owe */
    public function forMany(array $customerIds): array
    {
        if (! $customerIds || ! Schema::hasTable('ledgers') || ! Schema::hasColumn('ledgers', 'customer_id')) {
            return [];
        }
        try {
            $ledgers = DB::table('ledgers')->whereIn('customer_id', $customerIds)->pluck('customer_id', 'id');
            if ($ledgers->isEmpty()) {
                return [];
            }
            $ageing = app(Figures::class)->ageing('receivables', now()->toDateString(), $ledgers->count() === 1 ? (int) $ledgers->keys()->first() : null);
            $currency = $this->baseCurrency();
            $out = [];
            foreach ($ageing['rows'] ?? [] as $row) {
                $customer = $ledgers[$row['ledger_id']] ?? null;
                if ($customer === null) {
                    continue;
                }
                $over = array_filter($row['bills'] ?? [], fn ($b) => ($b['days_late'] ?? 0) > 0);
                $out[(int) $customer] = ['owed' => round((float) ($row['net'] ?? $row['total'] ?? 0), 2), 'overdue' => round(array_sum(array_column($over, 'open')), 2),
                    'days_late' => $over ? (int) max(array_column($over, 'days_late')) : 0, 'currency' => $currency];
            }

            return $out;
        } catch (\Throwable $e) {
            report($e);

            return [];
        }
    }

    /** @return array{owed: float, overdue: float, days_late: int, currency: ?string}|null */
    public function for(int $customerId): ?array
    {
        return $this->forMany([$customerId])[$customerId] ?? null;
    }

    private function baseCurrency(): ?string
    {
        try {
            return app(\App\Services\CurrencyConversionService::class)->getBaseCurrency()->code ?? null;
        } catch (\Throwable) {
            return null;
        }
    }
}
