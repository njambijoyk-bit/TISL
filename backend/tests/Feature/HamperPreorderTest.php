<?php

namespace Tests\Feature;

use App\Models\Books\Voucher;
use App\Models\Campaign;
use App\Models\CampaignItem;
use App\Models\Hamper;
use App\Models\ProductVariant;
use App\Services\Books\BooksException;
use App\Services\Licensing\LicenseManager;
use App\Services\Location\VariantStockService;
use App\Services\Preorders\PreorderService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * A hamper is preordered through its components (docs/PREORDER_PLAN.md decision 10): it is "buy" when every component is in stock at the hamper's branch,
 * "preorder" when what is short has an open offer in a live campaign that features the hamper, otherwise "out" (or "coming soon").
 * In-memory tables stand in for the real ones (the repo builds its database from SQL scripts).
 */
class HamperPreorderTest extends TestCase
{
    private const BRANCH = 1;

    private Campaign $campaign;
    private Hamper $hamper;
    private PreorderService $svc;
    /** @var array<string,int> */
    private array $v = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->mock(LicenseManager::class, fn ($m) => $m->shouldReceive('isActive')->andReturn(true));
        $this->partialMock(VariantStockService::class, fn ($m) => $m->shouldReceive('recomputeCaches')->andReturnNull());
        config(['cache.default' => 'array']);

        Schema::create('products', function ($t) { $t->id(); $t->string('name'); $t->string('sku')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('product_variants', function ($t) { $t->id(); $t->unsignedBigInteger('product_id'); $t->string('name')->nullable(); $t->string('sku')->nullable(); $t->boolean('is_default')->default(false); $t->string('status')->default('active'); $t->softDeletes(); $t->timestamps(); });
        Schema::create('variant_location_stock', function ($t) { $t->id(); $t->unsignedBigInteger('product_variant_id'); $t->unsignedBigInteger('location_id'); $t->decimal('quantity', 12, 4)->default(0); $t->decimal('reorder_level', 12, 4)->nullable(); $t->boolean('preorder_enabled')->default(false); $t->timestamps(); });
        Schema::create('campaigns', function ($t) { $t->id(); $t->string('slug'); $t->string('title'); $t->string('type')->default('awareness_sale'); $t->string('goal')->default('sales'); $t->dateTime('starts_at')->nullable(); $t->dateTime('ends_at')->nullable(); $t->dateTime('teaser_at')->nullable(); $t->dateTime('early_access_at')->nullable(); $t->json('early_access_audience')->nullable(); $t->dateTime('published_at')->nullable(); $t->boolean('is_published')->default(true); $t->boolean('is_paused')->default(false); $t->dateTime('archived_at')->nullable(); $t->json('audience_rule')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('campaign_items', function ($t) { $t->id(); $t->unsignedBigInteger('campaign_id'); $t->unsignedBigInteger('section_id')->nullable(); $t->string('item_type'); $t->unsignedBigInteger('item_id'); $t->unsignedBigInteger('variant_id')->default(0); $t->integer('position')->default(0); $t->dateTime('available_from')->nullable(); $t->string('label_override')->nullable(); $t->timestamps(); });
        Schema::create('hampers', function ($t) { $t->id(); $t->string('name'); $t->string('slug')->nullable(); $t->decimal('price', 12, 2)->default(0); $t->string('status')->default('active'); $t->boolean('is_visible')->default(true); $t->unsignedBigInteger('location_id')->nullable(); $t->timestamps(); });
        Schema::create('hamper_items', function ($t) { $t->id(); $t->unsignedBigInteger('hamper_id'); $t->unsignedBigInteger('product_id'); $t->unsignedBigInteger('variant_id')->nullable(); $t->integer('quantity')->default(1); $t->decimal('sale_price', 12, 2)->nullable(); $t->json('snapshot')->nullable(); });
        Schema::create('preorder_offers', function ($t) { $t->id(); $t->unsignedBigInteger('campaign_id'); $t->unsignedBigInteger('product_id'); $t->unsignedBigInteger('variant_id'); $t->unsignedInteger('limit_total')->nullable(); $t->dateTime('closes_at')->nullable(); $t->date('expected_from')->nullable(); $t->date('expected_until')->nullable(); $t->string('terms', 500)->nullable(); $t->boolean('is_active')->default(true); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps(); });
        Schema::create('preorder_lines', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('offer_id'); $t->unsignedBigInteger('variant_id'); $t->unsignedBigInteger('location_id'); $t->date('promised_date')->nullable(); $t->timestamp('created_at')->nullable(); });
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('base_type'); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('status')->default('posted'); $t->unsignedBigInteger('source_voucher_id')->nullable(); $t->date('date')->nullable(); $t->string('voucher_number')->nullable(); });
        Schema::create('voucher_items', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('variant_id')->nullable(); $t->boolean('is_header')->default(false); $t->decimal('quantity', 12, 4)->default(0); $t->decimal('unit_factor', 12, 4)->default(1); $t->decimal('delivered_quantity', 12, 4)->default(0); $t->unsignedBigInteger('source_item_id')->nullable(); $t->decimal('amount', 12, 2)->default(0); });
        PreorderService::ready();

        $this->svc = app(PreorderService::class);
        $this->campaign = Campaign::create(['slug' => 'box', 'title' => 'Gift box drop', 'starts_at' => now()->subDay(), 'published_at' => now()->subDay()]);
        // a hamper holding 2 mugs and 1 candle, at branch 1
        $this->hamper = Hamper::create(['name' => 'Cosy box', 'slug' => 'cosy', 'price' => 1000, 'location_id' => self::BRANCH]);
        $this->v['mug'] = $this->makeComponent('Mug', 2, stock: 10);
        $this->v['candle'] = $this->makeComponent('Candle', 1, stock: 10);
        CampaignItem::create(['campaign_id' => $this->campaign->id, 'item_type' => 'hamper', 'item_id' => $this->hamper->id]);
    }

    private function makeComponent(string $name, int $per, float $stock, bool $branchOn = true): int
    {
        $pid = DB::table('products')->insertGetId(['name' => $name]);
        $vid = DB::table('product_variants')->insertGetId(['product_id' => $pid, 'name' => $name, 'is_default' => true]);
        DB::table('variant_location_stock')->insert(['product_variant_id' => $vid, 'location_id' => self::BRANCH, 'quantity' => $stock, 'preorder_enabled' => $branchOn]);
        DB::table('hamper_items')->insert(['hamper_id' => $this->hamper->id ?? 1, 'product_id' => $pid, 'variant_id' => $vid, 'quantity' => $per]);

        return $vid;
    }

    private function stock(string $key, float $qty): void
    {
        DB::table('variant_location_stock')->where('product_variant_id', $this->v[$key])->update(['quantity' => $qty]);
    }

    private function offer(string $key, array $over = [], ?Campaign $c = null): void
    {
        $vid = $this->v[$key];
        DB::table('preorder_offers')->insert($over + ['campaign_id' => ($c ?? $this->campaign)->id, 'product_id' => ProductVariant::find($vid)->product_id, 'variant_id' => $vid, 'is_active' => true]);
    }

    public function test_every_component_in_stock_is_a_normal_buy(): void
    {
        $this->assertSame('buy', $this->svc->hamperState($this->hamper, null)['state']);
    }

    public function test_a_short_component_with_no_offer_blocks_the_hamper_and_is_named(): void
    {
        $this->stock('candle', 0);
        $st = $this->svc->hamperState($this->hamper, null);
        $this->assertSame('out', $st['state']);
        $this->assertSame(['Candle'], $st['blocked']);
    }

    public function test_a_short_component_with_an_open_offer_makes_the_hamper_a_preorder(): void
    {
        $this->stock('mug', 1);   // needs 2
        $this->offer('mug', ['limit_total' => 10, 'expected_until' => '2026-12-01']);
        $st = $this->svc->hamperState($this->hamper, null);
        $this->assertSame('preorder', $st['state']);
        $this->assertSame(5, $st['offer']['places_left']);   // 10 mugs / 2 per hamper
        $this->assertSame('2026-12-01', $st['offer']['expected_until']);
    }

    public function test_the_fewest_places_and_the_latest_date_win_when_two_components_are_short(): void
    {
        $this->stock('mug', 0);
        $this->stock('candle', 0);
        $this->offer('mug', ['limit_total' => 10, 'expected_until' => '2026-12-01']);
        $this->offer('candle', ['limit_total' => 3, 'expected_until' => '2027-01-15']);
        $st = $this->svc->hamperState($this->hamper, null)['offer'];
        $this->assertSame(3, $st['places_left']);
        $this->assertSame('2027-01-15', $st['expected_until']);
    }

    public function test_an_offer_in_a_campaign_that_does_not_feature_the_hamper_does_not_count(): void
    {
        $other = Campaign::create(['slug' => 'other', 'title' => 'Other', 'starts_at' => now()->subDay(), 'published_at' => now()->subDay()]);
        $this->stock('candle', 0);
        $this->offer('candle', [], $other);
        $this->assertSame('out', $this->svc->hamperState($this->hamper, null)['state']);
    }

    public function test_the_branch_switch_must_be_on_for_the_makeComponent(): void
    {
        $this->stock('candle', 0);
        $this->offer('candle');
        DB::table('variant_location_stock')->where('product_variant_id', $this->v['candle'])->update(['preorder_enabled' => false]);
        $this->assertSame('out', $this->svc->hamperState($this->hamper, null)['state']);
    }

    public function test_a_closed_or_switched_off_offer_blocks_it(): void
    {
        $this->stock('candle', 0);
        $this->offer('candle', ['closes_at' => now()->subHour()]);
        $this->assertSame('out', $this->svc->hamperState($this->hamper, null)['state']);
    }

    public function test_an_offer_whose_campaign_has_not_started_shows_coming_soon(): void
    {
        $this->campaign->update(['starts_at' => now()->addDays(3)]);
        $this->stock('candle', 0);
        $this->offer('candle');
        $this->assertSame('coming_soon', $this->svc->hamperState($this->hamper->fresh(), null)['state']);
    }

    public function test_a_new_offer_may_be_made_on_a_component_of_a_featured_hamper(): void
    {
        $this->stock('candle', 0);
        $variant = ProductVariant::findOrFail($this->v['candle']);
        $this->assertTrue($this->svc->featured($this->campaign, $variant));
        $other = Campaign::create(['slug' => 'other', 'title' => 'Other', 'starts_at' => now()->subDay(), 'published_at' => now()->subDay()]);
        $this->assertFalse($this->svc->featured($other, $variant));
    }

    public function test_placing_sets_aside_what_is_in_stock_and_takes_an_offer_for_what_is_short(): void
    {
        $this->stock('mug', 1);
        $this->offer('mug', ['limit_total' => 10]);
        $lines = $this->svc->hamperLines($this->hamper, 2);   // 4 mugs, 2 candles
        $placed = $this->svc->assertPlaceable($lines, self::BRANCH, null);

        $this->assertNotNull($placed[$this->v['mug'] . '@1']['offer']);
        $this->assertNull($placed[$this->v['candle'] . '@1']['offer'], 'candles are in stock: only set aside');

        $order = (new Voucher)->forceFill(['id' => 77]);
        $this->svc->record($order, $placed, self::BRANCH);
        $this->assertSame(0, (int) DB::table('preorder_lines')->where('variant_id', $this->v['candle'])->value('offer_id'));
        $this->assertGreaterThan(0, (int) DB::table('preorder_lines')->where('variant_id', $this->v['mug'])->value('offer_id'));
    }

    public function test_a_candle_set_aside_inside_a_hamper_is_no_longer_buyable_by_anyone_else(): void
    {
        $this->stock('mug', 0);
        $this->offer('mug');
        $placed = $this->svc->assertPlaceable($this->svc->hamperLines($this->hamper, 4), self::BRANCH, null);   // 4 candles of 10
        $oid = DB::table('vouchers')->insertGetId(['status' => 'posted', 'date' => today()]);
        foreach ([$this->v['mug'] => 8, $this->v['candle'] => 4] as $vid => $q) {
            DB::table('voucher_items')->insert(['voucher_id' => $oid, 'variant_id' => $vid, 'quantity' => $q]);
        }
        $this->svc->record((new Voucher)->forceFill(['id' => $oid]), $placed, self::BRANCH);

        $this->assertSame(6.0, $this->svc->buyable($this->v['candle'], self::BRANCH));
        // one delivered candle comes off what is owed
        DB::table('voucher_items')->where('variant_id', $this->v['candle'])->update(['delivered_quantity' => 1]);
        $this->assertSame(3.0, $this->svc->committed($this->v['candle'], self::BRANCH));
    }

    public function test_more_hampers_than_places_are_refused(): void
    {
        $this->stock('mug', 0);
        $this->offer('mug', ['limit_total' => 6]);   // 3 hampers
        $this->svc->assertPlaceable($this->svc->hamperLines($this->hamper, 3), self::BRANCH, null);
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('Only 6 places left for Mug');
        $this->svc->assertPlaceable($this->svc->hamperLines($this->hamper, 4), self::BRANCH, null);
    }

    public function test_the_refusal_names_the_hamper_and_the_makeComponent(): void
    {
        $this->stock('candle', 0);
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage("Cosy box can't be preordered right now: Candle");
        $this->svc->assertPlaceable($this->svc->hamperLines($this->hamper, 1), self::BRANCH, null);
    }

    public function test_a_plain_product_line_in_stock_is_still_refused_as_before(): void
    {
        $this->offer('mug');
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('is in stock now');
        $this->svc->assertPlaceable([['variant_id' => $this->v['mug'], 'quantity' => 1]], self::BRANCH, null);
    }

    public function test_readiness_tells_the_editor_what_covers_each_makeComponent(): void
    {
        $this->stock('mug', 0);
        $this->stock('candle', 0);
        $this->offer('mug');
        $r = $this->svc->hamperReadiness($this->campaign, $this->hamper);
        $this->assertSame('out', $r['state']);
        $by = collect($r['components'])->keyBy('item');
        $this->assertSame('offer', $by['Mug']['covered']);
        $this->assertSame('none', $by['Candle']['covered']);
        $this->offer('candle');
        $this->assertSame('preorder', $this->svc->hamperReadiness($this->campaign, $this->hamper)['state']);
    }
}
