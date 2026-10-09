<?php

namespace Tests\Feature;

use App\Models\Campaign;
use App\Models\CampaignItem;
use App\Models\ProductVariant;
use App\Services\Campaigns\CampaignAttribution;
use App\Services\Campaigns\CampaignPage;
use App\Services\Campaigns\CampaignStats;
use App\Services\Campaigns\CatalogueAdapter;
use App\Services\Licensing\LicenseManager;
use App\Services\Preorders\PreorderService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * A campaign can feature ONE option of a product (script 106). In-memory tables stand in for the real ones (the repo builds its database from SQL scripts).
 * Rules under test: options of one product can be featured side by side; a product is featured whole OR by option, never both; an option must belong to its product
 * and be active; sales and attribution for an option count only that option; a new preorder offer needs a featured option.
 */
class CampaignItemVariantsTest extends TestCase
{
    private Campaign $campaign;

    protected function setUp(): void
    {
        parent::setUp();
        $this->mock(LicenseManager::class, fn ($m) => $m->shouldReceive('isActive')->andReturn(true));
        config(['cache.default' => 'array']);

        Schema::create('currencies', function ($t) { $t->id(); $t->string('code'); $t->boolean('is_base')->default(false); });
        DB::table('currencies')->insert(['id' => 1, 'code' => 'KES', 'is_base' => true]);
        Schema::create('products', function ($t) { $t->id(); $t->string('name'); $t->string('sku')->nullable(); $t->decimal('price', 12, 2)->default(0); $t->unsignedBigInteger('currency_id')->nullable(); $t->string('main_image')->nullable(); $t->string('status')->default('active'); $t->softDeletes(); $t->timestamps(); });
        Schema::create('product_variants', function ($t) { $t->id(); $t->unsignedBigInteger('product_id'); $t->string('sku')->nullable(); $t->string('barcode')->nullable(); $t->string('name')->nullable(); $t->string('combination_key')->nullable(); $t->boolean('is_default')->default(false); $t->decimal('net_content_qty', 12, 4)->nullable(); $t->unsignedBigInteger('net_content_unit_id')->nullable(); $t->decimal('stock_quantity', 12, 4)->default(0); $t->string('status')->default('active'); $t->softDeletes(); $t->timestamps(); });
        Schema::create('product_variant_units', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id'); $t->string('role')->default('base'); $t->decimal('price', 12, 2)->nullable(); $t->decimal('base_factor', 12, 4)->default(1); $t->integer('position')->default(0); $t->timestamps(); });
        Schema::create('product_images', function ($t) { $t->id(); $t->unsignedBigInteger('product_id')->nullable(); $t->unsignedBigInteger('option_value_id')->nullable(); $t->unsignedBigInteger('variant_id')->nullable(); $t->string('path'); $t->string('alt_text')->nullable(); $t->integer('position')->default(0); $t->boolean('is_primary')->default(false); $t->timestamps(); });
        Schema::create('campaigns', function ($t) { $t->id(); $t->string('slug'); $t->string('title'); $t->string('type')->default('awareness_sale'); $t->string('goal')->default('sales'); $t->dateTime('starts_at')->nullable(); $t->dateTime('ends_at')->nullable(); $t->dateTime('published_at')->nullable(); $t->boolean('is_published')->default(true); $t->boolean('is_paused')->default(false); $t->dateTime('archived_at')->nullable(); $t->json('audience_rule')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('campaign_sections', function ($t) { $t->id(); $t->unsignedBigInteger('campaign_id'); $t->integer('position')->default(0); $t->string('type'); $t->json('settings')->nullable(); $t->dateTime('show_from')->nullable(); $t->dateTime('show_until')->nullable(); $t->json('audience_rule')->nullable(); $t->timestamps(); });
        Schema::create('campaign_items', function ($t) {
            $t->id(); $t->unsignedBigInteger('campaign_id'); $t->unsignedBigInteger('section_id')->nullable(); $t->string('item_type'); $t->unsignedBigInteger('item_id'); $t->unsignedBigInteger('variant_id')->default(0);
            $t->integer('position')->default(0); $t->dateTime('available_from')->nullable(); $t->string('label_override')->nullable(); $t->timestamps();
            $t->unique(['campaign_id', 'item_type', 'item_id', 'variant_id']);
        });
        CampaignItem::hasVariants();   // true now that the column exists

        $this->campaign = Campaign::create(['slug' => 'drop', 'title' => 'The drop', 'starts_at' => now()->subDays(3), 'published_at' => now()->subDays(3)]);
    }

    private function product(string $name, array $options = []): array
    {
        $pid = DB::table('products')->insertGetId(['name' => $name, 'sku' => strtoupper(substr($name, 0, 3)), 'price' => 1000, 'currency_id' => 1]);
        $ids = [];
        foreach ($options as $label => [$price, $status]) {
            $vid = DB::table('product_variants')->insertGetId(['product_id' => $pid, 'name' => $label, 'sku' => "S-{$label}", 'status' => $status, 'stock_quantity' => 5]);
            DB::table('product_variant_units')->insert(['variant_id' => $vid, 'role' => 'base', 'price' => $price]);
            $ids[$label] = $vid;
        }

        return [$pid, $ids];
    }

    private function save(array $items): void
    {
        app(CampaignPage::class)->save($this->campaign, [['type' => 'products', 'settings' => ['heading' => 'Shop'], 'items' => $items]]);
    }

    private function item(int $pid, int $variant = 0): array
    {
        return ['item_type' => 'product', 'item_id' => $pid, 'variant_id' => $variant];
    }

    private function refused(array $items, string $contains): void
    {
        try {
            $this->save($items);
            $this->fail('Expected a refusal containing: ' . $contains);
        } catch (ValidationException $e) {
            $this->assertStringContainsString($contains, implode(' ', $e->errors()['sections']));
        }
    }

    public function test_two_options_of_one_product_can_be_featured_side_by_side(): void
    {
        [$p, $v] = $this->product('Tee', ['Red' => [1200, 'active'], 'Blue' => [1300, 'active']]);
        $this->save([$this->item($p, $v['Red']), $this->item($p, $v['Blue'])]);
        $this->assertSame([$v['Red'], $v['Blue']], $this->campaign->items()->pluck('variant_id')->map(fn ($x) => (int) $x)->all());
    }

    public function test_a_product_is_featured_whole_or_by_option_never_both(): void
    {
        [$p, $v] = $this->product('Tee', ['Red' => [1200, 'active']]);
        $this->refused([$this->item($p), $this->item($p, $v['Red'])], 'whole and by option');
    }

    public function test_the_same_option_twice_is_refused(): void
    {
        [$p, $v] = $this->product('Tee', ['Red' => [1200, 'active']]);
        $this->refused([$this->item($p, $v['Red']), $this->item($p, $v['Red'])], 'featured twice');
    }

    public function test_an_option_must_belong_to_its_product_and_be_active(): void
    {
        [$p1, $v1] = $this->product('Tee', ['Red' => [1200, 'active']]);
        [$p2, $v2] = $this->product('Cap', ['Black' => [500, 'active'], 'Gone' => [500, 'inactive']]);
        $this->refused([$this->item($p1, $v2['Black'])], 'does not belong');
        $this->refused([$this->item($p2, $v2['Gone'])], 'no longer exists, or is switched off');
        $this->refused([['item_type' => 'service', 'item_id' => 3, 'variant_id' => 9]], 'Only a product can be featured by one of its options');
    }

    public function test_saving_again_replaces_what_is_not_sent(): void
    {
        [$p, $v] = $this->product('Tee', ['Red' => [1200, 'active'], 'Blue' => [1300, 'active']]);
        $this->save([$this->item($p, $v['Red']), $this->item($p, $v['Blue'])]);
        $this->save([$this->item($p, $v['Blue'])]);
        $this->assertSame([$v['Blue']], $this->campaign->items()->pluck('variant_id')->map(fn ($x) => (int) $x)->all());
    }

    public function test_an_option_is_described_with_its_own_label_price_photo_and_link(): void
    {
        [$p, $v] = $this->product('Tee', ['Red' => [1200, 'active']]);
        DB::table('product_images')->insert(['product_id' => $p, 'variant_id' => $v['Red'], 'path' => '/storage/products/red.jpg']);
        $d = app(CatalogueAdapter::class)->describe([$this->item($p, $v['Red']), $this->item($p)]);

        $opt = $d["product:{$p}:v{$v['Red']}"];
        $this->assertSame(['Tee', 'Red', 1200.0, '/storage/products/red.jpg', true], [$opt['name'], $opt['variant'], $opt['price'], $opt['image'], $opt['available']]);
        $this->assertStringEndsWith("?variant={$v['Red']}", $opt['link']);
        $this->assertSame(1000.0, $d["product:{$p}"]['price']);              // the whole product is unchanged
        $this->assertCount(1, app(CatalogueAdapter::class)->variants($p));
    }

    public function test_attribution_credits_a_featured_option_only_for_that_option(): void
    {
        [$p, $v] = $this->product('Tee', ['Red' => [1200, 'active'], 'Blue' => [1300, 'active']]);
        $this->save([$this->item($p, $v['Red'])]);
        $claim = ['campaign' => 'drop', 'at' => now()->subHour()->toIso8601String()];
        $a = app(CampaignAttribution::class);

        $this->assertNull($a->resolve($claim, [['product_id' => $p, 'variant_id' => $v['Blue']]]));
        $hit = $a->resolve($claim, [['product_id' => $p, 'variant_id' => $v['Red']]]);
        $this->assertSame([$this->campaign->id, $v['Red']], [$hit['campaign_id'], $hit['variant_id']]);

        $this->campaign->items()->delete();
        $this->save([$this->item($p)]);                                          // featured whole: any option counts
        $this->assertNotNull($a->resolve($claim, [['product_id' => $p, 'variant_id' => $v['Blue']]]));
    }

    public function test_sales_for_an_option_count_only_that_option(): void
    {
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('base_type'); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id'); $t->string('status'); $t->date('date'); $t->decimal('exchange_rate', 12, 6)->default(1); $t->json('meta')->nullable(); $t->unsignedBigInteger('source_voucher_id')->nullable(); });
        Schema::create('voucher_items', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->string('item_type')->default('product'); $t->boolean('is_header')->default(false); $t->unsignedBigInteger('parent_item_id')->nullable(); $t->unsignedBigInteger('product_id')->nullable(); $t->unsignedBigInteger('variant_id')->nullable(); $t->unsignedBigInteger('service_id')->nullable(); $t->unsignedBigInteger('hamper_id')->nullable(); $t->decimal('amount', 14, 2); $t->decimal('quantity', 12, 4); });
        DB::table('voucher_types')->insert(['id' => 1, 'base_type' => 'sales']);
        [$p, $v] = $this->product('Tee', ['Red' => [1200, 'active'], 'Blue' => [1300, 'active']]);
        foreach ([[$v['Red'], 1200, 1], [$v['Red'], 2400, 2], [$v['Blue'], 1300, 1]] as $i => [$variant, $amount, $qty]) {
            DB::table('vouchers')->insert(['id' => $i + 1, 'voucher_type_id' => 1, 'status' => 'posted', 'date' => now()->toDateString()]);
            DB::table('voucher_items')->insert(['voucher_id' => $i + 1, 'product_id' => $p, 'variant_id' => $variant, 'amount' => $amount, 'quantity' => $qty]);
        }

        $this->save([$this->item($p, $v['Red'])]);
        $s = app(CampaignStats::class)->sales($this->campaign->fresh());
        $this->assertSame([3600.0, 3.0, 2, $v['Red']], [$s['total'], $s['units'], $s['orders'], $s['items'][0]['variant_id']]);

        $this->campaign->items()->delete();
        $this->save([$this->item($p)]);
        $this->assertSame(4900.0, app(CampaignStats::class)->sales($this->campaign->fresh())['total']);      // the whole product counts every option
    }

    public function test_a_new_preorder_offer_needs_a_featured_option_but_a_whole_featured_product_covers_its_options(): void
    {
        [$p, $v] = $this->product('Tee', ['Red' => [1200, 'active'], 'Blue' => [1300, 'active']]);
        $svc = app(PreorderService::class);
        $red = ProductVariant::find($v['Red']);
        $blue = ProductVariant::find($v['Blue']);

        $this->assertFalse($svc->featured($this->campaign, $red));
        $this->save([$this->item($p, $v['Red'])]);
        $this->assertTrue($svc->featured($this->campaign, $red));
        $this->assertFalse($svc->featured($this->campaign, $blue));

        $this->campaign->items()->delete();
        $this->save([$this->item($p)]);
        $this->assertTrue($svc->featured($this->campaign, $blue));
    }
}
