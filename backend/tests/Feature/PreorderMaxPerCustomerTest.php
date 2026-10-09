<?php

namespace Tests\Feature;

use App\Models\Campaign;
use App\Models\CampaignItem;
use App\Models\ProductVariant;
use App\Services\Books\BooksException;
use App\Services\Preorders\PreorderService;
use Illuminate\Support\Facades\DB;

/**
 * An offer can limit what ONE customer takes (script 107). What they hold is worked out from their preorders, less what was credited back;
 * a guest is matched by the email on the order; counter staff may go over it.
 */
class PreorderMaxPerCustomerTest extends PreorderTestCase
{
    private PreorderService $svc;
    private Campaign $campaign;
    private int $variant;
    private int $offer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createPreorderTables();
        $this->svc = app(PreorderService::class);
        $this->campaign = Campaign::create(['slug' => 'drop', 'title' => 'The drop', 'starts_at' => now()->subDay(), 'published_at' => now()->subDay()]);
        $pid = DB::table('products')->insertGetId(['name' => 'Gadget']);
        $this->variant = DB::table('product_variants')->insertGetId(['product_id' => $pid, 'name' => 'Gadget', 'is_default' => true]);
        DB::table('variant_location_stock')->insert(['product_variant_id' => $this->variant, 'location_id' => 1, 'quantity' => 0, 'preorder_enabled' => true]);
        CampaignItem::create(['campaign_id' => $this->campaign->id, 'item_type' => 'product', 'item_id' => $pid]);
        $this->offer = DB::table('preorder_offers')->insertGetId(['campaign_id' => $this->campaign->id, 'product_id' => $pid, 'variant_id' => $this->variant, 'limit_total' => 50, 'max_per_customer' => 3, 'is_active' => true]);
    }

    /** A preorder already taken under the offer: [customer id or null, email for a guest, quantity, status]. Returns [order id, item id]. */
    private function held(?int $customer, ?string $email, float $qty, string $status = 'posted'): array
    {
        $order = DB::table('vouchers')->insertGetId(['customer_id' => $customer, 'status' => $status, 'date' => today(), 'meta' => json_encode(['contact' => ['email' => $email]])]);
        $item = DB::table('voucher_items')->insertGetId(['voucher_id' => $order, 'variant_id' => $this->variant, 'quantity' => $qty]);
        DB::table('preorder_lines')->insert(['voucher_id' => $order, 'offer_id' => $this->offer, 'variant_id' => $this->variant, 'location_id' => 1]);

        return [$order, $item];
    }

    private function place(float $qty, ?array $buyer, bool $enforce = true): array
    {
        return $this->svc->assertPlaceable([['variant_id' => $this->variant, 'quantity' => $qty]], 1, null, false, $buyer, $enforce);
    }

    private function refused(float $qty, ?array $buyer, string $contains): void
    {
        try {
            $this->place($qty, $buyer);
            $this->fail('Expected a refusal containing: ' . $contains);
        } catch (BooksException $e) {
            $this->assertStringContainsString($contains, $e->getMessage());
        }
    }

    public function test_up_to_the_maximum_is_fine_and_one_more_is_refused(): void
    {
        $this->assertArrayHasKey($this->variant . '@1', $this->place(3, ['customer_id' => 7]));
        $this->refused(4, ['customer_id' => 7], 'at most 3');
    }

    public function test_what_they_already_hold_counts(): void
    {
        $this->held(7, null, 1);
        $this->place(2, ['customer_id' => 7]);
        $this->refused(3, ['customer_id' => 7], 'you already have 1). You can add 2 more');
    }

    public function test_at_the_maximum_the_message_says_so(): void
    {
        $this->held(7, null, 3);
        $this->refused(1, ['customer_id' => 7], 'already taken the most one customer can (3)');
    }

    public function test_other_customers_do_not_count(): void
    {
        $this->held(8, null, 3);
        $this->place(3, ['customer_id' => 7]);
        $this->assertTrue(true);
    }

    public function test_a_cancelled_order_holds_nothing(): void
    {
        $this->held(7, null, 3, 'cancelled');
        $this->place(3, ['customer_id' => 7]);
        $this->assertTrue(true);
    }

    public function test_what_was_credited_back_is_free_again(): void
    {
        [$order, $item] = $this->held(7, null, 3);
        DB::table('voucher_types')->insert(['id' => 9, 'base_type' => 'credit_note']);
        $sale = DB::table('vouchers')->insertGetId(['status' => 'posted', 'source_voucher_id' => $order]);
        $saleItem = DB::table('voucher_items')->insertGetId(['voucher_id' => $sale, 'variant_id' => $this->variant, 'quantity' => 3, 'source_item_id' => $item]);
        $cn = DB::table('vouchers')->insertGetId(['status' => 'posted', 'voucher_type_id' => 9]);
        DB::table('voucher_items')->insert(['voucher_id' => $cn, 'variant_id' => $this->variant, 'quantity' => 2, 'source_item_id' => $saleItem]);

        $this->assertSame(1.0, $this->svc->heldBy($this->offer, ['customer_id' => 7]));
        $this->place(2, ['customer_id' => 7]);
        $this->refused(3, ['customer_id' => 7], 'at most 3');
    }

    public function test_a_guest_is_matched_by_email_ignoring_case_but_a_signed_in_orders_email_is_not_theirs(): void
    {
        $this->held(null, 'Amina@Example.com', 2);
        $this->refused(2, ['customer_id' => null, 'email' => 'amina@example.com '], 'you already have 2');
        $this->held(11, 'zed@example.com', 3);   // a signed-in customer's order
        $this->place(3, ['customer_id' => null, 'email' => 'zed@example.com']);
        $this->assertTrue(true);
    }

    public function test_with_no_one_to_match_nothing_is_held(): void
    {
        $this->held(7, 'a@b.c', 3);
        $this->assertSame(0.0, $this->svc->heldBy($this->offer, null));
        $this->assertSame(0.0, $this->svc->heldBy($this->offer, ['customer_id' => null, 'email' => '']));
    }

    public function test_counter_staff_may_go_over_it(): void
    {
        $this->held(7, null, 3);
        $this->place(5, ['customer_id' => 7], false);
        $this->assertTrue(true);
    }

    public function test_an_offer_with_no_maximum_is_unlimited_per_customer(): void
    {
        DB::table('preorder_offers')->where('id', $this->offer)->update(['max_per_customer' => null]);
        $this->held(7, null, 20);
        $this->place(10, ['customer_id' => 7]);
        $this->assertTrue(true);
    }

    public function test_the_total_places_still_apply_first(): void
    {
        DB::table('preorder_offers')->where('id', $this->offer)->update(['limit_total' => 2]);
        $this->refused(3, ['customer_id' => 7], 'Only 2 places left');
    }

    public function test_the_maximum_is_saved_and_cannot_exceed_the_places(): void
    {
        $variant = ProductVariant::findOrFail($this->variant);
        DB::table('preorder_offers')->delete();
        $o = $this->svc->saveOffer($this->campaign, ['variant_id' => $variant->id, 'limit_total' => 10, 'max_per_customer' => 2], null);
        $this->assertSame(2, $o->fresh()->max_per_customer);

        $o = $this->svc->saveOffer($this->campaign, ['variant_id' => $variant->id, 'limit_total' => 10], null, $o);   // not mentioned: left alone
        $this->assertSame(2, $o->fresh()->max_per_customer);

        $o = $this->svc->saveOffer($this->campaign, ['variant_id' => $variant->id, 'max_per_customer' => ''], null, $o);   // emptied: no limit
        $this->assertNull($o->fresh()->max_per_customer);

        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('more than the places');
        $this->svc->saveOffer($this->campaign, ['variant_id' => $variant->id, 'limit_total' => 5, 'max_per_customer' => 6], null, $o);
    }
}
