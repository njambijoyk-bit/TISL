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

/**
 * A hamper is preordered through its components (docs/PREORDER_PLAN.md decision 10): it is "buy" when every component is in stock at the hamper's branch,
 * "preorder" when what is short has an open offer in a live campaign that features the hamper, otherwise "out" (or "coming soon").
 * In-memory tables stand in for the real ones (the repo builds its database from SQL scripts).
 */
class HamperPreorderTest extends PreorderTestCase
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
        $this->createPreorderTables();
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

    public function test_a_hamper_counts_toward_its_components_per_customer_maximum(): void
    {
        $this->stock('mug', 0);
        $this->offer('mug', ['limit_total' => 20, 'max_per_customer' => 4]);   // 4 mugs = 2 hampers
        $this->svc->assertPlaceable($this->svc->hamperLines($this->hamper, 2), self::BRANCH, null, false, ['customer_id' => 7]);
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('One customer can take at most 4 of Cosy box (Mug)');
        $this->svc->assertPlaceable($this->svc->hamperLines($this->hamper, 3), self::BRANCH, null, false, ['customer_id' => 7]);
    }
}
