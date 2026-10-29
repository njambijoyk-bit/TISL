<?php

namespace Tests\Feature\Concerns;

use App\Services\Access\BranchFilter;
use App\Services\CostCentres\CostCentreService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A small set of books for the report engine's tests: a chart of accounts like the real one (groups, statement lines), ledgers with opening balances that
 * do not balance, and vouchers in two currencies (one that needs restating), with a draft, one before the financial year, and entries split across
 * branches and cost centres. "Now" is 28 October 2026 and the financial year is the calendar year 2026.
 *
 * Groups: 1 Capital Account, 2 Current Liabilities, 3 Current Assets, 4 Bank Accounts, 5 Sundry Debtors, 6 Sales Accounts, 7 Purchase Accounts, 8 Indirect Expenses, 9 Indirect Incomes,
 * 10 Sundry Creditors (under Current Liabilities), 11 Other Receipts (no statement line; Current Liabilities has none either, so Supplier is "not on a statement line").
 * Ledgers: 1 Cash, 2 M-Pesa, 3 Customer A, 4 Sales, 5 Purchases, 6 Rent (opening 1,000 Dr), 7 Capital, 8 Supplier, 9 Interest income, 10 Trade Creditor, 11 Misc income, 12 Bank charges (on Finance costs).
 * Statement lines: 4 Cash and bank, 5 Trade receivables, 6 Other current assets, 7 Owner capital, 9 Revenue, 10 Cost of sales, 11 Operating expenses, 12 Finance costs, 16 Trade payables, 17 Other income,
 * 18 Finance income, 19 Income tax, 20 Reserves; headings 13 Equity, 14 Liabilities, 15 Current liabilities.
 */
trait CreatesBooksLedgerWorld
{
    /** The branch ids the fake branch filter limits to (null: no limit). */
    public ?array $limitedTo = null;

    protected function createBooksLedgerWorld(): void
    {
        Carbon::setTestNow('2026-10-28 12:00:00');
        \App\Services\Books\Engine\LedgerBalances::forget();

        foreach (['payment_attempts', 'voucher_tenders', 'payment_methods', 'voucher_instruments', 'voucher_entries', 'vouchers', 'voucher_types', 'cost_centres', 'financial_years', 'ledgers', 'ledger_groups', 'statements', 'currencies'] as $table) {
            Schema::dropIfExists($table);   // a real database keeps its tables between tests (the in-memory one starts empty)
        }
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code'); $t->string('name')->nullable(); $t->boolean('is_base')->default(false); $t->decimal('conversion_rate', 18, 8)->default(1); $t->timestamps(); });
        Schema::create('statements', function ($t) {
            $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('code')->unique(); $t->string('name'); $t->string('kind')->default('line'); $t->string('nature')->nullable();
            $t->string('normal_side', 1)->nullable(); $t->string('cash_flow_category')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_system')->default(0); $t->boolean('is_active')->default(1); $t->timestamps();
        });
        Schema::create('ledger_groups', function ($t) {
            $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->string('nature'); $t->boolean('is_primary')->default(0); $t->boolean('is_system')->default(0);
            $t->boolean('affects_gross_profit')->default(0); $t->integer('sort_order')->default(0); $t->string('behaviour')->default('standard'); $t->text('settings')->nullable(); $t->unsignedBigInteger('statement_id')->nullable(); $t->timestamps();
        });
        Schema::create('ledgers', function ($t) {
            $t->id(); $t->unsignedBigInteger('group_id'); $t->string('name'); $t->string('code')->nullable(); $t->decimal('opening_balance', 15, 2)->default(0); $t->string('opening_side', 1)->default('D');
            $t->boolean('is_system')->default(0); $t->boolean('is_active')->default(1); $t->unsignedBigInteger('statement_id')->nullable(); $t->string('bank_name')->nullable(); $t->string('account_number')->nullable();
            $t->string('mobile_kind')->nullable(); $t->string('cash_kind')->nullable(); $t->text('notes')->nullable(); $t->timestamps();
        });
        Schema::create('financial_years', function ($t) { $t->id(); $t->string('name'); $t->date('start_date'); $t->date('end_date'); $t->boolean('is_closed')->default(0); $t->unsignedBigInteger('closed_by')->nullable(); $t->timestamp('closed_at')->nullable(); $t->timestamps(); });
        Schema::create('cost_centres', function ($t) { $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->timestamps(); });
        Schema::create('vouchers', function ($t) {
            $t->id(); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('voucher_number'); $t->date('date'); $t->string('status')->default('posted'); $t->unsignedBigInteger('location_id')->nullable();
            $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->decimal('exchange_rate', 18, 8)->default(1); $t->decimal('total_amount', 15, 2)->default(0);
            $t->decimal('base_total', 15, 2)->default(0); $t->string('reference_no')->nullable(); $t->string('supplier_invoice_no')->nullable(); $t->unsignedBigInteger('party_ledger_id')->nullable(); $t->text('narration')->nullable(); $t->text('meta')->nullable(); $t->timestamps();
        });
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('code'); $t->string('name'); $t->string('base_type'); $t->timestamps(); });
        Schema::create('voucher_entries', function ($t) {
            $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('ledger_id'); $t->string('side', 1); $t->decimal('amount', 15, 2); $t->decimal('base_amount', 15, 2);
            $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->unsignedBigInteger('location_id')->nullable(); $t->integer('line_no')->default(1); $t->text('narration')->nullable();
        });
        Schema::create('voucher_instruments', function ($t) {
            $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('ledger_id')->nullable(); $t->string('direction')->nullable(); $t->string('type')->nullable(); $t->string('number')->nullable();
            $t->date('instrument_date')->nullable(); $t->string('bank_name')->nullable(); $t->string('deposited_by')->nullable(); $t->string('reference')->nullable(); $t->decimal('amount', 15, 2)->default(0);
            $t->string('status')->nullable(); $t->timestamp('status_at')->nullable(); $t->date('deposited_on')->nullable(); $t->date('cleared_on')->nullable();
        });
        Schema::create('payment_methods', function ($t) { $t->id(); $t->string('name'); $t->string('kind')->default('cash'); $t->unsignedBigInteger('ledger_id')->nullable(); $t->boolean('is_active')->default(true); });
        Schema::create('voucher_tenders', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('payment_method_id')->nullable(); $t->decimal('amount', 15, 2)->default(0); $t->string('reference')->nullable(); $t->unsignedBigInteger('gift_voucher_id')->nullable(); $t->decimal('gift_amount', 15, 2)->nullable(); $t->timestamp('created_at')->nullable(); });
        Schema::create('payment_attempts', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id')->nullable(); $t->unsignedBigInteger('settled_voucher_id')->nullable(); $t->string('status')->default('pending'); $t->string('receipt_number')->nullable(); });

        $now = now();
        DB::table('currencies')->insert([['id' => 1, 'code' => 'KES', 'is_base' => 1, 'conversion_rate' => 1, 'created_at' => $now, 'updated_at' => $now], ['id' => 2, 'code' => 'USD', 'is_base' => 0, 'conversion_rate' => 130, 'created_at' => $now, 'updated_at' => $now]]);
        DB::table('financial_years')->insert(['name' => 'FY 2026', 'start_date' => '2026-01-01', 'end_date' => '2026-12-31', 'created_at' => $now, 'updated_at' => $now]);
        DB::table('cost_centres')->insert([['id' => 10, 'parent_id' => null, 'name' => 'Head office', 'created_at' => $now, 'updated_at' => $now], ['id' => 11, 'parent_id' => 10, 'name' => 'Admin', 'created_at' => $now, 'updated_at' => $now]]);

        foreach ([
            [1, null, 'BS', 'Balance sheet', 'heading', null], [2, 1, 'BS.A', 'Assets', 'heading', null], [3, 2, 'BS.A.C', 'Current assets', 'heading', null], [4, 3, 'BS.A.C.CASH', 'Cash and bank', 'line', 'asset'],
            [5, 3, 'BS.A.C.REC', 'Trade receivables', 'line', 'asset'], [6, 3, 'BS.A.C.OTH', 'Other current assets', 'line', 'asset'], [7, 13, 'BS.E.CAP', 'Owner or share capital', 'line', 'liability'],
            [8, null, 'IS', 'Income statement', 'heading', null], [9, 8, 'IS.REV', 'Revenue', 'line', 'income'], [10, 8, 'IS.COGS', 'Cost of sales', 'line', 'expense'], [11, 8, 'IS.OPEX', 'Operating expenses', 'line', 'expense'],
            [12, 8, 'IS.FINCOST', 'Finance costs', 'line', 'expense'], [13, 1, 'BS.E', 'Equity', 'heading', null], [14, 1, 'BS.L', 'Liabilities', 'heading', null], [15, 14, 'BS.L.C', 'Current liabilities', 'heading', null],
            [16, 15, 'BS.L.C.PAY', 'Trade payables', 'line', 'liability'], [17, 8, 'IS.OTHINC', 'Other income', 'line', 'income'], [18, 8, 'IS.FININC', 'Finance income', 'line', 'income'], [19, 8, 'IS.TAX', 'Income tax', 'line', 'expense'],
            [20, 13, 'BS.E.RES', 'Reserves and retained earnings', 'line', 'liability'],
        ] as [$id, $parent, $code, $name, $kind, $nature]) {
            DB::table('statements')->insert(['id' => $id, 'parent_id' => $parent, 'code' => $code, 'name' => $name, 'kind' => $kind, 'nature' => $nature, 'normal_side' => $nature ? (in_array($nature, ['asset', 'expense']) ? 'D' : 'C') : null, 'is_system' => 1, 'created_at' => $now, 'updated_at' => $now]);
        }
        foreach ([
            [1, null, 'Capital Account', 'liability', 0, 7, 'standard'], [2, null, 'Current Liabilities', 'liability', 0, null, 'standard'], [3, null, 'Current Assets', 'asset', 0, 6, 'standard'],
            [4, 3, 'Bank Accounts', 'asset', 0, 4, 'bank'], [5, 3, 'Sundry Debtors', 'asset', 0, 5, 'party'], [6, null, 'Sales Accounts', 'income', 1, 9, 'sales'], [7, null, 'Purchase Accounts', 'expense', 1, 10, 'purchase'],
            [8, null, 'Indirect Expenses', 'expense', 0, 11, 'standard'], [9, null, 'Indirect Incomes', 'income', 0, 17, 'standard'], [10, 2, 'Sundry Creditors', 'liability', 0, 16, 'party'],
            [11, null, 'Other Receipts', 'income', 0, null, 'standard'],   // no statement line: its ledgers are "not on a statement line"
        ] as [$id, $parent, $name, $nature, $gp, $line, $behaviour]) {
            DB::table('ledger_groups')->insert(['id' => $id, 'parent_id' => $parent, 'name' => $name, 'nature' => $nature, 'is_primary' => $parent ? 0 : 1, 'affects_gross_profit' => $gp, 'statement_id' => $line, 'behaviour' => $behaviour, 'sort_order' => $id, 'created_at' => $now, 'updated_at' => $now]);
        }
        foreach ([
            [1, 4, 'Cash', 50000, 'D'], [2, 4, 'M-Pesa', 0, 'D'], [3, 5, 'Customer A', 0, 'D'], [4, 6, 'Sales', 0, 'D'], [5, 7, 'Purchases', 0, 'D'], [6, 8, 'Rent', 1000, 'D'], [7, 1, 'Capital', 30000, 'C'], [8, 2, 'Supplier', 0, 'D'],
            [9, 9, 'Interest income', 0, 'D'], [10, 10, 'Trade Creditor', 0, 'D'], [11, 11, 'Misc income', 0, 'D'], [12, 8, 'Bank charges', 0, 'D'],
        ] as [$id, $group, $name, $open, $side]) {
            DB::table('ledgers')->insert(['id' => $id, 'group_id' => $group, 'name' => $name, 'opening_balance' => $open, 'opening_side' => $side, 'statement_id' => DB::table('ledger_groups')->where('id', $group)->value('statement_id'), 'created_at' => $now, 'updated_at' => $now]);
        }

        DB::table('ledgers')->where('id', 12)->update(['statement_id' => 12]);

        DB::table('voucher_types')->insert([['id' => 1, 'code' => 'JV', 'name' => 'Journal', 'base_type' => 'journal'], ['id' => 2, 'code' => 'SI', 'name' => 'Sales invoice', 'base_type' => 'sales'], ['id' => 3, 'code' => 'MEMO', 'name' => 'Memorandum', 'base_type' => 'memorandum']]);

        // [number, date, status, currency, total, base_total, location, cost centre, [[ledger, side, amount, base, entry cost centre, entry location], ...]]
        foreach ([
            ['V1', '2026-01-10', 'posted', 1, 100000, 100000, 1, 10, [[1, 'D', 100000, 100000, 10, 1], [4, 'C', 100000, 100000, 10, 1]]],
            ['V2', '2026-02-15', 'posted', 1, 40000, 40000, 2, 11, [[5, 'D', 40000, 40000, 11, 2], [1, 'C', 40000, 40000, 11, 2]]],
            ['V3', '2026-03-01', 'posted', 2, 1000, 130000, 1, 10, [[3, 'D', 1000, 130000, 10, 1], [4, 'C', 1000, 130000, 10, 1]]],         // dollars at today's rate: trusted as posted
            ['V4', '2026-04-05', 'posted', 2, 500, 500, 1, 10, [[1, 'D', 500, 500, 10, 1], [4, 'C', 500, 500, 10, 1]]],                       // posted when the base was dollars: restated at 130
            ['V5', '2025-12-20', 'posted', 1, 5000, 5000, 1, 10, [[6, 'D', 5000, 5000, 10, 1], [1, 'C', 5000, 5000, 10, 1]]],                  // before the financial year
            ['V6', '2026-05-01', 'draft', 1, 999, 999, 1, 10, [[6, 'D', 999, 999, 10, 1], [1, 'C', 999, 999, 10, 1]]],                         // a draft: never counted
            ['V7', '2026-06-01', 'posted', 1, 12000, 12000, null, null, [[6, 'D', 12000, 12000, null, null], [8, 'C', 12000, 12000, null, null]]],   // no branch, no cost centre
            ['V8', '2026-07-01', 'posted', 1, 7000, 7000, 1, 10, [[6, 'D', 3000, 3000, 10, 1], [6, 'D', 4000, 4000, 11, 1], [2, 'C', 7000, 7000, 10, 1]]],   // one voucher split across two cost centres
            ['V9', '2026-08-01', 'posted', 1, 2000, 2000, 1, 10, [[1, 'D', 2000, 2000, 10, 1], [9, 'C', 2000, 2000, 10, 1]]],
            ['V10', '2026-09-01', 'posted', 1, 5000, 5000, 1, 10, [[5, 'D', 5000, 5000, 10, 1], [10, 'C', 5000, 5000, 10, 1]]],
            ['V11', '2026-09-15', 'posted', 1, 800, 800, 2, 11, [[1, 'D', 800, 800, 11, 2], [11, 'C', 800, 800, 11, 2]]],
            ['V12', '2026-10-01', 'posted', 1, 300, 300, 1, 10, [[12, 'D', 300, 300, 10, 1], [1, 'C', 300, 300, 10, 1]]],   // bank charges: moved to Finance costs by a ledger of its own line (below)
        ] as [$no, $date, $status, $cur, $total, $base, $loc, $cc, $entries]) {
            $vid = DB::table('vouchers')->insertGetId(['voucher_type_id' => $no === 'V1' ? 2 : 1, 'party_ledger_id' => $no === 'V1' ? 3 : null, 'narration' => $no === 'V1' ? 'Sale to the customer' : null, 'voucher_number' => $no, 'date' => $date, 'status' => $status, 'currency_id' => $cur, 'total_amount' => $total, 'base_total' => $base, 'location_id' => $loc, 'cost_centre_id' => $cc, 'exchange_rate' => $cur === 2 ? 130 : 1, 'created_at' => $now, 'updated_at' => $now]);
            foreach ($entries as $i => [$ledger, $side, $amt, $b, $ecc, $eloc]) {
                DB::table('voucher_entries')->insert(['voucher_id' => $vid, 'ledger_id' => $ledger, 'side' => $side, 'amount' => $amt, 'base_amount' => $b, 'cost_centre_id' => $ecc, 'location_id' => $eloc, 'line_no' => $i + 1]);
            }
        }

        // a memorandum is a note, not a transaction (the day book leaves it out)
        DB::table('vouchers')->insert(['voucher_type_id' => 3, 'voucher_number' => 'MEMO1', 'date' => '2026-02-01', 'status' => 'posted', 'currency_id' => 1, 'total_amount' => 0, 'base_total' => 0, 'created_at' => $now, 'updated_at' => $now]);

        // the cost-centre dimension is on in these books; the branch filter and the cost-centre service stand in for the real ones
        $this->app->instance(CostCentreService::class, new class extends CostCentreService {
            public function __construct() {}

            public function booksReady(): bool { return true; }

            public function withDescendants(int $id): array { return $id === 10 ? [10, 11] : [$id]; }
        });
        $test = $this;
        $this->app->instance(BranchFilter::class, new class($test) extends BranchFilter {
            public function __construct(private $test) {}

            public function limit(?\App\Models\User $u = null): ?array { return $this->test->limitedTo; }

            public function enforcing(string $area, ?\App\Models\User $u = null): bool { return $this->test->limitedTo !== null; }

            public function apply($query, string $column, string $area, string $what)
            {
                $ids = $this->test->limitedTo;

                return $ids === null ? $query : $query->where(fn ($w) => $w->whereIn($column, $ids)->orWhereNull($column));
            }
        });
    }
}
