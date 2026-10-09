<?php

namespace App\Services\Exchange;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\CompanyProfile;
use App\Models\User;
use App\Services\Access\BranchFilter;
use App\Services\Books\BooksReportService;
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
        2 => 'Books: adds vouchers and their entries',
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
        $reports = app(BooksReportService::class)->withDimensions(null, $locationId);
        $trial = $reports->trialBalance($from, $to);
        $profile = CompanyProfile::current();
        $base = app(CurrencyConversionService::class)->getBaseCurrency();

        $sections = [
            'groups' => $this->rows(DB::table('ledger_groups')->select($this->cols('ledger_groups', ['id', 'parent_id', 'name', 'nature', 'is_primary', 'affects_gross_profit', 'sort_order']))->orderBy('id'), 'chart of accounts'),
            'ledgers' => $this->rows(DB::table('ledgers')->select($this->cols('ledgers', ['id', 'group_id', 'name', 'code', 'opening_balance', 'opening_side', 'customer_id', 'supplier_id', 'is_active']))->orderBy('id'), 'chart of accounts'),
            'balances' => array_values(array_filter(array_map(fn ($r) => $r['ledger_id'] ? ['ledger_id' => $r['ledger_id'], 'opening' => $r['opening'], 'debit' => $r['debit'], 'credit' => $r['credit'], 'closing' => $r['closing']] : null, $trial['rows']))),
        ];

        if ($level >= 2) {
            $sections += $this->books($from, $to, $locationId);
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
                'tax_pin' => $profile->tax_pin, 'email' => $profile->email, 'phone' => $profile->phone, 'address' => $profile->address, 'city' => $profile->city, 'country' => $profile->country,
                'base_currency' => $base?->code, 'currency_symbol' => $base?->symbol],
            'period' => ['from' => $from, 'to' => $to], 'branch_id' => $locationId, 'branch_limited' => (bool) ($trial['branch_limited'] ?? false),
            'opening_balances_left_out' => (bool) ($trial['filtered'] ?? false),
            'counts' => array_map('count', $sections),
            'sections' => $sections,
        ];
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
            'supplier_invoice_no', 'narration', 'total_amount', 'base_total', 'source_voucher_id', 'due_date']));
        $vouchers = $this->rows($q->select($want)->addSelect('t.name as type', 't.base_type', 'c.code as currency')->orderBy('v.date')->orderBy('v.id'), 'vouchers');
        $ids = array_column($vouchers, 'id');
        $entries = [];
        foreach (array_chunk($ids, 5000) as $chunk) {
            $cols = array_map(fn ($c) => 'e.' . $c, $this->cols('voucher_entries', ['voucher_id', 'line_no', 'ledger_id', 'side', 'amount', 'base_amount', 'narration', 'cost_centre_id', 'location_id']));
            $entries = array_merge($entries, $this->rows(DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id')->where('v.status', Voucher::POSTED)->whereIn('e.voucher_id', $chunk)->select($cols)->orderBy('e.voucher_id')->orderBy('e.line_no'), 'entries'));
        }

        return [
            'vouchers' => $vouchers, 'entries' => $entries,
            'locations' => $this->rows(DB::table('locations')->select($this->cols('locations', ['id', 'name', 'code', 'kind', 'is_active']))->orderBy('id'), 'branches'),
            'cost_centres' => Schema::hasTable('cost_centres') ? $this->rows(DB::table('cost_centres')->select($this->cols('cost_centres', ['id', 'parent_id', 'location_id', 'name', 'code', 'type', 'purpose', 'is_active']))->orderBy('id'), 'cost centres') : [],
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
