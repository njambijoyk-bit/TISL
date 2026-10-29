<?php

namespace App\Services\Books;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Which section of the cash flow statement a statement line belongs to (docs/BOOKS_REPORTS_PLAN.md, step 8). A row of the statements tree may carry its own
 * category (statements.cash_flow_category, set in the statements editor); a row without one takes its parent's, and failing that the default for its code.
 *
 *   operating   day-to-day trading: receivables, stock, payables, taxes, and every income and expense line
 *   investing   non-current assets (property and equipment, investments)
 *   financing   capital, reserves, loans and borrowings
 *   non_cash    left out of the balance sheet changes, with its income-statement side added back (depreciation and its accumulated depreciation)
 */
final class CashFlowCategories
{
    public const ALL = ['operating' => 'Operating', 'investing' => 'Investing', 'financing' => 'Financing', 'non_cash' => 'Non-cash'];

    /** Defaults by code prefix, the longest match wins. */
    private const DEFAULTS = ['BS.A.NC' => 'investing', 'BS.A' => 'operating', 'BS.L.NC' => 'financing', 'BS.L.C.BORR' => 'financing', 'BS.L' => 'operating', 'BS.E' => 'financing', 'IS' => 'operating'];

    /** @var array<int, object> */
    private array $rows = [];

    public function __construct()
    {
        if (Schema::hasTable('statements')) {
            $this->rows = DB::table('statements')->get()->keyBy('id')->all();
        }
    }

    public static function defaultFor(?string $code): string
    {
        $best = 'operating';
        $len = -1;
        foreach (self::DEFAULTS as $prefix => $cat) {
            if ($code !== null && ($code === $prefix || str_starts_with($code, $prefix . '.')) && strlen($prefix) > $len) {
                $best = $cat;
                $len = strlen($prefix);
            }
        }

        return $best;
    }

    /** The category a statement row counts in: its own, its nearest ancestor's, or the default for its code. */
    public function of(?int $statementId): string
    {
        $node = $statementId ? ($this->rows[$statementId] ?? null) : null;
        $code = $node?->code;
        for ($guard = 0; $node && $guard < 20; $guard++) {
            $own = $node->cash_flow_category ?? null;
            if ($own && isset(self::ALL[$own])) {
                return $own;
            }
            $node = $node->parent_id ? ($this->rows[(int) $node->parent_id] ?? null) : null;
        }

        return self::defaultFor($code);
    }
}
