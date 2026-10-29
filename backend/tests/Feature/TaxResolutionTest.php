<?php

namespace Tests\Feature;

use App\Models\Books\Ledger;
use App\Models\Books\VoucherItemTax;
use App\Services\Books\BooksException;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\TaxLineService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Several taxes on one line (docs/TAX_CONTROL_PLAN.md, step T6): the account's other taxes each on their own base (price plus excise, price alone, price plus
 * the taxes a rate lists), an item's opt-out, and the taxes that apply regardless with their rule about exemptions. The setups that existed before are pinned
 * by TaxLineGoldenTest.
 */
class TaxResolutionTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RunsSqlScripts;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        foreach (['tax_control_settings', 'tax_control_log', 'ledger_taxes', 'tax_opt_outs', 'tax_applicability', 'stub_items', 'voucher_items', 'voucher_item_taxes'] as $t) {
            Schema::dropIfExists($t);
        }
        $this->runSqlScripts('229_tax_control.sql', '230_tax_resolution.sql');
        Schema::table('ledger_groups', function ($t) {
            $t->string('code')->nullable(); $t->string('kind')->nullable(); $t->string('application_mode')->nullable(); $t->boolean('is_active')->default(1); $t->boolean('is_compound')->default(0);
            $t->unsignedBigInteger('control_ledger_id')->nullable(); $t->unsignedBigInteger('payable_ledger_id')->nullable(); $t->unsignedBigInteger('receivable_ledger_id')->nullable();
        });
        Schema::table('ledgers', function ($t) {
            $t->string('rate_type')->nullable(); $t->decimal('rate_value', 12, 4)->nullable(); $t->date('valid_from')->nullable(); $t->date('valid_until')->nullable(); $t->string('classification')->nullable();
            $t->string('tax_nature')->nullable(); $t->string('side')->nullable(); $t->unsignedBigInteger('tax_rate_ledger_id')->nullable(); $t->unsignedBigInteger('unit_of_measure_id')->nullable();
            $t->unsignedBigInteger('currency_id')->nullable(); $t->string('calculation_base')->nullable(); $t->integer('calculation_sequence')->nullable(); $t->boolean('requires_certificate')->default(0);
            $t->decimal('secondary_rate_value', 18, 6)->nullable(); $t->string('tax_point', 20)->nullable(); $t->text('base_includes')->nullable();
        });
        Schema::create('tax_applicability', function ($t) { $t->id(); $t->string('taxable_type'); $t->unsignedBigInteger('taxable_id'); $t->unsignedBigInteger('tax_rule_id')->nullable(); $t->boolean('is_exempt')->default(0); $t->unsignedBigInteger('tax_legitimacy_certificate_id')->nullable(); $t->timestamps(); });
        Schema::create('stub_items', function ($t) { $t->id(); });
        Schema::create('voucher_item_taxes', function ($t) { $t->id(); $t->unsignedBigInteger('item_id'); $t->unsignedBigInteger('tax_rate_id')->nullable(); $t->unsignedBigInteger('ledger_id'); $t->string('label')->nullable(); $t->decimal('base_amount', 15, 2); $t->decimal('tax_amount', 15, 2); $t->text('calc_snapshot')->nullable(); });
        $now = now();
        $g = fn (array $r) => DB::table('ledger_groups')->insert($r + ['nature' => 'liability', 'created_at' => $now, 'updated_at' => $now]);
        $g(['id' => 30, 'name' => 'Duties & Taxes', 'is_primary' => 1, 'behaviour' => 'standard']);
        $g(['id' => 31, 'parent_id' => 30, 'name' => 'VAT', 'behaviour' => 'tax', 'application_mode' => 'additive', 'kind' => 'vat', 'code' => 'VAT']);
        $g(['id' => 32, 'parent_id' => 30, 'name' => 'Excise duty', 'behaviour' => 'tax', 'application_mode' => 'additive', 'kind' => 'excise', 'code' => 'EXC']);
        $g(['id' => 33, 'parent_id' => 30, 'name' => 'Transaction levy', 'behaviour' => 'tax', 'application_mode' => 'additive', 'kind' => 'other', 'code' => 'LEVY']);
        // [id, group, name, percent, base, includes]
        foreach ([
            [80, 32, 'Excise 10%', 10, 'post_discount', null], [81, 31, 'VAT 16% on the price', 16, 'post_discount', null], [82, 31, 'VAT 16% on price and earlier taxes', 16, 'total_payable', null],
            [83, 33, 'Levy 1%', 1, 'post_discount', null], [84, 31, 'VAT 16% on price and excise only', 16, 'total_payable', [32]],
        ] as [$id, $grp, $name, $v, $base, $inc]) {
            DB::table('ledgers')->insert(['id' => $id, 'group_id' => $grp, 'name' => $name, 'opening_balance' => 0, 'opening_side' => 'C', 'rate_type' => 'percent', 'rate_value' => $v, 'calculation_base' => $base,
                'base_includes' => $inc ? json_encode($inc) : null, 'valid_from' => '2020-01-01', 'classification' => 'standard', 'is_active' => 1, 'created_at' => $now, 'updated_at' => $now]);
        }
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    /** An account with its taxes in order: [[rate id, treatment], ...]. The first is the primary tax, which the old columns mirror. */
    private function account(int $id, string $name, array $taxes): Ledger
    {
        $now = now();
        $first = $taxes[0];
        $nature = ['applies' => 'taxable', 'zero_rated' => 'zero_rated', 'exempt' => 'exempt', 'out_of_scope' => 'out_of_scope'][$first[1]];
        DB::table('ledgers')->insert(['id' => $id, 'group_id' => 6, 'name' => $name, 'opening_balance' => 0, 'opening_side' => 'D', 'tax_nature' => $nature, 'tax_rate_ledger_id' => $first[0] ?: null, 'created_at' => $now, 'updated_at' => $now]);
        foreach ($taxes as $i => [$rate, $treatment]) {
            $type = (int) DB::table('ledgers')->where('id', $rate ?: 81)->value('group_id');
            DB::table('ledger_taxes')->insert(['ledger_id' => $id, 'tax_type_id' => $type, 'tax_rate_id' => $rate ?: null, 'treatment' => $treatment, 'sort_order' => $i, 'created_at' => $now, 'updated_at' => $now]);
        }

        return Ledger::find($id);
    }

    private function lines(): TaxLineService
    {
        return app(TaxLineService::class);
    }

    private function calc(Ledger $a, float $pre = 1000.0, float $post = 1000.0, float $qty = 1.0, string $side = 'output', ?Model $item = null): array
    {
        return $this->lines()->fromAccount($a, $pre, $post, $qty, $side, null, null, '2026-03-01', $item);
    }

    private function summary(array $rows): array
    {
        return array_map(fn ($r) => [$r['label'], $r['base_amount'], $r['tax_amount']], $rows);
    }

    private function item(int $id = 5): Model
    {
        $m = new class extends Model { protected $table = 'stub_items'; public $timestamps = false; };
        $m->exists = true;
        $m->id = $id;

        return $m;
    }

    private function optOut(Model $item, int $taxType, ?string $reason = null): void
    {
        DB::table('tax_opt_outs')->insert(['taxable_type' => $item->getMorphClass(), 'taxable_id' => $item->getKey(), 'tax_type_id' => $taxType, 'reason' => $reason, 'created_at' => now(), 'updated_at' => now()]);
    }

    private function regardless(array $entries): void
    {
        DB::table('tax_control_settings')->updateOrInsert(['setting_key' => 'apply_regardless'], ['value' => json_encode($entries), 'created_at' => now(), 'updated_at' => now()]);
    }

    // ── several taxes on one account ───────────────────────────────────

    public function test_excise_first_and_vat_on_the_price_plus_the_excise(): void
    {
        $rows = $this->calc($this->account(70, 'Spirits', [[80, 'applies'], [82, 'applies']]));
        $this->assertEquals([['EXC 10%', 1000, 100], ['VAT 16%', 1100, 176]], $this->summary($rows), 'price 1,000; excise 100; VAT on 1,100 is 176');
        $this->assertEquals(276, array_sum(array_column($rows, 'tax_amount')));
        $this->assertSame([80, 82], array_column($rows, 'ledger_id'), 'each posts to its own tax ledger');
    }

    public function test_vat_on_the_price_alone_when_its_rate_says_so(): void
    {
        $rows = $this->calc($this->account(71, 'Spirits, VAT on the price', [[80, 'applies'], [81, 'applies']]));
        $this->assertEquals([['EXC 10%', 1000, 100], ['VAT 16%', 1000, 160]], $this->summary($rows));
    }

    public function test_the_discount_is_taken_before_either_tax(): void
    {
        $rows = $this->calc($this->account(72, 'Spirits', [[80, 'applies'], [82, 'applies']]), 1000, 900);
        $this->assertEquals([['EXC 10%', 900, 90], ['VAT 16%', 990, 158.4]], $this->summary($rows));
    }

    public function test_a_rate_can_list_the_taxes_its_base_includes_and_with_no_list_it_includes_them_all(): void
    {
        $listed = $this->calc($this->account(73, 'Spirits, listed', [[80, 'applies'], [83, 'applies'], [84, 'applies']]));
        $this->assertEquals([['EXC 10%', 1000, 100], ['LEVY 1%', 1000, 10], ['VAT 16%', 1100, 176]], $this->summary($listed), 'VAT lists excise only, so the levy is not in its base');
        $all = $this->calc($this->account(74, 'Spirits, all', [[80, 'applies'], [83, 'applies'], [82, 'applies']]));
        $this->assertEquals([['EXC 10%', 1000, 100], ['LEVY 1%', 1000, 10], ['VAT 16%', 1110, 177.6]], $this->summary($all));
    }

    public function test_an_account_exempt_from_its_first_tax_can_still_charge_the_second(): void
    {
        $rows = $this->calc($this->account(75, 'Exempt from VAT, excised', [[81, 'exempt'], [80, 'applies']]));
        $this->assertEquals([['EXC 10%', 1000, 100]], $this->summary($rows));
    }

    public function test_a_zero_rated_second_tax_keeps_its_row_so_the_return_shows_the_value(): void
    {
        $rows = $this->calc($this->account(76, 'Excised, VAT zero-rated', [[80, 'applies'], [81, 'zero_rated']]));
        $this->assertEquals([['EXC 10%', 1000, 100], ['VAT 16%', 1000, 0]], $this->summary($rows));
    }

    public function test_purchases_post_to_the_input_side_of_each_tax(): void
    {
        $this->assertCount(2, $this->calc($this->account(77, 'Purchases, excised', [[80, 'applies'], [82, 'applies']]), 1000, 1000, 1, 'input'));
    }

    public function test_every_row_carries_a_snapshot_of_how_it_was_worked_out(): void
    {
        $rows = $this->calc($this->account(78, 'Spirits', [[80, 'applies'], [84, 'applies']]));
        $vat = $rows[1]['snapshot'];
        $this->assertSame(['account', 'applies', 31, 84, 16.0, 'total_payable', [32], 1100.0, 176.0], [$vat['source'], $vat['treatment'], $vat['tax_type_id'], $vat['tax_rate_id'], $vat['rate_value'], $vat['calculation_base'], $vat['base_includes'], $vat['base_amount'], $vat['tax_amount']]);
        $this->assertSame(32, $rows[0]['tax_type_id']);
    }

    public function test_a_posted_line_keeps_its_snapshot(): void
    {
        $rows = $this->calc($this->account(79, 'Spirits', [[80, 'applies'], [82, 'applies']]));
        $t = $rows[1];
        VoucherItemTax::create(['item_id' => 1, 'tax_rate_id' => $t['tax_rate_id'], 'ledger_id' => $t['ledger_id'], 'label' => $t['label'], 'base_amount' => $t['base_amount'], 'tax_amount' => $t['tax_amount'], 'calc_snapshot' => $t['snapshot']]);
        $kept = VoucherItemTax::first()->calc_snapshot;
        $this->assertEquals([176, 1100, 'account'], [$kept['tax_amount'], $kept['base_amount'], $kept['source']]);
    }

    // ── an item's opt-out ──────────────────────────────────────────────

    public function test_an_item_that_opts_out_of_a_tax_is_not_charged_it_and_the_next_tax_has_no_base_from_it(): void
    {
        $item = $this->item();
        $this->optOut($item, 32, 'not an excisable product');
        $rows = $this->calc($this->account(90, 'Spirits', [[80, 'applies'], [82, 'applies']]), 1000, 1000, 1, 'output', $item);
        $this->assertEquals([['VAT 16%', 1000, 160]], $this->summary($rows), 'no excise on the line, so VAT is on the price alone');
        $this->assertCount(2, $this->calc($this->account(91, 'Spirits again', [[80, 'applies'], [82, 'applies']]), 1000, 1000, 1, 'output', $this->item(6)), 'another item is charged both');
    }

    public function test_an_item_can_opt_out_of_the_second_tax_too(): void
    {
        $item = $this->item();
        $this->optOut($item, 31);
        $rows = $this->calc($this->account(92, 'Spirits', [[80, 'applies'], [82, 'applies']]), 1000, 1000, 1, 'output', $item);
        $this->assertEquals([['EXC 10%', 1000, 100]], $this->summary($rows));
    }

    public function test_a_blanket_exemption_on_the_item_still_wins_over_every_tax(): void
    {
        $item = $this->item();
        DB::table('tax_applicability')->insert(['taxable_type' => $item->getMorphClass(), 'taxable_id' => $item->getKey(), 'tax_rule_id' => null, 'is_exempt' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $this->assertSame([], $this->calc($this->account(93, 'Spirits', [[80, 'applies'], [82, 'applies']]), 1000, 1000, 1, 'output', $item));
    }

    // ── taxes that apply regardless ────────────────────────────────────

    private function line(?Ledger $account, string $side = 'output', ?Model $item = null, float $amount = 1000.0): array
    {
        return $this->lines()->forLine($item, 'product', $amount, $amount, 1.0, null, $side, null, null, null, $account);
    }

    public function test_a_tax_that_applies_regardless_is_added_to_the_line_and_only_on_the_documents_it_names(): void
    {
        $this->regardless([['tax_type_id' => 33, 'exemption_behaviour' => 'respect_exemptions', 'documents' => ['sales']]]);
        $account = $this->account(100, 'Sales VAT', [[81, 'applies']]);
        $this->assertEquals([['VAT 16%', 1000, 160], ['LEVY 1%', 1000, 10]], $this->summary($this->line($account)));
        $this->assertEquals([['VAT 16%', 1000, 160]], $this->summary($this->line($account, 'input')), 'not on purchases');
    }

    public function test_it_is_added_after_the_other_taxes_and_never_twice(): void
    {
        $this->regardless([['tax_type_id' => 33, 'exemption_behaviour' => 'respect_exemptions', 'documents' => ['sales']]]);
        $own = $this->account(101, 'Sales with the levy already', [[81, 'applies'], [83, 'applies']]);
        $this->assertCount(2, $this->line($own), 'the account already carries the levy');
    }

    public function test_respecting_exemptions_it_is_left_off_an_exempt_account_an_out_of_scope_one_and_an_opted_out_item(): void
    {
        $this->regardless([['tax_type_id' => 33, 'exemption_behaviour' => 'respect_exemptions', 'documents' => ['sales']]]);
        $this->assertSame([], $this->line($this->account(102, 'Exempt', [[81, 'exempt']])));
        $this->assertSame([], $this->line($this->account(103, 'Out of scope', [[81, 'out_of_scope']])));
        $item = $this->item();
        $this->optOut($item, 33);
        $this->assertEquals([['VAT 16%', 1000, 160]], $this->summary($this->line($this->account(104, 'Sales VAT', [[81, 'applies']]), 'output', $item)));
    }

    public function test_excluding_exempt_supplies_it_leaves_off_an_exempt_account_but_not_an_out_of_scope_one(): void
    {
        $this->regardless([['tax_type_id' => 33, 'exemption_behaviour' => 'exclude_exempt_supplies', 'documents' => ['sales']]]);
        $this->assertSame([], $this->line($this->account(105, 'Exempt', [[81, 'exempt']])));
        $this->assertEquals([['LEVY 1%', 1000, 10]], $this->summary($this->line($this->account(106, 'Out of scope', [[81, 'out_of_scope']]))));
    }

    public function test_applying_independently_it_is_charged_whatever_the_account_or_the_item_says(): void
    {
        $this->regardless([['tax_type_id' => 33, 'exemption_behaviour' => 'apply_independently', 'documents' => ['sales']]]);
        $item = $this->item();
        $this->optOut($item, 33);
        DB::table('tax_applicability')->insert(['taxable_type' => $item->getMorphClass(), 'taxable_id' => $item->getKey(), 'tax_rule_id' => null, 'is_exempt' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $this->assertEquals([['LEVY 1%', 1000, 10]], $this->summary($this->line($this->account(107, 'Exempt', [[81, 'exempt']]), 'output', $item)));
    }

    public function test_a_line_with_no_account_tax_still_gets_it(): void
    {
        $this->regardless([['tax_type_id' => 33, 'exemption_behaviour' => 'respect_exemptions', 'documents' => ['sales']]]);
        $this->assertEquals([['LEVY 1%', 250, 2.5]], $this->summary($this->line(null, 'output', null, 250.0)));
        $this->assertSame([], $this->lines()->forLine(null, 'product', 0.0, 0.0, 1.0, null, 'output', null, null, null, null), 'nothing to tax');
    }

    public function test_a_tax_that_applies_regardless_but_has_no_rate_in_force_is_refused_plainly(): void
    {
        DB::table('ledgers')->where('id', 83)->update(['valid_until' => '2025-01-01']);
        $this->regardless([['tax_type_id' => 33, 'exemption_behaviour' => 'respect_exemptions', 'documents' => ['sales']]]);
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('Transaction levy applies to every document but has no standard rate in force');
        $this->lines()->forLine(null, 'product', 1000.0, 1000.0, 1.0, null, 'output', null, null, null, null);
    }

    public function test_without_the_settings_nothing_changes(): void
    {
        Schema::dropIfExists('tax_control_settings');
        $this->assertEquals([['VAT 16%', 1000, 160]], $this->summary($this->line($this->account(108, 'Sales VAT', [[81, 'applies']]))));
    }
}
