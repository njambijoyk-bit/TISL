<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\MenusIngredientController;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Menus → Ingredients: a stock item can be made on the spot, so a kitchen does not need the E-commerce module's Products screens. */
class MenusIngredientItemsTest extends TestCase
{
    use Concerns\CreatesDishTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createDishTables();
    }

    private function make(array $body)
    {
        return app(MenusIngredientController::class)->stockItem(Request::create('/x', 'POST', $body));
    }

    public function test_a_stock_item_is_an_ordinary_product_kept_out_of_the_shop_and_not_for_sale(): void
    {
        $res = $this->make(['name' => 'Exe Flour 2 kg', 'unit_id' => $this->kg, 'expires' => true]);
        $this->assertSame(201, $res->getStatusCode());
        $item = $res->getData(true)['item'];

        $product = Product::findOrFail(DB::table('product_variants')->where('id', $item['variant_id'])->value('product_id'));
        $this->assertSame('ingredient', $product->type);
        $this->assertFalse((bool) $product->is_visible);
        $this->assertFalse((bool) $product->is_for_sale);
        $this->assertSame('active', $product->status, 'active, so Purchases and the stock item search find it');
        $this->assertTrue((bool) $product->track_expiry);
        $this->assertSame($this->kg, (int) $product->default_unit_id);
        $this->assertSame($this->kg, (int) DB::table('product_variant_units')->where('variant_id', $item['variant_id'])->where('role', 'base')->value('unit_id'), 'counted in the unit chosen');
        $this->assertSame('Exe Flour 2 kg', $item['product']);
    }

    public function test_a_name_already_in_use_is_refused_and_nothing_is_made(): void
    {
        $this->make(['name' => 'Eggs tray of 30', 'unit_id' => $this->g]);
        $before = Product::count();
        $res = $this->make(['name' => 'EGGS TRAY OF 30', 'unit_id' => $this->g]);
        $this->assertSame(422, $res->getStatusCode());
        $this->assertStringContainsString('already a stock item', $res->getData(true)['message']);
        $this->assertSame($before, Product::count());
    }

    public function test_it_needs_a_name_and_a_live_unit(): void
    {
        try {
            $this->make(['name' => '   ', 'unit_id' => $this->g]);
            $this->fail('a blank name was accepted');
        } catch (\Illuminate\Validation\ValidationException $e) {
            $this->assertArrayHasKey('name', $e->errors());
        }
        DB::table('units_of_measure')->where('id', $this->g)->update(['is_active' => false]);
        $this->assertSame(422, $this->make(['name' => 'Salt', 'unit_id' => $this->g])->getStatusCode());
        $this->assertSame(0, Product::count());
    }
}
