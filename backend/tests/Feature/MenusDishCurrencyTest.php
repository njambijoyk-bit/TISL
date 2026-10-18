<?php

namespace Tests\Feature;

use App\Models\Currency;
use App\Models\Menus\Dish;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\MenuOrderLine;
use App\Services\Books\BooksException;
use App\Services\CurrencyConversionService;
use App\Services\Menus\CounterService;
use App\Services\Menus\DishService;
use App\Services\Menus\MenuMoney;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\MenuService;
use App\Services\Menus\PublicMenu;
use App\Services\Menus\ReceiptService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus currencies, build step 7 (script 213): a dish priced in its own currency, converted at the rate of the day when it is ordered, rounded line by line. */
class MenusDishCurrencyTest extends TestCase
{
    use Concerns\CreatesCounterWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCounterWorld();
        $this->app->instance(CurrencyConversionService::class, new CurrencyConversionService());   // the real rates, not the stand-in
        Schema::table('currencies', function ($t) { $t->decimal('conversion_rate', 18, 8)->default(1); });
        Schema::create('currency_rates', function ($t) { $t->id(); $t->unsignedBigInteger('currency_id'); $t->decimal('rate', 18, 8); $t->dateTime('effective_from'); $t->dateTime('created_at')->nullable(); });
        DB::table('currencies')->where('id', 1)->update(['conversion_rate' => 1]);
        DB::table('currencies')->insert([
            ['id' => 2, 'code' => 'USD', 'name' => 'US dollar', 'symbol' => '$', 'is_base' => false, 'is_active' => true, 'conversion_rate' => 130],
            ['id' => 3, 'code' => 'EUR', 'name' => 'Euro', 'symbol' => 'EUR', 'is_base' => false, 'is_active' => true, 'conversion_rate' => 140],
            ['id' => 4, 'code' => 'OLD', 'name' => 'Old money', 'symbol' => 'o', 'is_base' => false, 'is_active' => false, 'conversion_rate' => 2],
        ]);
    }

    private function counter(): CounterService
    {
        return app(CounterService::class);
    }

    private function dish(string $name, float $price, ?int $currency = null): Dish
    {
        $d = $this->make($name, $price);
        $this->stockDish($d, 50);
        $m = \App\Models\Menus\Menu::first() ?? app(MenuService::class)->save(['name' => 'All day']);
        $s = $m->sections()->first() ?? $m->sections()->create(['name' => 'Mains']);
        DB::table('menus_section_dishes')->insert(['section_id' => $s->id, 'dish_id' => $d->id]);
        if ($currency) {
            DB::table('menus_dishes')->where('id', $d->id)->update(['currency_id' => $currency]);
        }

        return $d->fresh();
    }

    private function in(array $dishes, array $o = []): array
    {
        return $o + ['items' => array_map(fn ($d) => ['dish_id' => $d->id, 'quantity' => 1], $dishes), 'service' => 'take_out', 'tenders' => [['payment_method_id' => 1, 'amount' => 100000]]];
    }

    private function on(): void
    {
        $this->runSqlScripts('213_menus_dish_currency.sql');
    }

    // ------------------------------------------------------------ 7.1 the dish's currency

    public function test_nothing_changes_until_script_213_has_been_run(): void
    {
        MenusSettings::save(['currency_id' => 2], null);
        $d = $this->dish('Pizza', 500);
        $this->assertFalse(MenuMoney::dishCurrencies());
        $q = $this->counter()->quote($this->in([$d]), $this->now);
        $this->assertSame([500.0, 'KES', []], [$q['subtotal'], $q['currency']['code'], $q['conversions']], 'still written in the base currency, still no conversion');
        $this->counter()->sell($this->in([$d]), null, $this->now);
        $this->assertSame(1, $this->placed[0]['currency_id']);
        $this->assertArrayNotHasKey('exchange_rate', $this->placed[0]);
    }

    public function test_a_dish_can_be_given_a_currency_or_have_it_taken_off_and_only_an_active_one(): void
    {
        $this->on();
        $d = app(DishService::class)->save(['name' => 'Burger', 'price' => 10, 'currency_id' => 2]);
        $this->assertSame(2, (int) $d->fresh()->currency_id);
        try {
            app(DishService::class)->save(['currency_id' => 4], $d->id);
            $this->fail('an inactive currency was accepted');
        } catch (BooksException $e) {
            $this->assertStringContainsString('not available', $e->getMessage());
        }
        app(DishService::class)->save(['currency_id' => null], $d->id);
        $this->assertNull($d->fresh()->currency_id, 'empty: the Menus currency');
    }

    public function test_the_margin_is_worked_out_in_the_base_currency(): void
    {
        $this->on();
        $d = $this->dish('Pasta', 10, 2);   // 10 USD = 1300 KES
        $info = app(\App\Services\Menus\DishInfo::class);
        $this->assertSame(10.0, $info->money($d, 1)['price'], 'the price stays as listed');
        $this->assertEqualsWithDelta(1300.0, app(MenuMoney::class)->priceInBase(10.0, $d), 0.001);
    }

    // ------------------------------------------------------------ 7.2 converted at the rate of the date

    public function test_a_dish_in_dollars_is_sold_in_shillings_at_the_rate_and_the_order_keeps_both(): void
    {
        $this->on();
        $usd = $this->dish('Steak', 10, 2);
        $kes = $this->dish('Chips', 200);
        $q = $this->counter()->quote($this->in([$usd, $kes]), $this->now);
        $this->assertSame([1500.0, 'KES'], [$q['subtotal'], $q['currency']['code']], '10 dollars at 130 and 200 shillings');

        $o = $this->counter()->sell($this->in([$usd, $kes]), null, $this->now);
        $line = MenuOrderLine::where('order_id', $o->id)->where('dish_id', $usd->id)->first();
        $this->assertSame([1300.0, 1300.0, 2, 10.0, 130.0], [(float) $line->unit_price, (float) $line->base_price, (int) $line->native_currency_id, (float) $line->native_price, (float) $line->native_rate], 'priced as converted, with what it was listed at and the rate');
        $plain = MenuOrderLine::where('order_id', $o->id)->where('dish_id', $kes->id)->first();
        $this->assertSame([null, null], [$plain->native_currency_id, $plain->native_price], 'a dish in the order\'s own currency is not converted');
        $this->assertSame(1, $this->placed[0]['currency_id']);
        $this->assertSame([1, 1500.0], [$o->fresh()->currency_id, (float) $o->fresh()->subtotal]);
    }

    public function test_the_receipt_says_what_the_dish_was_listed_at_and_the_rate(): void
    {
        $this->on();
        $usd = $this->dish('Steak', 10, 2);
        $o = $this->counter()->sell($this->in([$usd]), null, $this->now);
        $text = app(ReceiptService::class)->for($o->fresh())['text'];
        $this->assertStringContainsString('USD 10.00 at 130', $text);
    }

    public function test_the_quote_tells_the_customer_which_currencies_were_converted_and_at_what_rate(): void
    {
        $this->on();
        $q = $this->counter()->quote($this->in([$this->dish('Steak', 10, 2), $this->dish('Wine', 20, 3), $this->dish('Chips', 200)]), $this->now);
        $this->assertSame([['code' => 'USD', 'symbol' => '$', 'rate' => 130.0, 'to' => 'KES'], ['code' => 'EUR', 'symbol' => 'EUR', 'rate' => 140.0, 'to' => 'KES']], $q['conversions']);
    }

    public function test_the_rate_is_the_one_of_the_day_and_a_tab_keeps_what_each_round_was_ordered_at(): void
    {
        $this->on();
        DB::table('currency_rates')->insert([['currency_id' => 2, 'rate' => 120, 'effective_from' => '2026-10-01 00:00:00'], ['currency_id' => 2, 'rate' => 135, 'effective_from' => '2026-10-13 00:00:00']]);
        $usd = $this->dish('Steak', 10, 2);
        $tab = $this->counter()->openTab($this->in([$usd], ['service' => 'dine_in', 'label' => 'Table 2']), null, $this->now);
        $this->assertSame([1200.0], [(float) $tab->fresh()->lines()->first()->unit_price], 'ordered on the 12th at the rate of the 12th');

        Carbon::setTestNow(Carbon::parse('2026-10-13 12:00', 'Africa/Nairobi'));
        $this->counter()->addToTab($tab->fresh(), $this->in([$usd]), null, Carbon::now());
        $prices = $tab->fresh()->lines()->orderBy('id')->pluck('unit_price')->map(fn ($p) => (float) $p)->all();
        $this->assertSame([1200.0, 1350.0], $prices, 'the second round is at the new rate; the first is not touched');
        $this->assertSame(2550.0, $this->counter()->quoteTab($tab->fresh(), [])['subtotal']);
    }

    public function test_the_rounding_is_in_each_line_and_the_total_is_the_sum_of_the_lines(): void
    {
        $this->on();
        DB::table('currency_rates')->insert(['currency_id' => 2, 'rate' => 130.456, 'effective_from' => '2026-10-01 00:00:00']);
        $d = $this->dish('Tart', 3.33, 2);
        $unit = round(3.33 * 130.456, 2);   // 434.42: each portion is rounded once, as it is converted
        $q = $this->counter()->quote(['items' => [['dish_id' => $d->id, 'quantity' => 3]], 'service' => 'take_out'], $this->now);
        $this->assertSame(round($unit * 3, 2), $q['subtotal'], 'the line is the rounded portion times the count');
        $o = $this->counter()->sell(['items' => [['dish_id' => $d->id, 'quantity' => 3]], 'service' => 'take_out', 'tenders' => [['payment_method_id' => 1, 'amount' => 5000]]], null, $this->now);
        $this->assertSame([$unit], [(float) $o->lines()->first()->unit_price]);
        $this->assertSame([], array_values(array_filter($this->placed[0]['lines'], fn ($l) => ($l['type'] ?? '') === 'charge' && stripos((string) ($l['description'] ?? ''), 'round') !== false)));
    }

    public function test_when_the_menus_currency_is_not_the_base_the_order_is_written_in_it(): void
    {
        $this->on();
        MenusSettings::save(['currency_id' => 2], null);
        $own = $this->dish('Soda', 3);                // no currency of its own: the Menus currency, no conversion
        $shillings = $this->dish('Chips', 1300, 1);   // priced in the base currency: converted to dollars
        $q = $this->counter()->quote($this->in([$own, $shillings]), $this->now);
        $this->assertSame(['USD', 13.0], [$q['currency']['code'], $q['subtotal']], '3 dollars and 1300 shillings at 130');
        $this->counter()->sell($this->in([$own, $shillings], ['tenders' => [['payment_method_id' => 1, 'amount' => 100]]]), null, $this->now);
        $this->assertSame([2, 130.0], [$this->placed[0]['currency_id'], (float) $this->placed[0]['exchange_rate']], 'the voucher carries the currency and the rate it was converted at');
        $this->assertSame(2, (int) MenuOrder::first()->currency_id);
        $this->assertStringContainsString('TOTAL USD', app(ReceiptService::class)->for(MenuOrder::first())['text']);
    }

    // ------------------------------------------------------------ 7.4 what the customer sees

    public function test_the_menu_shows_each_dish_in_its_own_currency_and_the_one_the_order_is_in(): void
    {
        $this->on();
        $usd = $this->dish('Steak', 10, 2);
        $this->dish('Chips', 200);
        $menu = app(PublicMenu::class)->build($this->now, 1);
        $this->assertSame('KES', $menu['currency']['code']);
        $byName = collect($menu['menus'][0]['sections'][0]['dishes'])->keyBy('name');
        $this->assertSame(['USD', 10.0, null], [$byName['Steak']['currency']['code'], $byName['Steak']['price'], $byName['Chips']['currency']]);
    }
}
