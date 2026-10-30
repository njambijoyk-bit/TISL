<?php

namespace App\Services\Exchange;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\CompanyProfile;
use App\Models\User;
use App\Services\Access\BranchFilter;
use App\Services\CurrencyConversionService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * This company's books written out as a document for a .wnkjap file, at the depth the person chooses (docs/WNKJAP_FORMAT.md):
 *   1 Summary   company, chart of accounts, balances
 *   2 Books     adds the vouchers and their entries in the period, branches and cost centres
 *   3 Detail    adds voucher lines and taxes, open bill references, customers and suppliers
 *   4 Full      adds stock (items, options, on hand, batches), stock movements in the period, departments
 * Only reads. Whatever the exporting person is limited to (their branches) limits the export too.
 */
class WnkjapExport
{
    public const LEVELS = [
        1 => 'Summary: chart of accounts and balances',
        2 => 'Books: adds vouchers, their entries and the budgets',
        3 => 'Detail: adds voucher lines, customers and suppliers',
        4 => 'Full: adds stock and stock movements',
    ];

    /** Most rows one file may hold; a bigger export asks for a shorter period or a lower level (the other side opens it in a browser). */
    public const MAX_ROWS = 1500000;

    private int $rows = 0;

    private function cols(string $table, array $want): array
    {
        static $known = [];
        $have = $known[$table] ??= Schema::hasTable($table) ? Schema::getColumnListing($table) : [];

        return array_values(array_intersect($want, $have));
    }

    /** Rows as plain arrays with only the wanted columns that exist. */
    private function rows($query, string $label)
    {
        $out = $query->get()->map(fn ($r) => (array) $r)->all();
        $this->rows += count($out);
        if ($this->rows > self::MAX_ROWS) {
            throw new WnkjapException("That is more than a file can hold ({$label}). Choose a shorter period or a lower level.");
        }

        return $out;
    }

    private function number(?float $n): ?float
    {
        return $n === null ? null : round($n, 4);
    }

    /** @return array<string, mixed> the whole document */
    public function build(int $level, ?string $from, ?string $to, ?int $locationId, ?User $by): array
    {
        $level = max(1, min(4, $level));
        $this->rows = 0;
        $trial = app(\App\Services\Books\Engine\Figures::class)->trialBalance($from, $to, $locationId);
        $profile = CompanyProfile::current();
        $base = app(CurrencyConversionService::class)->getBaseCurrency();

        $sections = [
            'groups' => $this->rows(DB::table('ledger_groups')->select($this->cols('ledger_groups', ['id', 'parent_id', 'name', 'nature', 'is_primary', 'sort_order', 'statement_id']))->orderBy('id'), 'chart of accounts'),
            'ledgers' => $this->ledgers(),
            'statements' => $this->statements(),
            'balances' => array_values(array_filter(array_map(fn ($r) => $r['ledger_id'] ? ['ledger_id' => $r['ledger_id'], 'opening' => $r['opening'], 'debit' => $r['debit'], 'credit' => $r['credit'], 'closing' => $r['closing']] : null, $trial['rows']))),
        ];

        if ($level >= 2) {
            $sections += $this->books($from, $to, $locationId);
            $sections += $this->years();
            $sections += $this->budgets($from, $to, $locationId);
        }
        if ($level >= 3) {
            $sections += $this->detail($sections['vouchers'] ?? []);
        }
        if ($level >= 4) {
            $sections += $this->stock($from, $to, $locationId);
        }

        return [
            'format' => 'wnkjap', 'version' => 1, 'level' => $level, 'level_name' => self::LEVELS[$level], 'created_at' => now()->toIso8601String(),
            'exported_by' => $by?->name,
            'company' => ['id' => substr(hash('sha256', 'wnkjap-company|' . config('app.key')), 0, 32), 'name' => $profile->name, 'legal_name' => $profile->legal_name, 'short_code' => $profile->short_code,
                'tax_pin' => $profile->tax_pin, 'tax_country' => $profile->tax_country, 'tax_registrations' => $profile->tax_registrations ?: null, 'email' => $profile->email, 'phone' => $profile->phone, 'address' => $profile->address, 'city' => $profile->city, 'country' => $profile->country,
                'base_currency' => $base?->code, 'currency_symbol' => $base?->symbol],
            'period' => ['from' => $from, 'to' => $to], 'branch_id' => $locationId, 'branch_limited' => app(\App\Services\Access\BranchFilter::class)->enforcing('books'),
            'opening_balances_left_out' => (bool) ($trial['filtered'] ?? false),
            'counts' => array_map('count', $sections),
            'sections' => $sections,
        ];
    }

    /** The ledgers, each with the statement line it reports under (its own, else its group's), so the other side can draw the statements the way these books do. */
    private function ledgers(): array
    {
        $lines = [];
        foreach (app(\App\Services\Books\Engine\LedgerBalances::class)->ledgers() as $l) {
            $lines[(int) $l->id] = $l->statement_id ? (int) $l->statement_id : null;
        }
        $rows = $this->rows(DB::table('ledgers')->select($this->cols('ledgers', ['id', 'group_id', 'name', 'code', 'opening_balance', 'opening_side', 'customer_id', 'supplier_id', 'is_active']))->orderBy('id'), 'chart of accounts');
        if (! Schema::hasColumn('ledgers', 'statement_id')) {
            return $rows;
        }

        return array_map(fn ($r) => $r + ['statement_id' => $lines[(int) $r['id']] ?? null], $rows);
    }

    /** The statements tree (balance sheet and income statement lines). Empty until script 227 has been run. */
    private function statements(): array
    {
        if (! Schema::hasTable('statements')) {
            return [];
        }

        return $this->rows(DB::table('statements')->select($this->cols('statements', ['id', 'parent_id', 'code', 'name', 'kind', 'nature', 'normal_side', 'cash_flow_category', 'sort_order', 'is_active']))->orderBy('sort_order')->orderBy('id'), 'statement lines');
    }

    /** The financial years, and for each closed year what every ledger ended with and carried forward (the locked year-end close, script 232). */
    private function years(): array
    {
        $out = ['financial_years' => Schema::hasTable('financial_years')
            ? $this->rows(DB::table('financial_years')->select($this->cols('financial_years', ['id', 'name', 'start_date', 'end_date', 'is_closed']))->orderBy('start_date'), 'financial years') : []];
        if (\App\Services\Books\YearCloseService::ready()) {
            $out['year_balances'] = $this->rows(DB::table('ledger_year_balances as b')->join('year_closes as c', 'c.id', '=', 'b.year_close_id')->where('c.status', 'locked')
                ->select('b.financial_year_id', 'b.ledger_id', 'b.statement_id', 'b.closing_amount', 'b.carried_amount')->orderBy('b.financial_year_id')->orderBy('b.ledger_id'), 'closing balances');
        }

        return $out;
    }

    private function books(?string $from, ?string $to, ?int $locationId): array
    {
        $memo = VoucherType::where('base_type', VoucherType::MEMORANDUM)->pluck('id');
        $q = DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->leftJoin('currencies as c', 'c.id', '=', 'v.currency_id')
            ->whereNotIn('v.voucher_type_id', $memo)
            ->when($from, fn ($w) => $w->where('v.date', '>=', $from))->when($to, fn ($w) => $w->where('v.date', '<=', $to))
            ->when($locationId, fn ($w) => $w->where('v.location_id', $locationId));
        app(BranchFilter::class)->apply($q, 'v.location_id', 'books', 'export');
        $want = array_map(fn ($c) => 'v.' . $c, $this->cols('vouchers', ['id', 'voucher_number', 'date', 'status', 'location_id', 'cost_centre_id', 'party_ledger_id', 'customer_id', 'party_name', 'reference_no',
            'supplier_invoice_no', 'narration', 'total_amount', 'base_total', 'source_voucher_id', 'due_date', 'initiative_id']));
        $vouchers = $this->rows($q->select($want)->addSelect('t.name as type', 't.base_type', 'c.code as currency')->orderBy('v.date')->orderBy('v.id'), 'vouchers');
        $ids = array_column($vouchers, 'id');
        $entries = [];
        foreach (array_chunk($ids, 5000) as $chunk) {
            $cols = array_map(fn ($c) => 'e.' . $c, $this->cols('voucher_entries', ['voucher_id', 'line_no', 'ledger_id', 'side', 'amount', 'base_amount', 'narration', 'cost_centre_id', 'location_id', 'initiative_id']));
            $entries = array_merge($entries, $this->rows(DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id')->where('v.status', Voucher::POSTED)->whereIn('e.voucher_id', $chunk)->select($cols)->orderBy('e.voucher_id')->orderBy('e.line_no'), 'entries'));
        }

        return [
            'vouchers' => $vouchers, 'entries' => $entries,
            'locations' => $this->rows(DB::table('locations')->select($this->cols('locations', ['id', 'name', 'code', 'kind', 'is_active']))->orderBy('id'), 'branches'),
            'cost_centres' => Schema::hasTable('cost_centres') ? $this->rows(DB::table('cost_centres')->select($this->cols('cost_centres', ['id', 'parent_id', 'location_id', 'name', 'code', 'type', 'purpose', 'is_active']))->orderBy('id'), 'cost centres') : [],
        ];
    }

    /**
     * The budgets (database scripts 237 to 244): the initiatives, each budget with its versions and their status and dates (never who did what), the rows with what they are for and how
     * their months were filled, the amounts by month inside the period asked for, and the budget moves between rows. A branch-limited export, or one for a branch, carries only the rows
     * for that branch (and, for a limited person, the company-wide ones, as with vouchers). Nothing here is written to a viewer's system: it is read from the file in the page.
     *
     * @return array<string, array<int, array<string, mixed>>>
     */
    private function budgets(?string $from, ?string $to, ?int $locationId): array
    {
        if (! \App\Services\Books\BudgetService::ready()) {
            return [];
        }
        $svc = app(\App\Services\Books\BudgetService::class);
        $rowsQ = DB::table('budget_rows')->when($locationId, fn ($w) => $w->where('location_id', $locationId))->orderBy('version_id')->orderBy('id');
        app(BranchFilter::class)->apply($rowsQ, 'location_id', 'books', 'export');
        $rows = $rowsQ->get();
        $filtered = $locationId !== null || app(BranchFilter::class)->enforcing('books');
        $versionIds = $rows->pluck('version_id')->unique()->all();
        $versions = DB::table('budget_versions')->when($filtered, fn ($w) => $w->whereIn('id', $versionIds ?: [0]))->orderBy('id')->get();
        $budgets = DB::table('budgets')->where('is_active', 1)->when($filtered, fn ($w) => $w->whereIn('id', $versions->pluck('budget_id')->all() ?: [0]))->orderBy('from_month')->orderBy('id')->get();
        $rowIds = $rows->pluck('id')->all();
        $lines = [];
        foreach (array_chunk($rowIds, 2000) as $chunk) {
            $lines = array_merge($lines, $this->rows(DB::table('budget_lines')->whereIn('row_id', $chunk)->when($from, fn ($w) => $w->where('period', '>=', substr($from, 0, 7)))->when($to, fn ($w) => $w->where('period', '<=', substr($to, 0, 7)))
                ->orderBy('row_id')->orderBy('period')->select(['row_id', 'period', 'amount']), 'budget amounts'));
        }
        $lines = array_map(fn ($l) => ['row_id' => (int) $l['row_id'], 'period' => $l['period'], 'amount' => $this->number((float) $l['amount'])], $lines);
        $names = ['group' => DB::table('ledger_groups')->pluck('name', 'id'), 'ledger' => DB::table('ledgers')->pluck('name', 'id')];
        $current = [];
        foreach ($budgets as $b) {
            $current[(int) $b->id] = $svc->currentVersion((int) $b->id);
        }

        return [
            'initiatives' => Schema::hasTable('budget_initiatives') ? $this->rows(DB::table('budget_initiatives')->select($this->cols('budget_initiatives', ['id', 'parent_id', 'code', 'name', 'is_active']))->orderBy('id'), 'initiatives') : [],
            'budgets' => $budgets->map(fn ($b) => ['id' => (int) $b->id, 'name' => $b->name, 'type' => $b->budget_type, 'from_month' => $b->from_month, 'to_month' => $b->to_month, 'current_version_id' => $current[(int) $b->id] ?? null])->all(),
            'budget_versions' => $versions->map(fn ($v) => ['id' => (int) $v->id, 'budget_id' => (int) $v->budget_id, 'name' => $v->name, 'kind' => $v->kind, 'status' => $v->status, 'copied_from_id' => $v->copied_from_id ? (int) $v->copied_from_id : null,
                'note' => $v->note, 'submitted_at' => $v->submitted_at, 'approved_at' => $v->approved_at, 'locked_at' => $v->locked_at])->all(),
            'budget_rows' => $rows->map(fn ($r) => ['id' => (int) $r->id, 'version_id' => (int) $r->version_id, 'target_type' => $r->target_type, 'target_id' => (int) $r->target_id, 'target_name' => $names[$r->target_type][$r->target_id] ?? null,
                'cost_centre_id' => $r->cost_centre_id ? (int) $r->cost_centre_id : null, 'department_id' => $r->department_id ? (int) $r->department_id : null, 'location_id' => $r->location_id ? (int) $r->location_id : null,
                'initiative_id' => $r->initiative_id ? (int) $r->initiative_id : null, 'is_recovery' => (bool) $r->is_recovery, 'method' => $r->method, 'note' => $r->note])->all(),
            'budget_lines' => $lines,
            'budget_transfers' => Schema::hasTable('budget_transfers') ? array_map(fn ($t) => ['amount' => $this->number((float) $t['amount'])] + $t, $this->rows(DB::table('budget_transfers')->whereIn('from_row_id', $rowIds ?: [0])->whereIn('to_row_id', $rowIds ?: [0])->where('status', '!=', 'withdrawn')
                ->select($this->cols('budget_transfers', ['id', 'version_id', 'from_row_id', 'to_row_id', 'period', 'amount', 'status', 'note', 'decision_note', 'decided_at']))->orderBy('id'), 'budget transfers')) : [],
        ];
    }

    private function detail(array $vouchers): array
    {
        $ids = array_column($vouchers, 'id');
        $items = [];
        $taxes = [];
        $bills = [];
        foreach (array_chunk($ids, 5000) as $chunk) {
            $items = array_merge($items, $this->rows(DB::table('voucher_items')->whereIn('voucher_id', $chunk)->where('is_header', 0)
                ->select($this->cols('voucher_items', ['id', 'voucher_id', 'parent_item_id', 'line_no', 'item_type', 'variant_id', 'description', 'variant_label', 'sku', 'unit_code', 'quantity', 'rate', 'discount_amount',
                    'amount', 'tax_rate_percent', 'tax_amount', 'ledger_id', 'location_id', 'delivered_quantity', 'invoiced_quantity']))->orderBy('voucher_id')->orderBy('line_no'), 'voucher lines'));
            $taxes = array_merge($taxes, $this->rows(DB::table('voucher_item_taxes as x')->join('voucher_items as i', 'i.id', '=', 'x.item_id')->whereIn('i.voucher_id', $chunk)
                ->select('i.voucher_id', 'x.label', 'x.ledger_id')->selectRaw('SUM(x.base_amount) AS base_amount, SUM(x.tax_amount) AS tax_amount')->groupBy('i.voucher_id', 'x.label', 'x.ledger_id'), 'taxes'));
            $bills = array_merge($bills, $this->rows(DB::table('voucher_bill_refs')->whereIn('voucher_id', $chunk)
                ->select($this->cols('voucher_bill_refs', ['voucher_id', 'ledger_id', 'ref_type', 'ref_name', 'against_voucher_id', 'amount', 'due_date'])), 'bill references'));
        }
        $customers = $this->rows(DB::table('customers')->select($this->cols('customers', ['id', 'customer_number', 'first_name', 'last_name', 'company_name', 'email', 'phone', 'tax_id', 'created_at']))->orderBy('id'), 'customers');
        $suppliers = $this->rows(DB::table('vendors')->select($this->cols('vendors', ['id', 'vendor_number', 'company_name', 'contact_name', 'email', 'phone', 'tax_id', 'city', 'created_at']))->orderBy('id'), 'suppliers');

        return ['voucher_items' => $items, 'voucher_taxes' => $taxes, 'bill_refs' => $bills, 'customers' => $customers, 'suppliers' => $suppliers];
    }

    private function stock(?string $from, ?string $to, ?int $locationId): array
    {
        $out = [
            'products' => $this->rows(DB::table('products')->select($this->cols('products', ['id', 'sku', 'name', 'price', 'type', 'category_id', 'brand_id']))->orderBy('id'), 'products'),
            'variants' => $this->rows(DB::table('product_variants')->select($this->cols('product_variants', ['id', 'product_id', 'sku', 'name', 'barcode', 'status']))->orderBy('id'), 'product options'),
            'stock' => $this->rows(DB::table('variant_location_stock')->select($this->cols('variant_location_stock', ['product_variant_id', 'location_id', 'quantity', 'reorder_level']))
                ->when($locationId, fn ($q) => $q->where('location_id', $locationId)), 'stock'),
        ];
        if (Schema::hasTable('stock_batches')) {
            $out['batches'] = $this->rows(DB::table('stock_batches')->select($this->cols('stock_batches', ['id', 'variant_id', 'batch_no', 'mfg_date', 'expiry_date', 'unit_cost', 'received_at', 'status']))->orderBy('id'), 'batches');
            $out['batch_balances'] = $this->rows(DB::table('stock_batch_balances')->select($this->cols('stock_batch_balances', ['batch_id', 'location_id', 'quantity']))->when($locationId, fn ($q) => $q->where('location_id', $locationId)), 'batch balances');
        }
        if (Schema::hasTable('stock_movements')) {
            $out['movements'] = $this->rows(DB::table('stock_movements')->select($this->cols('stock_movements', ['id', 'voucher_id', 'variant_id', 'location_id', 'quantity', 'movement_type', 'movement_date', 'unit_cost', 'batch_id', 'reversed']))
                ->when($from, fn ($q) => $q->where('movement_date', '>=', $from))->when($to, fn ($q) => $q->where('movement_date', '<=', $to))
                ->when($locationId, fn ($q) => $q->where('location_id', $locationId))->orderBy('movement_date')->orderBy('id'), 'stock movements');
        }
        if (Schema::hasTable('departments')) {
            $out['departments'] = $this->rows(DB::table('departments')->select($this->cols('departments', ['id', 'location_id', 'name', 'code', 'cost_centre_id', 'is_active'])), 'departments');
        }

        return $out;
    }

    /** The finished file's bytes. */
    public function file(int $level, ?string $from, ?string $to, ?int $locationId, string $password, ?User $by): string
    {
        return Wnkjap::seal(json_encode($this->build($level, $from, $to, $locationId, $by), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR), $password);
    }
}
