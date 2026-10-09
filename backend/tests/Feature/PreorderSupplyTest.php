<?php

namespace Tests\Feature;

use App\Models\Books\Voucher;
use App\Models\Campaign;
use App\Models\NotificationDelivery;
use App\Models\Notification;
use App\Models\PreorderOffer;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Preorders\PreorderDelayNotices;
use App\Services\Preorders\PreorderService;
use App\Services\Preorders\PreorderSupply;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;

/**
 * An offer can be linked to the purchase orders that will bring its stock. What is still to arrive and when are read from the purchase orders themselves,
 * so the date customers are given, "late", and the "new expected date" note all follow the supplier.
 */
class PreorderSupplyTest extends NotifyTestCase
{
    use Concerns\CreatesPreorderTables;

    private const SO = 1;
    private const CASH = 2;
    private const PO = 4;
    private const VARIANT = 5;

    private PreorderSupply $svc;
    private PreorderOffer $offer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createPreorderTables();
        Queue::fake();
        Schema::table('vouchers', function ($t) { $t->string('channel')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->string('party_name')->nullable(); $t->string('party_phone')->nullable(); $t->unsignedBigInteger('party_ledger_id')->nullable(); $t->unsignedBigInteger('location_id')->nullable(); $t->date('due_date')->nullable(); $t->string('cancel_reason')->nullable(); $t->decimal('total_amount', 12, 2)->default(0); $t->timestamps(); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->string('name'); });
        Schema::create('preorder_offer_supply', function ($t) { $t->id(); $t->unsignedBigInteger('offer_id'); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamp('created_at')->nullable(); $t->unique(['offer_id', 'voucher_id']); });
        DB::table('voucher_types')->insert([['id' => self::SO, 'base_type' => 'sales_order'], ['id' => self::CASH, 'base_type' => 'cash_sale'], ['id' => self::PO, 'base_type' => 'purchase_order']]);
        DB::table('ledgers')->insert(['id' => 1, 'name' => 'Acme Supplies Ltd']);
        $campaign = Campaign::create(['slug' => 'drop', 'title' => 'The drop', 'starts_at' => now()->subDay(), 'published_at' => now()->subDay()]);
        $this->offer = PreorderOffer::create(['campaign_id' => $campaign->id, 'product_id' => 1, 'variant_id' => self::VARIANT, 'is_active' => true, 'expected_until' => today()->addDays(5)]);
        $this->svc = app(PreorderSupply::class);
    }

    /** A purchase order for $qty of the variant, $received already in, due in $dueDays. */
    private function po(int $dueDays, float $qty = 100, float $received = 0, string $status = 'posted', int $variant = self::VARIANT): Voucher
    {
        $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => self::PO, 'status' => $status, 'voucher_number' => 'PO-' . (DB::table('vouchers')->count() + 1), 'due_date' => today()->addDays($dueDays), 'date' => today(), 'party_ledger_id' => 1, 'location_id' => 1, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('voucher_items')->insert(['voucher_id' => $id, 'variant_id' => $variant, 'quantity' => $qty, 'delivered_quantity' => $received]);

        return Voucher::findOrFail($id);
    }

    // ------------------------------------------------------------ what can be linked

    public function test_only_live_purchase_orders_with_something_still_to_arrive_of_this_item_are_offered(): void
    {
        $open = $this->po(10);
        $this->po(10, 100, 100);                              // all received
        $this->po(10, 100, 0, 'cancelled');                   // cancelled
        $this->po(10, 100, 0, 'posted', 99);                  // another item
        $part = $this->po(3, 50, 20);                         // part received: 30 to come

        $c = $this->svc->candidates(self::VARIANT);
        $this->assertSame([$part->id, $open->id], array_column($c, 'voucher_id'), 'soonest due first');
        $this->assertSame([30.0, 50.0], [$c[0]['ordered'] - 20.0, $c[0]['ordered']]);
        $this->assertSame(30.0, $c[0]['incoming']);
        $this->assertSame('Acme Supplies Ltd', $c[0]['supplier']);
        $this->assertSame(today()->addDays(3)->toDateString(), $c[0]['due_date']);
    }

    public function test_linking_checks_the_purchase_order_and_can_be_undone(): void
    {
        $po = $this->po(10);
        $this->svc->link($this->offer, $po->id, null);
        $this->assertCount(1, $this->svc->forOffer($this->offer)['orders']);

        foreach ([[$po->id, 'already linked'], [$this->po(10, 100, 100)->id, 'not open'], [9999, 'not open']] as [$id, $why]) {
            try {
                $this->svc->link($this->offer, $id, null);
                $this->fail("Expected a refusal: {$why}");
            } catch (BooksException $e) {
                $this->assertStringContainsString($why, $e->getMessage());
            }
        }
        $this->svc->unlink($this->offer, $po->id);
        $this->assertSame([], $this->svc->forOffer($this->offer)['orders']);
    }

    public function test_an_offer_takes_a_limited_number_of_links(): void
    {
        foreach (range(1, PreorderSupply::MAX_LINKS) as $i) {
            $this->svc->link($this->offer, $this->po($i)->id, null);
        }
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('at most ' . PreorderSupply::MAX_LINKS);
        $this->svc->link($this->offer, $this->po(20)->id, null);
    }

    // ------------------------------------------------------------ what is read from them

    public function test_incoming_and_the_date_come_from_the_purchase_orders_that_still_have_something_to_arrive(): void
    {
        $a = $this->po(10, 100, 40);   // 60 to come, due in 10
        $b = $this->po(20, 50);        // 50 to come, due in 20
        $done = $this->po(30, 80, 80); // fully received, due in 30: must not decide the date
        foreach ([$a, $b] as $p) {
            $this->svc->link($this->offer, $p->id, null);
        }
        DB::table('preorder_offer_supply')->insert(['offer_id' => $this->offer->id, 'voucher_id' => $done->id]);   // linked earlier, since received

        $r = $this->svc->forOffer($this->offer);
        $this->assertSame(110.0, $r['incoming']);
        $this->assertSame(today()->addDays(20)->toDateString(), $r['date'], 'the last shipment still to come decides');
        $this->assertCount(3, $r['orders']);
    }

    public function test_a_cancelled_purchase_order_counts_for_nothing_and_no_links_means_no_date(): void
    {
        $po = $this->po(10);
        $this->svc->link($this->offer, $po->id, null);
        DB::table('vouchers')->where('id', $po->id)->update(['status' => 'cancelled']);
        $this->assertSame(['incoming' => 0.0, 'date' => null, 'orders' => []], $this->svc->forOffer($this->offer));
        $this->assertSame(['incoming' => 0.0, 'date' => null, 'orders' => []], $this->svc->forOffers([12345])[12345]);
    }

    public function test_customers_are_given_the_purchase_orders_date_over_the_typed_one(): void
    {
        $plain = app(PreorderService::class)->describe($this->offer->fresh());
        $this->assertSame([today()->addDays(5)->toDateString(), false], [$plain['expected_until'], $plain['from_supply']]);

        $this->svc->link($this->offer, $this->po(14)->id, null);
        $linked = app(PreorderService::class)->describe($this->offer->fresh());
        $this->assertSame([today()->addDays(14)->toDateString(), true, null], [$linked['expected_until'], $linked['from_supply'], $linked['expected_from']]);
        $this->assertSame(today()->addDays(14)->toDateString(), $this->svc->effectiveDate($this->offer->fresh()));
    }

    // ------------------------------------------------------------ late, and a new date

    /** A paid preorder under the offer, promised $snapshotDays from today, 4 owed. */
    private function preorder(int $snapshotDays): Voucher
    {
        $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => self::SO, 'customer_id' => $this->customer()->id, 'status' => 'posted', 'voucher_number' => 'PRE-00009', 'channel' => 'storefront',
            'total_amount' => 1000, 'date' => today()->subDays(10), 'meta' => json_encode(['preorder' => ['campaign_ids' => [1]]]), 'created_at' => now(), 'updated_at' => now()]);
        DB::table('voucher_items')->insert(['voucher_id' => $id, 'variant_id' => self::VARIANT, 'quantity' => 4, 'delivered_quantity' => 0]);
        DB::table('preorder_lines')->insert(['voucher_id' => $id, 'offer_id' => $this->offer->id, 'variant_id' => self::VARIANT, 'location_id' => 1, 'promised_date' => today()->addDays($snapshotDays)->toDateString()]);
        DB::table('vouchers')->insert(['voucher_type_id' => self::CASH, 'status' => 'posted', 'source_voucher_id' => $id, 'voucher_number' => 'CS-9', 'channel' => 'storefront']);

        return Voucher::findOrFail($id);
    }

    private function customer()
    {
        $user = User::find(40) ?? User::forceCreate(['id' => 40, 'name' => 'Amina Wanjiru', 'email' => 'amina@example.com', 'password' => 'x']);

        return \App\Models\Customer::where('user_id', 40)->first() ?? \App\Models\Customer::forceCreate(['user_id' => $user->id, 'first_name' => 'Amina', 'last_name' => 'Wanjiru', 'email' => 'amina@example.com']);
    }

    public function test_late_is_measured_against_the_purchase_order_while_stock_is_on_order(): void
    {
        $o = $this->preorder(-3);   // promised 3 days ago
        $this->assertArrayHasKey($o->id, app(PreorderService::class)->overdue(today()), 'late against the date it was taken under');

        $this->svc->link($this->offer, $this->po(7)->id, null);   // the supplier says it arrives in a week
        $this->assertSame([], app(PreorderService::class)->overdue(today()), 'not late while the supplier date is ahead');
        $this->assertSame(today()->addDays(7)->toDateString(), app(PreorderService::class)->promisedFor($o->id));
        $this->assertArrayHasKey($o->id, app(PreorderService::class)->overdue(today()->addDays(8)));
    }

    public function test_once_the_purchase_order_is_received_the_original_promise_applies_again(): void
    {
        $o = $this->preorder(-3);
        $po = $this->po(7);
        $this->svc->link($this->offer, $po->id, null);
        DB::table('voucher_items')->where('voucher_id', $po->id)->update(['delivered_quantity' => 100]);   // goods in, but the preorder is still owed
        $this->assertArrayHasKey($o->id, app(PreorderService::class)->overdue(today()));
    }

    public function test_a_later_supplier_date_is_told_once_per_new_date_and_not_more_than_three_times(): void
    {
        $o = $this->preorder(5);   // promised in 5 days
        $po = $this->po(12);
        $this->svc->link($this->offer, $po->id, null);
        $delays = app(PreorderDelayNotices::class);

        $r = $delays->run(today());
        $this->assertSame(1, $r['moved']);
        $m = Notification::where('type', 'preorder_delayed')->first();
        $this->assertStringContainsString('now expected by ' . today()->addDays(12)->toDateString(), $m->message);
        $this->assertStringContainsString('first said ' . today()->addDays(5)->toDateString(), $m->message);

        $this->assertSame(0, $delays->run(today()->addDay())['moved'], 'the same date is not told again');

        foreach ([20, 30, 40] as $i => $days) {   // the supplier slips three more times
            DB::table('vouchers')->where('id', $po->id)->update(['due_date' => today()->addDays($days)]);
            $delays->run(today()->addDays(2 + $i));
        }
        $this->assertSame(3, Notification::where('type', 'preorder_delayed')->where('title', 'like', 'New expected date%')->count(), 'three notes at most');
    }

    public function test_an_earlier_supplier_date_is_not_a_delay(): void
    {
        $this->preorder(10);
        $this->svc->link($this->offer, $this->po(4)->id, null);
        $this->assertSame([], app(PreorderService::class)->dateChanges());
        $this->assertSame(0, app(PreorderDelayNotices::class)->run(today())['moved']);
    }

    public function test_an_unlinked_offer_never_moves_anything(): void
    {
        $this->preorder(10);
        $this->assertSame([], app(PreorderService::class)->dateChanges());
    }
}
