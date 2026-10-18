<?php

namespace Tests\Feature;

use App\Services\Books\BooksException;
use App\Services\Menus\IngredientReceiving;
use App\Services\Menus\MenuMoney;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\WasteService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus, Configuration, Currency: the kitchen's own vouchers are written in the Menus currency (else the base currency), converted at the rate of the day. */
class MenusCurrencyTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private int $usd;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        Schema::table('currencies', function ($t) { $t->boolean('is_active')->default(true); $t->decimal('conversion_rate', 18, 6)->default(1); });
        DB::table('currencies')->where('id', 1)->update(['conversion_rate' => 1]);
        Schema::create('menus_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->json('settings')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        $this->usd = DB::table('currencies')->insertGetId(['code' => 'USD', 'is_base' => false, 'is_active' => true, 'conversion_rate' => 130]);
        $this->makeIngredient('Wheat flour', $this->g, $this->kg, [['name' => 'Exe 2 kg', 'pack' => 2000]]);
        $this->shelve('Exe 2 kg', 10000, 0.13);   // 1,300 on the shelf
    }

    private function waste(float $grams = 2000): void
    {
        app(WasteService::class)->record(['location_id' => self::BRANCH, 'item_id' => $this->itemId('Exe 2 kg'), 'quantity' => $grams, 'unit' => 'base', 'kind' => 'spoilage'], null);
    }

    public function test_with_no_menus_currency_the_kitchen_writes_in_the_base_currency_as_before(): void
    {
        $this->assertTrue(app(MenuMoney::class)->currency()->is_base);
        $this->waste();
        $j = end($this->posted);
        $this->assertSame(1, $j['currency_id']);
        $this->assertArrayNotHasKey('exchange_rate', $j);
        $this->assertEquals(260, $j['entries'][0]['amount']);
    }

    public function test_a_menus_currency_makes_the_kitchen_journals_convert_at_the_rate_of_the_day(): void
    {
        MenusSettings::save(['currency_id' => $this->usd], null);
        $this->assertSame($this->usd, app(MenuMoney::class)->currency()->id);
        $this->waste();   // 2,000 g at 0.13 = 260 in the base currency = 2.00 USD at 130
        $j = end($this->posted);
        $this->assertSame([$this->usd, 130.0], [$j['currency_id'], (float) $j['exchange_rate']]);
        $this->assertEquals([2.0, 2.0], [$j['entries'][0]['amount'], $j['entries'][1]['amount']], 'the debit and the credit agree');
    }

    public function test_a_delivery_and_opening_stock_default_to_the_menus_currency(): void
    {
        MenusSettings::save(['currency_id' => $this->usd], null);
        $item = $this->itemId('Exe 2 kg');
        app(IngredientReceiving::class)->receive(['location_id' => self::BRANCH, 'supplier_ledger_id' => $this->supplier, 'lines' => [['item_id' => $item, 'quantity' => 1, 'unit' => 'pack', 'rate' => 2.0]]], null);
        $j = end($this->posted);
        $this->assertSame([$this->usd, 130.0], [$j['currency_id'], (float) $j['exchange_rate']], 'the prices typed are in the Menus currency');
    }

    public function test_a_currency_that_is_unknown_or_switched_off_is_refused_and_empty_goes_back_to_the_base(): void
    {
        DB::table('currencies')->where('id', $this->usd)->update(['is_active' => false]);
        try {
            MenusSettings::save(['currency_id' => $this->usd], null);
            $this->fail('A switched-off currency was accepted.');
        } catch (BooksException $e) {
            $this->assertStringContainsString('not available', $e->getMessage());
        }
        DB::table('currencies')->where('id', $this->usd)->update(['is_active' => true]);
        MenusSettings::save(['currency_id' => $this->usd], null);
        DB::table('currencies')->where('id', $this->usd)->update(['is_active' => false]);
        $this->assertTrue(app(MenuMoney::class)->currency()->is_base, 'a currency that has since been switched off falls back to the base');
        MenusSettings::save(['currency_id' => null], null);
        $this->assertNull(MenusSettings::all()['currency_id']);
    }
}
