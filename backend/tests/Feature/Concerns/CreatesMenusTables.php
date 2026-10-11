<?php

namespace Tests\Feature\Concerns;

use App\Models\Location;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** The small set of tables the Menus tests share: units, products and variants, one branch, batches and balances, ingredient families. */
trait CreatesMenusTables
{
    private int $g;
    private int $kg;
    private int $each;
    private int $ml;
    private int $l;
    private const BRANCH = 1;

    protected function createMenusTables(): void
    {
        Schema::create('units_of_measure', function ($t) { $t->id(); $t->string('code'); $t->string('name'); $t->string('dimension'); $t->string('unit_system')->nullable(); $t->decimal('to_base_factor', 18, 10)->default(1); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('products', function ($t) { $t->id(); $t->string('name'); $t->boolean('is_for_sale')->default(true); $t->boolean('is_visible')->default(true); $t->softDeletes(); $t->timestamps(); });
        Schema::create('product_variants', function ($t) { $t->id(); $t->unsignedBigInteger('product_id'); $t->string('name')->nullable(); $t->string('sku')->nullable(); $t->decimal('net_content_qty', 18, 4)->nullable(); $t->unsignedBigInteger('net_content_unit_id')->nullable(); $t->timestamps(); });
        Schema::create('locations', function ($t) { $t->id(); $t->string('name'); $t->boolean('is_active')->default(true); $t->boolean('is_default')->default(false); });
        Schema::create('stock_batches', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id'); $t->string('status')->default('active'); $t->date('expiry_date')->nullable(); $t->decimal('unit_cost', 18, 4)->default(0); });
        Schema::create('stock_batch_balances', function ($t) { $t->unsignedBigInteger('batch_id'); $t->unsignedBigInteger('location_id'); $t->decimal('quantity', 18, 4)->default(0); });
        Schema::create('menus_ingredient_families', function ($t) { $t->id(); $t->string('name')->unique(); $t->unsignedBigInteger('unit_id'); $t->string('pick_rule', 16)->default('preferred'); $t->json('allergens')->nullable(); $t->json('tags')->nullable(); $t->string('notes')->nullable(); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('menus_ingredient_variants', function ($t) { $t->id(); $t->unsignedBigInteger('family_id'); $t->unsignedBigInteger('variant_id')->unique(); $t->unsignedSmallInteger('rank')->default(1); $t->decimal('units_per_stock', 18, 6)->default(1); $t->boolean('is_allowed')->default(true); $t->boolean('sell_retail')->default(false); $t->timestamps(); });
        DB::table('locations')->insert(['id' => self::BRANCH, 'name' => 'Kitchen', 'is_default' => true]);
        $this->g = DB::table('units_of_measure')->insertGetId(['code' => 'g', 'name' => 'Gram', 'dimension' => 'mass', 'to_base_factor' => 1]);
        $this->kg = DB::table('units_of_measure')->insertGetId(['code' => 'kg', 'name' => 'Kilogram', 'dimension' => 'mass', 'to_base_factor' => 1000]);
        $this->each = DB::table('units_of_measure')->insertGetId(['code' => 'each', 'name' => 'Each', 'dimension' => 'count', 'to_base_factor' => 1]);
        $this->ml = DB::table('units_of_measure')->insertGetId(['code' => 'ml', 'name' => 'Millilitre', 'dimension' => 'volume', 'to_base_factor' => 0.001]);
        $this->l = DB::table('units_of_measure')->insertGetId(['code' => 'l', 'name' => 'Litre', 'dimension' => 'volume', 'to_base_factor' => 1]);
        Location::forgetCapabilities();
    }

    protected function item(string $product, ?string $variant = null, array $extra = []): int
    {
        $p = DB::table('products')->where('name', $product)->value('id') ?? DB::table('products')->insertGetId(['name' => $product]);

        return DB::table('product_variants')->insertGetId(['product_id' => $p, 'name' => $variant] + $extra);
    }

    protected function stock(int $variant, float $qty, float $cost = 100, ?string $expiry = null, string $status = 'active'): int
    {
        $b = DB::table('stock_batches')->insertGetId(['variant_id' => $variant, 'status' => $status, 'expiry_date' => $expiry, 'unit_cost' => $cost]);
        DB::table('stock_batch_balances')->insert(['batch_id' => $b, 'location_id' => self::BRANCH, 'quantity' => $qty]);

        return $b;
    }

}
