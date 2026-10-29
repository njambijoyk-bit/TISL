<?php

namespace Tests\Feature;

use App\Models\Books\Ledger;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\TaxLineService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The record of what the tax calculation gave for the setups that existed BEFORE the tax posting update (docs/TAX_CONTROL_PLAN.md, step T6): the new
 * calculation must give exactly these figures for them. The expected figures are in tests/Fixtures/tax_golden.json, taken from the old code.
 * To record them again (only ever from code known to be right): GOLDEN_WRITE=1 phpunit --filter TaxLineGoldenTest
 */
class TaxLineGoldenTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;

    private const FIXTURE = __DIR__ . '/../Fixtures/tax_golden.json';

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        Schema::table('ledger_groups', function ($t) {
            $t->string('code')->nullable(); $t->string('kind')->nullable(); $t->string('application_mode')->nullable(); $t->boolean('is_active')->default(1); $t->boolean('is_compound')->default(0);
            $t->unsignedBigInteger('control_ledger_id')->nullable(); $t->unsignedBigInteger('payable_ledger_id')->nullable(); $t->unsignedBigInteger('receivable_ledger_id')->nullable();
        });
        Schema::table('ledgers', function ($t) {
            $t->string('rate_type')->nullable(); $t->decimal('rate_value', 12, 4)->nullable(); $t->date('valid_from')->nullable(); $t->date('valid_until')->nullable(); $t->string('classification')->nullable();
            $t->string('tax_nature')->nullable(); $t->string('side')->nullable(); $t->unsignedBigInteger('tax_rate_ledger_id')->nullable(); $t->unsignedBigInteger('unit_of_measure_id')->nullable();
            $t->unsignedBigInteger('currency_id')->nullable(); $t->string('calculation_base')->nullable(); $t->integer('calculation_sequence')->nullable(); $t->boolean('requires_certificate')->default(0);
        });
        $now = now();
        $g = fn (array $r) => DB::table('ledger_groups')->insert($r + ['nature' => 'liability', 'created_at' => $now, 'updated_at' => $now]);
        $g(['id' => 30, 'name' => 'Duties & Taxes', 'is_primary' => 1, 'behaviour' => 'standard']);
        $g(['id' => 31, 'parent_id' => 30, 'name' => 'VAT', 'behaviour' => 'tax', 'application_mode' => 'additive', 'kind' => 'vat', 'code' => 'VAT']);
        $g(['id' => 32, 'parent_id' => 30, 'name' => 'Excise duty', 'behaviour' => 'tax', 'application_mode' => 'additive', 'kind' => 'excise', 'code' => 'EXC']);
        // [id, group, name, rate type, value, base, valid_from, valid_until, unit]
        foreach ([
            [43, 31, 'VAT 16%', 'percent', 16, 'post_discount', '2020-01-01', null, null],
            [44, 31, 'VAT 16% pre-discount', 'percent', 16, 'pre_discount', '2020-01-01', null, null],
            [45, 32, 'Excise 20 per litre', 'per_unit', 20, 'post_discount', '2020-01-01', null, 1],
            [46, 31, 'VAT 14% (old)', 'percent', 14, 'post_discount', '2019-01-01', '2024-12-31', null],
            [47, 31, 'VAT 16% (new)', 'percent', 16, 'post_discount', '2025-01-01', null, null],
        ] as [$id, $grp, $name, $type, $v, $base, $from, $until, $unit]) {
            DB::table('ledgers')->insert(['id' => $id, 'group_id' => $grp, 'name' => $name, 'opening_balance' => 0, 'opening_side' => 'C', 'rate_type' => $type, 'rate_value' => $v, 'calculation_base' => $base,
                'valid_from' => $from, 'valid_until' => $until, 'unit_of_measure_id' => $unit, 'classification' => 'standard', 'is_active' => 1, 'created_at' => $now, 'updated_at' => $now]);
        }
        // sales / purchase accounts and what each carries
        foreach ([
            [60, 'Sales VAT', 'taxable', 43], [61, 'Sales VAT pre-discount', 'taxable', 44], [62, 'Sales zero-rated', 'zero_rated', 43], [63, 'Sales exempt', 'exempt', null],
            [64, 'Sales out of scope', 'out_of_scope', null], [65, 'Sales spirits', 'taxable', 45], [66, 'Sales old VAT', 'taxable', 46], [67, 'Sales taxable no rate', 'taxable', null],
        ] as [$id, $name, $nature, $rate]) {
            DB::table('ledgers')->insert(['id' => $id, 'group_id' => 6, 'name' => $name, 'opening_balance' => 0, 'opening_side' => 'D', 'tax_nature' => $nature, 'tax_rate_ledger_id' => $rate, 'created_at' => $now, 'updated_at' => $now]);
        }
        DB::table('ledgers')->where('id', 61)->update(['calculation_base' => null]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    /** Every case: [name, account, pre-discount, post-discount, quantity, side, date]. */
    private function cases(): array
    {
        $cases = [];
        foreach ([[60, 'vat'], [61, 'vat pre-discount'], [62, 'zero-rated'], [63, 'exempt'], [64, 'out of scope'], [65, 'per unit'], [66, 'old VAT']] as [$acct, $label]) {
            foreach (['output', 'input'] as $side) {
                foreach ([['no discount', 1000.0, 1000.0, 1.0], ['discounted', 1000.0, 900.0, 3.0], ['a litre line', 2500.5, 2500.5, 100.0]] as [$what, $pre, $post, $qty]) {
                    foreach (['2026-03-01', '2024-06-01'] as $on) {
                        $cases[] = ["{$label} / {$side} / {$what} / {$on}", $acct, $pre, $post, $qty, $side, $on];
                    }
                }
            }
        }
        $cases[] = ['nothing to tax', 60, 0.0, 0.0, 1.0, 'output', '2026-03-01'];

        return $cases;
    }

    /** @return array<string, mixed> the figures every case gives now */
    private function record(): array
    {
        $svc = app(TaxLineService::class);
        $out = [];
        foreach ($this->cases() as [$name, $acct, $pre, $post, $qty, $side, $on]) {
            $account = Ledger::find($acct);
            $rows = $svc->fromAccount($account, $pre, $post, $qty, $side, null, null, $on);
            $out[$name] = array_map(fn ($r) => array_intersect_key($r, array_flip(['tax_rate_id', 'ledger_id', 'label', 'base_amount', 'tax_amount', 'percent'])), $rows);
        }
        foreach ([[43, 1000.0, 'output'], [43, 333.33, 'input'], [45, 500.0, 'output']] as [$rate, $base, $side]) {
            $out["manual {$rate} {$base} {$side}"] = array_map(fn ($r) => array_intersect_key($r, array_flip(['tax_rate_id', 'ledger_id', 'label', 'base_amount', 'tax_amount', 'percent'])), $svc->manual($rate, $base, $side));
        }
        try {
            $svc->fromAccount(Ledger::find(67), 100, 100, 1, 'output', null);
            $out['taxable, no rate'] = 'no error';
        } catch (\Throwable $e) {
            $out['taxable, no rate'] = $e->getMessage();
        }

        return $out;
    }

    public function test_the_calculation_gives_the_recorded_figures_for_every_setup_that_existed_before(): void
    {
        $now = $this->record();
        if (getenv('GOLDEN_WRITE')) {
            file_put_contents(self::FIXTURE, json_encode($now, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            $this->markTestSkipped('Recorded ' . count($now) . ' cases to ' . self::FIXTURE);
        }
        $golden = json_decode((string) file_get_contents(self::FIXTURE), true);
        $this->assertNotEmpty($golden, 'the recorded figures are missing');
        $this->assertSame(array_keys($golden), array_keys($now), 'the same cases');
        foreach ($golden as $name => $expected) {
            $this->assertEquals($expected, $now[$name], "case: {$name}");
        }
    }
}
