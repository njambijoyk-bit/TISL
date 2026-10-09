<?php

namespace Tests\Feature;

use App\Models\Books\Voucher;
use App\Models\Campaign;
use App\Models\PreorderOffer;
use App\Services\Preorders\PreorderDashboard;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** The preorder overview: how full each offer is, what is owed and whether stock or stock on order covers it, what is late, delivery time and cancel rate. */
class PreorderDashboardTest extends NotifyTestCase
{
    use Concerns\CreatesPreorderTables;

    private const SO = 1;
    private const CASH = 2;
    private const DN = 3;
    private const PO = 4;
    private const V = 5;

    private Campaign $campaign;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createPreorderTables();
        Schema::table('vouchers', function ($t) { $t->string('channel')->nullable(); $t->unsignedBigInteger('party_ledger_id')->nullable(); $t->unsignedBigInteger('location_id')->nullable(); $t->date('due_date')->nullable(); $t->decimal('total_amount', 12, 2)->default(0); $t->timestamps(); });
        Schema::create('preorder_offer_supply', function ($t) { $t->id(); $t->unsignedBigInteger('offer_id'); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamp('created_at')->nullable(); });
        DB::table('voucher_types')->insert([['id' => self::SO, 'base_type' => 'sales_order'], ['id' => self::CASH, 'base_type' => 'cash_sale'], ['id' => self::DN, 'base_type' => 'delivery_note'], ['id' => self::PO, 'base_type' => 'purchase_order']]);
        $this->campaign = Campaign::create(['slug' => 'drop', 'title' => 'The drop', 'starts_at' => now()->subDay(), 'published_at' => now()->subDay()]);
        DB::table('products')->insert(['id' => 1, 'name' => 'Gadget']);
        DB::table('product_variants')->insert(['id' => self::V, 'product_id' => 1, 'name' => 'Gadget']);
    }

    private function offer(array $o = []): PreorderOffer
    {
        return PreorderOffer::create($o + ['campaign_id' => $this->campaign->id, 'product_id' => 1, 'variant_id' => self::V, 'is_active' => true, 'limit_total' => 10]);
    }

    /** A preorder (and, if paid, its cash sale); $daysAgo it was taken, promised $due days from today. Returns the order. */
    private function order(PreorderOffer $offer, int $qty, int $daysAgo = 2, int $due = 20, bool $paid = true, array $meta = []): Voucher
    {
        $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => self::SO, 'status' => 'posted', 'voucher_number' => 'PRE-' . (DB::table('vouchers')->count() + 1), 'date' => today()->subDays($daysAgo), 'channel' => 'storefront',
            'meta' => json_encode(['preorder' => ['campaign_ids' => [1]]] + $meta), 'created_at' => now(), 'updated_at' => now()]);
        DB::table('voucher_items')->insert(['voucher_id' => $id, 'variant_id' => self::V, 'quantity' => $qty, 'delivered_quantity' => 0]);
        DB::table('preorder_lines')->insert(['voucher_id' => $id, 'offer_id' => $offer->id, 'variant_id' => self::V, 'location_id' => 1, 'promised_date' => today()->addDays($due)->toDateString()]);
        if ($paid) {
            DB::table('vouchers')->insert(['voucher_type_id' => self::CASH, 'status' => 'posted', 'source_voucher_id' => $id, 'voucher_number' => 'CS', 'channel' => 'storefront', 'meta' => json_encode(['preorder' => ['campaign_ids' => [1]]]), 'date' => today()->subDays($daysAgo)]);
        }

        return Voucher::findOrFail($id);
    }

    private function summary(): array
    {
        return app(PreorderDashboard::class)->summary(today());
    }

    public function test_an_offer_shows_how_full_it_is_and_what_is_owed_against_stock_and_stock_on_order(): void
    {
        $o = $this->offer(['limit_total' => 10]);
        $this->order($o, 4);
        $this->order($o, 3);
        DB::table('variant_location_stock')->insert(['product_variant_id' => self::V, 'location_id' => 1, 'quantity' => 2, 'preorder_enabled' => true]);
        $po = DB::table('vouchers')->insertGetId(['voucher_type_id' => self::PO, 'status' => 'posted', 'due_date' => today()->addDays(9), 'location_id' => 1, 'voucher_number' => 'PO-1', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('voucher_items')->insert(['voucher_id' => $po, 'variant_id' => self::V, 'quantity' => 3, 'delivered_quantity' => 0]);
        DB::table('preorder_offer_supply')->insert(['offer_id' => $o->id, 'voucher_id' => $po]);

        $row = $this->summary()['offers'][0];
        $this->assertSame([7.0, 3, 'open'], [$row['taken'], $row['places_left'], $row['status']]);
        $this->assertSame([7.0, 2.0, 3.0, 2.0], [$row['owed'], $row['stock'], $row['incoming'], $row['short']], '7 owed, 2 here, 3 coming: 2 short');
        $this->assertSame([today()->addDays(9)->toDateString(), true], [$row['expected'], $row['from_supply']]);
        $h = $this->summary()['headline'];
        $this->assertSame([1, 7.0, 2.0, 1], [$h['open_offers'], $h['units_owed'], $h['units_short'], $h['offers_short']]);
    }

    public function test_an_offer_is_full_stopped_closed_or_scheduled_as_the_case_may_be(): void
    {
        $full = $this->offer(['limit_total' => 2]);
        $this->order($full, 2);
        $stopped = $this->offer(['is_active' => false]);
        $closed = $this->offer(['closes_at' => now()->subHour()]);
        $later = Campaign::create(['slug' => 'later', 'title' => 'Later', 'starts_at' => now()->addDays(5), 'published_at' => now()]);
        $scheduled = $this->offer(['campaign_id' => $later->id]);
        $status = collect($this->summary()['offers'])->pluck('status', 'id');
        $this->assertSame(['full', 'stopped', 'closed', 'scheduled'], [$status[$full->id], $status[$stopped->id], $status[$closed->id], $status[$scheduled->id]]);
    }

    public function test_late_pending_and_the_oldest_are_counted(): void
    {
        $o = $this->offer();
        $late = $this->order($o, 2, 10, -4);
        $this->order($o, 1, 3, 20);                                                           // on time
        $this->order($o, 1, 3, -9, true, ['cancel_request' => ['status' => 'requested']]);    // asked to cancel: not counted as late, but pending
        $s = $this->summary();
        $this->assertSame([1, 4, 1], [$s['headline']['late_orders'], $s['headline']['oldest_late_days'], $s['headline']['cancel_requests']]);
        $this->assertSame([$late->id, 4, 2.0], [$s['late'][0]['order_id'], $s['late'][0]['days'], $s['late'][0]['owed']]);
    }

    public function test_per_day_covers_thirty_days_with_empty_days_and_counts_only_the_orders_not_what_was_made_from_them(): void
    {
        $o = $this->offer();
        $this->order($o, 4, 0);
        $this->order($o, 1, 0);
        $this->order($o, 2, 3);
        $days = $this->summary()['per_day'];
        $this->assertCount(30, $days);
        $this->assertSame([today()->subDays(29)->toDateString(), today()->toDateString()], [$days[0]['date'], $days[29]['date']]);
        $this->assertSame([2, 5.0], [$days[29]['orders'], $days[29]['units']], 'two orders today; their cash sales are not more preorders');
        $this->assertSame([1, 2.0], [$days[26]['orders'], $days[26]['units']]);
        $this->assertSame([0, 0.0], [$days[10]['orders'], $days[10]['units']]);
    }

    public function test_delivery_time_is_the_days_from_the_order_to_its_first_delivery(): void
    {
        $o = $this->offer();
        $a = $this->order($o, 1, 12);
        $b = $this->order($o, 1, 8);
        foreach ([[$a, 4, 'DN1'], [$a, 2, 'DN1b'], [$b, 2, 'DN2']] as [$ord, $ago, $n]) {   // a: first delivery 8 days after the order; b: 6 days
            DB::table('vouchers')->insert(['voucher_type_id' => self::DN, 'status' => 'posted', 'source_voucher_id' => $ord->id, 'voucher_number' => $n, 'date' => today()->subDays($ago)]);
        }
        $this->assertSame(7.0, $this->summary()['headline']['avg_days_to_deliver']);
    }

    public function test_cancel_rate_is_approved_cancellations_over_preorders_taken(): void
    {
        $o = $this->offer();
        $this->order($o, 1, 5, 20, true, ['cancel_request' => ['status' => 'approved']]);
        $this->order($o, 1, 5);
        $this->order($o, 1, 5);
        $this->order($o, 1, 5);
        $this->assertSame(0.25, $this->summary()['headline']['cancel_rate']);
    }

    public function test_with_nothing_yet_the_averages_are_empty_not_zero(): void
    {
        $h = $this->summary()['headline'];
        $this->assertNull($h['avg_days_to_deliver']);
        $this->assertNull($h['cancel_rate']);
        $this->assertSame([0, 0, 0], [$h['open_offers'], $h['late_orders'], $h['cancel_requests']]);
    }
}
