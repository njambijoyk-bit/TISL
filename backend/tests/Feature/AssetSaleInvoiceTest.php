<?php

namespace Tests\Feature;

use App\Models\AssetDepreciation;
use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Currency;
use App\Models\Inventory\InventoryInstance;
use App\Services\Books\BooksException;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\VoucherService;
use App\Services\Inventory\AssetAccountingService;
use App\Services\Inventory\FixedAssetLedgers;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** An asset sold on a sales invoice: the line is just the sale, and the cost, depreciation and gain or loss are booked beside it, balanced. Cancelling puts the asset back. */
class AssetSaleInvoiceTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;

    private Ledger $asset;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        Schema::table('ledgers', function ($t) {
            $t->string('rate_type')->nullable(); $t->decimal('rate_value', 12, 4)->nullable(); $t->date('valid_from')->nullable(); $t->date('valid_until')->nullable(); $t->string('tax_nature')->nullable(); $t->string('side')->nullable();
            $t->unsignedBigInteger('tax_rate_ledger_id')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->text('settings')->nullable();
        });
        Carbon::setTestNow('2026-10-30 10:00:00');
        foreach (['inventory_instances', 'inventory_items', 'inventory_categories', 'asset_depreciation'] as $t) {
            Schema::dropIfExists($t);
        }
        Schema::create('inventory_categories', function ($t) {
            $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->string('slug')->nullable(); $t->text('description')->nullable(); $t->string('icon')->nullable(); $t->integer('sort_order')->default(0);
            $t->boolean('is_active')->default(true); $t->unsignedBigInteger('created_by')->nullable(); $t->unsignedBigInteger('asset_ledger_id')->nullable(); $t->unsignedBigInteger('accumulated_ledger_id')->nullable();
            $t->unsignedBigInteger('expense_ledger_id')->nullable(); $t->string('default_method', 20)->default('none'); $t->integer('default_life_years')->nullable(); $t->decimal('default_rate', 7, 4)->nullable();
            $t->string('default_floor_type', 10)->nullable(); $t->decimal('default_floor_value', 18, 4)->nullable(); $t->timestamps();
        });
        Schema::create('inventory_items', function ($t) {
            $t->id(); $t->unsignedBigInteger('category_id')->nullable(); $t->unsignedBigInteger('accounts_category_id')->nullable(); $t->string('name'); $t->text('description')->nullable(); $t->string('brand')->nullable(); $t->string('model')->nullable();
            $t->string('type')->default('asset'); $t->boolean('is_serialized')->default(true); $t->string('unit_of_measure')->nullable(); $t->unsignedBigInteger('default_location_id')->nullable(); $t->decimal('purchase_cost', 18, 2)->nullable();
            $t->decimal('replacement_cost', 18, 2)->nullable(); $t->boolean('is_loanable')->default(false); $t->integer('max_loan_days')->nullable();
            foreach (['total_qty', 'available_qty', 'reserved_qty', 'issued_qty', 'loaned_qty', 'in_repair_qty', 'retired_qty'] as $c) { $t->integer($c)->default(0); }
            $t->boolean('is_active')->default(true); $t->text('notes')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); $t->softDeletes();
        });
        Schema::create('inventory_instances', function ($t) {
            $t->id(); $t->unsignedBigInteger('item_id'); $t->string('serial_number')->nullable(); $t->string('asset_tag')->nullable(); $t->string('barcode')->nullable(); $t->string('status')->default('available'); $t->string('condition')->default('new');
            $t->decimal('condition_score', 5, 2)->nullable(); $t->decimal('condition_score_override', 5, 2)->nullable(); $t->unsignedBigInteger('current_location_id')->nullable(); $t->date('purchase_date')->nullable(); $t->decimal('purchase_cost', 18, 2)->nullable();
            $t->date('warranty_expiry')->nullable(); $t->integer('useful_life_years')->nullable(); $t->text('notes')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->unsignedBigInteger('currency_id')->nullable();
            $t->decimal('exchange_rate', 18, 6)->nullable(); $t->decimal('floor_value', 18, 2)->nullable(); $t->string('depreciation_method')->nullable(); $t->decimal('depreciation_rate', 7, 4)->nullable(); $t->date('in_service_date')->nullable();
            $t->decimal('opening_accumulated', 18, 2)->default(0); $t->unsignedBigInteger('acquisition_voucher_id')->nullable(); $t->unsignedBigInteger('disposal_voucher_id')->nullable(); $t->date('disposed_on')->nullable(); $t->decimal('sale_proceeds', 18, 2)->nullable();
            $t->date('depreciated_to')->nullable(); $t->timestamps(); $t->softDeletes();
        });
        Schema::create('asset_depreciation', function ($t) { $t->id(); $t->unsignedBigInteger('instance_id'); $t->date('period_end'); $t->decimal('amount', 15, 2); $t->unsignedBigInteger('currency_id')->nullable(); $t->unsignedBigInteger('voucher_id')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps(); });
        $fixed = LedgerGroup::create(['name' => 'Fixed Assets', 'nature' => 'asset', 'is_primary' => true, 'sort_order' => 30, 'behaviour' => 'standard']);
        $this->asset = Ledger::create(['group_id' => $fixed->id, 'name' => 'Projectors', 'opening_balance' => 10000, 'opening_side' => 'D', 'is_active' => true]);
        app(FixedAssetLedgers::class)->forNewLedger($this->asset, null);
        // in service since January, 4,500 depreciated up to the end of September
        InventoryInstance::query()->update(['depreciation_method' => 'straight_line', 'useful_life_years' => 5, 'floor_value' => 0, 'in_service_date' => '2026-01-01', 'opening_accumulated' => 4500, 'depreciated_to' => '2026-09-30', 'currency_id' => 1]);
        DB::table('ledgers')->where('id', 12)->update(['name' => 'Bank charges']);
    }

    protected function tearDown(): void
    {
        foreach (['inventory_instances', 'inventory_items', 'inventory_categories', 'asset_depreciation'] as $t) {
            Schema::dropIfExists($t);
        }
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function sell(float $price): array
    {
        $svc = app(VoucherService::class);
        $ctx = ['type' => new VoucherType(['code' => 'SI', 'name' => 'Sales', 'base_type' => 'sales']), 'customer' => null, 'party' => null, 'currency' => Currency::find(1), 'baseCurrency' => Currency::find(1), 'locationId' => null, 'date' => Carbon::parse('2026-10-30')];
        $line = (new \ReflectionMethod($svc, 'assetSaleLine'))->invoke($svc, ['instance_id' => InventoryInstance::value('id'), 'price' => $price], $ctx);
        [$entries, $sold] = (new \ReflectionMethod($svc, 'assetSaleEntries'))->invoke($svc, ['lines' => [$line], 'rate' => 1.0]);

        return [$line, $entries, $sold];
    }

    /** Debits and credits of the whole sale: the party owes the price, the line credits the asset account the price, the entries do the rest. */
    private function balanced(float $price, array $entries): void
    {
        $d = $price + array_sum(array_map(fn ($e) => $e['side'] === 'D' ? $e['amount'] : 0, $entries));
        $c = $price + array_sum(array_map(fn ($e) => $e['side'] === 'C' ? $e['amount'] : 0, $entries));
        $this->assertEqualsWithDelta($d, $c, 0.005, 'debits equal credits');
        $assetCredit = $price + array_sum(array_map(fn ($e) => $e['ledger_id'] === (int) $this->asset->id ? ($e['side'] === 'C' ? $e['amount'] : -$e['amount']) : 0, $entries));
        $this->assertEqualsWithDelta(10000.0, $assetCredit, 0.005, 'the asset account is credited exactly its cost');
    }

    public function test_the_sale_line_is_just_the_sale_and_the_rest_is_booked_beside_it_with_a_gain(): void
    {
        [$line, $entries, $sold] = $this->sell(7000.0);
        $this->assertSame('Sale of ' . InventoryInstance::first()->asset_tag . ' · Projectors', $line['description']);
        $this->assertSame(7000.0, $line['amount']);
        $this->assertSame(VoucherService::ASSET_SALE, $line['notes']);
        $this->assertSame((int) $this->asset->id, $line['ledger_id']);
        $this->balanced(7000.0, $entries);
        $names = collect($entries)->map(fn ($e) => Ledger::find($e['ledger_id'])->name . ':' . $e['side'])->all();
        $this->assertContains('Accumulated Depreciation – Projectors:D', $names);
        $this->assertContains('Gain on disposal of assets:C', $names, 'sold above what it was worth');
        $this->assertSame(7000.0, $sold[0]['price']);
    }

    public function test_a_price_below_book_value_is_a_loss_and_a_price_above_cost_still_balances(): void
    {
        [, $entries] = $this->sell(2000.0);
        $this->balanced(2000.0, $entries);
        $this->assertContains('Loss on disposal of assets:D', collect($entries)->map(fn ($e) => Ledger::find($e['ledger_id'])->name . ':' . $e['side'])->all());
        [, $entries] = $this->sell(12000.0);
        $this->balanced(12000.0, $entries);
    }

    public function test_the_register_follows_the_sale_and_a_cancelled_sale_puts_the_asset_back(): void
    {
        [, , $sold] = $this->sell(7000.0);
        $v = Voucher::find(DB::table('vouchers')->insertGetId(['voucher_type_id' => 1, 'voucher_number' => 'INV-9', 'date' => '2026-10-30', 'status' => 'posted']));
        $v->meta = ['asset_sales' => $sold];   // what the invoice keeps of the sale
        $svc = app(AssetAccountingService::class);
        $svc->markSold($v, $sold, null);
        $a = InventoryInstance::first();
        $this->assertSame('2026-10-30', $a->disposed_on->toDateString());
        $this->assertSame((int) $v->id, (int) $a->disposal_voucher_id);
        $this->assertSame(7000.0, (float) $a->sale_proceeds);
        $this->assertSame(1, AssetDepreciation::where('voucher_id', $v->id)->count(), 'the part month is recorded against the invoice');
        try {
            $this->sell(7000.0);
            $this->fail('a sold asset cannot be sold again');
        } catch (BooksException $e) {
            $this->assertStringContainsString('already been sold', $e->getMessage());
        }
        $this->assertSame([], collect($svc->register()['rows'])->where('instance_id', $a->id)->all(), 'it has left the register');

        $this->assertSame(1, $svc->reinstate($v));
        $a->refresh();
        $this->assertNull($a->disposed_on);
        $this->assertNull($a->disposal_voucher_id);
        $this->assertNull($a->sale_proceeds);
        $this->assertSame('2026-09-30', $a->depreciated_to?->toDateString() ?? (string) $a->depreciated_to, 'depreciated up to where it was before the sale');
        $this->assertSame(0, AssetDepreciation::where('voucher_id', $v->id)->count());
    }

    public function test_depreciation_must_be_posted_up_to_the_month_before_and_the_sale_must_be_on_a_sales_invoice(): void
    {
        InventoryInstance::query()->update(['depreciated_to' => '2026-07-31']);   // August and September are not posted
        try {
            $this->sell(7000.0);
            $this->fail('depreciation is behind');
        } catch (BooksException $e) {
            $this->assertStringContainsString('Post depreciation up to', $e->getMessage());
        }
        $svc = app(VoucherService::class);
        $ctx = ['type' => new VoucherType(['code' => 'PI', 'name' => 'Purchase', 'base_type' => 'purchase']), 'customer' => null, 'party' => null, 'currency' => Currency::find(1), 'baseCurrency' => Currency::find(1), 'locationId' => null, 'date' => Carbon::parse('2026-10-30')];
        $this->expectException(BooksException::class);
        (new \ReflectionMethod($svc, 'assetSaleLine'))->invoke($svc, ['instance_id' => 1, 'price' => 1], $ctx);
    }
}
