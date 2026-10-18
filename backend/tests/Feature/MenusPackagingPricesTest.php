<?php

namespace Tests\Feature;

use App\Models\Currency;
use App\Models\Menus\IngredientKind;
use App\Models\Menus\PackagingPrice;
use App\Services\Books\BooksException;
use App\Services\Menus\IngredientKinds;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\PackagingPrices;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus packaging, build step 5.1 (script 207): the price of one unit of each item of the packaging kind. */
class MenusPackagingPricesTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private int $packaging;
    private int $supplies;
    private int $box;
    private int $bag;
    private int $soap;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        Schema::create('menus_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->json('settings')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::table('accounting_settings', function ($t) { $t->unsignedBigInteger('tips_payable_ledger_id')->nullable(); $t->unsignedBigInteger('default_sales_ledger_id')->nullable(); });
        $this->runSqlScripts('193_menus_config_foundation.sql', '207_menus_packaging_prices.sql');
        app(IngredientKinds::class)->seedDefaults();
        $this->packaging = (int) IngredientKind::where('code', 'packaging')->value('id');
        $this->supplies = (int) IngredientKind::where('code', 'supplies')->value('id');
        $this->box = $this->item('Container', $this->packaging);
        $this->bag = $this->item('Bag', $this->packaging);
        $this->soap = $this->item('Soap', $this->supplies);
        Schema::table('currencies', function ($t) { $t->boolean('is_active')->default(true); $t->string('name')->nullable(); });
        DB::table('currencies')->insert(['code' => 'KES', 'is_base' => true, 'is_active' => true]);
    }

    /** An ingredient of a kind with one variant of the same name; returns the variant's id. */
    private function item(string $name, int $kind): int
    {
        $this->makeIngredient($name, $this->each, null, [['name' => $name]], 'preferred', ['kind_id' => $kind]);

        return $this->itemId($name);
    }

    private function svc(): PackagingPrices
    {
        return app(PackagingPrices::class);
    }

    private function fails(callable $fn, string $part): void
    {
        try {
            $fn();
        } catch (BooksException $e) {
            $this->assertStringContainsString($part, $e->getMessage());

            return;
        }
        $this->fail("Expected: {$part}");
    }

    public function test_with_no_packaging_kind_chosen_nothing_can_be_priced(): void
    {
        $this->assertNull($this->svc()->all()['kind']);
        $this->assertSame([], $this->svc()->all()['items']);
        $this->fails(fn () => $this->svc()->save([['item_id' => $this->box, 'price' => 10]]), 'Choose which kind of ingredient is packaging');
    }

    public function test_the_items_of_the_packaging_kind_are_listed_and_priced_one_unit_at_a_time(): void
    {
        MenusSettings::save(['packaging_kind_id' => $this->packaging], null);
        $list = $this->svc()->all();
        $this->assertSame([$this->packaging, ['Bag', 'Container']], [$list['kind']['id'], array_column($list['items'], 'name')], 'only the packaging kind, by name');
        $list = $this->svc()->save([['item_id' => $this->box, 'price' => 15, 'currency_id' => 1], ['item_id' => $this->bag, 'price' => '5.5']]);
        $byName = array_column($list['items'], null, 'name');
        $this->assertSame([15.0, 1, 5.5, null, 'each'], [$byName['Container']['price'], $byName['Container']['currency_id'], $byName['Bag']['price'], $byName['Bag']['currency_id'], $byName['Bag']['unit']]);
        $this->assertSame(['price' => 5.5, 'currency_id' => null, 'ledger_id' => null], $this->svc()->priceOf($this->bag), 'no Menus currency and no sales account: the base currency, the books\' default');
    }

    public function test_an_empty_price_takes_an_item_off_the_list_and_a_bad_one_is_refused(): void
    {
        MenusSettings::save(['packaging_kind_id' => $this->packaging], null);
        $this->svc()->save([['item_id' => $this->box, 'price' => 15], ['item_id' => $this->bag, 'price' => 5]]);
        $this->svc()->save([['item_id' => $this->box, 'price' => '']]);
        $this->assertSame([$this->bag], PackagingPrice::pluck('item_id')->map(fn ($i) => (int) $i)->all(), 'the bag was not sent, so it stays');
        $this->fails(fn () => $this->svc()->save([['item_id' => $this->box, 'price' => 0]]), 'must be more than nothing');
        $this->fails(fn () => $this->svc()->save([['item_id' => $this->box, 'price' => -3]]), 'must be more than nothing');
        $this->fails(fn () => $this->svc()->save([['item_id' => $this->box, 'price' => 5, 'currency_id' => 999]]), 'not available');
        $this->fails(fn () => $this->svc()->save([['item_id' => $this->box, 'price' => 5], ['item_id' => $this->box, 'price' => 6]]), 'listed twice');
        $this->fails(fn () => $this->svc()->save([['item_id' => 9999, 'price' => 5]]), 'not there any more');
        $this->assertSame([$this->bag], PackagingPrice::pluck('item_id')->map(fn ($i) => (int) $i)->all(), 'a refused save changes nothing');
    }

    public function test_an_item_of_another_kind_cannot_be_priced(): void
    {
        MenusSettings::save(['packaging_kind_id' => $this->packaging], null);
        $this->fails(fn () => $this->svc()->save([['item_id' => $this->soap, 'price' => 5]]), 'is not of the kind');
        $this->assertSame(0, PackagingPrice::count());
    }

    public function test_when_the_kind_changes_or_an_item_moves_its_price_is_kept_but_greyed_and_not_used(): void
    {
        MenusSettings::save(['packaging_kind_id' => $this->packaging], null);
        $this->svc()->save([['item_id' => $this->box, 'price' => 15], ['item_id' => $this->bag, 'price' => 5]]);
        // the bag moves to another kind
        DB::table('menus_ingredients')->where('name', 'Bag')->update(['kind_id' => $this->supplies]);
        $list = $this->svc()->all();
        $this->assertSame([['Container', false], ['Bag', true]], array_map(fn ($i) => [$i['name'], $i['grey']], $list['items']), 'the bag is kept, greyed, after the live ones');
        $this->assertNull($this->svc()->priceOf($this->bag));
        $this->assertNotNull($this->svc()->priceOf($this->box));
        $this->fails(fn () => $this->svc()->save([['item_id' => $this->bag, 'price' => 9]]), 'is not of the kind');
        // the packaging kind itself changes
        MenusSettings::save(['packaging_kind_id' => $this->supplies], null);
        $grey = array_column($this->svc()->all()['items'], 'grey', 'name');
        $this->assertSame(['Bag' => false, 'Soap' => false, 'Container' => true], $grey, 'supplies are live now, and the container is greyed');
        $this->assertSame(5.0, $this->svc()->priceOf($this->bag)['price'], 'the bag is back in the packaging kind, and its price with it');
        // back again
        MenusSettings::save(['packaging_kind_id' => $this->packaging], null);
        $this->assertSame(15.0, $this->svc()->priceOf($this->box)['price']);
        $this->assertSame(15.0, array_column($this->svc()->all()['items'], 'price', 'name')['Container']);
    }

    public function test_a_switched_off_price_is_not_used_and_the_currency_and_account_follow_the_settings(): void
    {
        MenusSettings::save(['packaging_kind_id' => $this->packaging], null);
        $this->svc()->save([['item_id' => $this->box, 'price' => 15, 'is_active' => false]]);
        $this->assertNull($this->svc()->priceOf($this->box));
        $this->svc()->save([['item_id' => $this->box, 'price' => 15]]);
        $usd = Currency::create(['code' => 'USD', 'is_base' => false, 'is_active' => true]);
        DB::table('menus_settings')->where('id', 1)->update(['settings' => json_encode(['packaging_kind_id' => $this->packaging, 'currency_id' => $usd->id, 'packaging_sales_ledger_id' => $this->supplier])]);
        $this->assertSame(['price' => 15.0, 'currency_id' => (int) $usd->id, 'ledger_id' => $this->supplier], $this->svc()->priceOf($this->box), 'the Menus currency and the packaging account when the row names none');
    }

    public function test_before_script_207_saving_says_which_script(): void
    {
        Schema::drop('menus_packaging_prices');
        $this->assertFalse(PackagingPrices::installed());
        $this->assertFalse($this->svc()->all()['ready']);
        $this->fails(fn () => $this->svc()->save([]), '207_menus_packaging_prices');
        $this->assertNull($this->svc()->priceOf($this->box));
    }
}
