<?php

namespace Tests\Feature;

use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\Reports\TaxReturnReport;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The tax return for a reverse-charge tax (docs/TAX_CONTROL_PLAN.md, T7): owed in the tax ledger, claimed back in the type's input ledger, so it nets to nothing. */
class TaxReturnReverseChargeTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        foreach (['voucher_items', 'voucher_item_taxes'] as $t) {
            Schema::dropIfExists($t);
        }
        Schema::table('ledger_groups', function ($t) {
            $t->string('code')->nullable(); $t->string('application_mode')->nullable(); $t->string('application_method')->nullable(); $t->string('tax_category')->nullable(); $t->boolean('is_active')->default(1); $t->boolean('is_compound')->default(0);
            $t->unsignedBigInteger('control_ledger_id')->nullable(); $t->unsignedBigInteger('payable_ledger_id')->nullable(); $t->unsignedBigInteger('receivable_ledger_id')->nullable(); $t->unsignedBigInteger('input_ledger_id')->nullable();
        });
        Schema::table('ledgers', function ($t) {
            $t->string('rate_type')->nullable(); $t->decimal('rate_value', 12, 4)->nullable(); $t->date('valid_from')->nullable(); $t->date('valid_until')->nullable();
            $t->string('classification')->nullable(); $t->string('tax_nature')->nullable(); $t->string('side')->nullable(); $t->unsignedBigInteger('tax_rate_ledger_id')->nullable();
            $t->unsignedBigInteger('unit_of_measure_id')->nullable(); $t->unsignedBigInteger('currency_id')->nullable();
        });
        Schema::create('voucher_items', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('ledger_id')->nullable(); $t->decimal('amount', 15, 2); $t->boolean('is_header')->default(false); $t->text('gift_meta')->nullable(); });
        Schema::create('voucher_item_taxes', function ($t) { $t->id(); $t->unsignedBigInteger('item_id'); $t->unsignedBigInteger('ledger_id'); $t->decimal('base_amount', 15, 2); });
        DB::table('voucher_types')->insert([['id' => 4, 'code' => 'PI', 'name' => 'Purchase', 'base_type' => 'purchase']]);
        $now = now();
        DB::table('ledger_groups')->insert(['id' => 30, 'name' => 'Duties & Taxes', 'nature' => 'liability', 'is_primary' => 1, 'behaviour' => 'standard', 'created_at' => $now, 'updated_at' => $now]);
        DB::table('ledger_groups')->insert(['id' => 35, 'parent_id' => 30, 'name' => 'Import VAT', 'nature' => 'liability', 'behaviour' => 'tax', 'code' => 'RCVAT', 'application_mode' => 'additive',
            'application_method' => 'reverse_charge', 'tax_category' => 'vat_gst', 'input_ledger_id' => 90, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('ledgers')->insert(['id' => 85, 'group_id' => 35, 'name' => 'Import VAT 16%', 'opening_balance' => 0, 'opening_side' => 'C', 'rate_type' => 'percent', 'rate_value' => 16, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('ledgers')->insert(['id' => 90, 'group_id' => 3, 'name' => 'Input Import VAT', 'opening_balance' => 0, 'opening_side' => 'D', 'created_at' => $now, 'updated_at' => $now]);
        // a purchase of 1,000 on reverse charge: Dr purchases 1,000, Cr supplier 1,000; Dr input 160, Cr tax ledger 160
        $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => 4, 'voucher_number' => 'RC1', 'date' => '2026-04-05', 'status' => 'posted', 'currency_id' => 1, 'total_amount' => 1160, 'base_total' => 1160, 'location_id' => 1, 'created_at' => $now, 'updated_at' => $now]);
        foreach ([[5, 'D', 1000], [8, 'C', 1000], [90, 'D', 160], [85, 'C', 160]] as $i => [$l, $s, $a]) {
            DB::table('voucher_entries')->insert(['voucher_id' => $id, 'ledger_id' => $l, 'side' => $s, 'amount' => $a, 'base_amount' => $a, 'location_id' => 1, 'line_no' => $i + 1]);
        }
        $item = DB::table('voucher_items')->insertGetId(['voucher_id' => $id, 'ledger_id' => 5, 'amount' => 1000]);
        DB::table('voucher_item_taxes')->insert(['item_id' => $item, 'ledger_id' => 85, 'base_amount' => 1000]);
    }

    protected function tearDown(): void
    {
        foreach (['voucher_items', 'voucher_item_taxes'] as $t) {
            Schema::dropIfExists($t);
        }
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    public function test_the_tax_is_shown_as_owed_and_claimed_back_and_nets_to_nothing(): void
    {
        $d = (new TaxReturnReport())->run(Scope::fromInput(['from' => '2026-04-01', 'to' => '2026-06-30']), []);
        $t = collect($d['types'])->firstWhere('code', 'RCVAT');
        $this->assertSame('reverse_charge', $t['mode']);
        $this->assertSame('vat_gst', $t['category']);
        $this->assertEquals([['Import VAT 16%', 1000, 160, 0], ['Claimed back (reverse charge)', null, 0, 160]], array_map(fn ($r) => [$r['label'], $r['purchases_base'] ?? $r['sales_base'], $r['output'], $r['input']], $t['rows']));
        $this->assertEquals(0, $t['net_movement']);
        $this->assertEquals(0, $t['closing_owed'], 'what is owed less what is claimed');
        $this->assertEquals(0, $t['settled'], 'the proof closes');
    }
}
