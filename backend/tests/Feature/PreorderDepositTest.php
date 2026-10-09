<?php

namespace Tests\Feature;

use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Campaign;
use App\Models\CampaignItem;
use App\Models\PreorderOffer;
use App\Services\Books\BooksException;
use App\Services\Books\CheckoutService;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\OrderSummaryService;
use App\Services\Books\VoucherService;
use App\Services\Preorders\PreorderService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A preorder offer can take a deposit (script 115): a signed-in customer pays a share now by M-Pesa, the order becomes an invoice with that part received, and the
 * balance is paid on delivery or online. The books' own invoice and receipt are stood in for; what is tested is every rule around them.
 */
class PreorderDepositTest extends PreorderTestCase
{
    private PreorderService $svc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createPreorderTables();
        $this->svc = app(PreorderService::class);
        Schema::table('vouchers', function ($t) { $t->decimal('total_amount', 12, 2)->default(0); $t->unsignedBigInteger('location_id')->nullable(); $t->timestamps(); });
        $this->mock(\App\Services\DarajaService::class);   // the real one wants M-Pesa keys at construction
        Schema::create('locations', function ($t) { $t->id(); $t->string('name')->nullable(); $t->timestamps(); });
        Schema::create('customers', function ($t) { $t->id(); $t->string('first_name')->nullable(); $t->string('last_name')->nullable(); $t->string('email')->nullable(); $t->softDeletes(); $t->timestamps(); });
        DB::table('voucher_types')->insert([['id' => 1, 'base_type' => 'sales_order'], ['id' => 2, 'base_type' => 'cash_sale'], ['id' => 3, 'base_type' => 'sales']]);
    }

    private function offer(?int $percent, string $name = 'Gadget'): PreorderOffer
    {
        $c = Campaign::firstOrCreate(['slug' => 'drop'], ['title' => 'The drop', 'starts_at' => now()->subDay(), 'published_at' => now()->subDay()]);
        $pid = DB::table('products')->insertGetId(['name' => $name]);
        $vid = DB::table('product_variants')->insertGetId(['product_id' => $pid, 'name' => $name, 'is_default' => true]);
        CampaignItem::create(['campaign_id' => $c->id, 'item_type' => 'product', 'item_id' => $pid]);

        return PreorderOffer::create(['campaign_id' => $c->id, 'product_id' => $pid, 'variant_id' => $vid, 'deposit_percent' => $percent, 'is_active' => true, 'expected_until' => '2026-12-01']);
    }

    // ------------------------------------------------------------ which deposit an offer allows

    public function test_a_cart_may_pay_a_deposit_only_when_every_offer_in_it_takes_one_and_the_highest_percentage_applies(): void
    {
        $a = $this->offer(30, 'A');
        $b = $this->offer(50, 'B');
        $none = $this->offer(null, 'C');
        $this->assertSame(50, $this->svc->depositOf([$a, $b]));
        $this->assertSame(50, $this->svc->depositOf([$b, $a]));
        $this->assertNull($this->svc->depositOf([$a, $none]), 'one offer that wants full payment makes the whole order full payment');
        $this->assertNull($this->svc->depositOf([$none]));
        $this->assertSame(30, $this->svc->depositFor(['x' => ['offer' => $a], 'set_aside' => ['offer' => null]]), 'a line only set aside from stock has no offer and does not count');
        $this->assertNull($this->svc->depositFor(['only_aside' => ['offer' => null]]));
    }

    public function test_the_percentage_is_kept_between_1_and_90_and_changes_with_the_offer(): void
    {
        $c = Campaign::create(['slug' => 'x', 'title' => 'X', 'starts_at' => now()->subDay(), 'published_at' => now()->subDay()]);
        $pid = DB::table('products')->insertGetId(['name' => 'G']);
        $vid = DB::table('product_variants')->insertGetId(['product_id' => $pid, 'name' => 'G', 'is_default' => true]);
        DB::table('variant_location_stock')->insert(['product_variant_id' => $vid, 'location_id' => 1, 'quantity' => 0, 'preorder_enabled' => true]);
        CampaignItem::create(['campaign_id' => $c->id, 'item_type' => 'product', 'item_id' => $pid]);
        foreach ([0, 91, -5] as $bad) {
            try {
                $this->svc->saveOffer($c, ['variant_id' => $vid, 'deposit_percent' => $bad], null);
                $this->fail("{$bad} should be refused");
            } catch (BooksException $e) {
                $this->assertStringContainsString('between 1% and 90%', $e->getMessage());
            }
        }
        $o = $this->svc->saveOffer($c, ['variant_id' => $vid, 'deposit_percent' => 25], null);
        $this->assertSame(25, $this->svc->describe($o)['deposit_percent']);
        $o = $this->svc->saveOffer($c, ['variant_id' => $vid, 'limit_total' => 5], null, $o);
        $this->assertSame(25, $o->deposit_percent, 'an update that does not mention it leaves it alone');
        $o = $this->svc->saveOffer($c, ['variant_id' => $vid, 'deposit_percent' => null], null, $o);
        $this->assertNull($o->deposit_percent, 'sending it empty takes the deposit away');
    }

    // ------------------------------------------------------------ what the quote says

    private function quoteDeposit(array $a, float $total): ?array
    {
        $svc = app(CheckoutService::class);
        $r = new \ReflectionMethod($svc, 'depositQuote');
        $r->setAccessible(true);

        return $r->invoke($svc, $a, $total);
    }

    public function test_the_quote_offers_a_deposit_to_a_signed_in_customer_only(): void
    {
        $placeable = ['v@1' => ['offer' => $this->offer(30)]];
        $this->assertSame(['percent' => 30, 'amount' => 300.0, 'balance' => 700.0], $this->quoteDeposit(['placeable' => $placeable, 'customer' => (object) ['id' => 1]], 1000.0));
        $this->assertNull($this->quoteDeposit(['placeable' => $placeable, 'customer' => null], 1000.0), 'a guest pays in full');
        $this->assertNull($this->quoteDeposit(['placeable' => null, 'customer' => (object) ['id' => 1]], 1000.0), 'not an ordinary order');
        $this->assertSame(333.3, $this->quoteDeposit(['placeable' => ['v@1' => ['offer' => $this->offer(33)]], 'customer' => (object) ['id' => 1]], 1010.0)['amount']);
    }

    // ------------------------------------------------------------ the deposit, then the balance

    private function order(array $deposit = ['percent' => 30, 'amount' => 300.0, 'balance' => 700.0]): array
    {
        $so = DB::table('vouchers')->insertGetId(['voucher_type_id' => 1, 'customer_id' => 7, 'status' => 'posted', 'voucher_number' => 'PRE-00001', 'total_amount' => 1000, 'meta' => json_encode(['preorder' => ['x' => 1], 'deposit' => $deposit])]);
        $inv = DB::table('vouchers')->insertGetId(['voucher_type_id' => 3, 'customer_id' => 7, 'status' => 'posted', 'voucher_number' => 'INV-1', 'total_amount' => 1000, 'source_voucher_id' => $so]);

        return [Voucher::find($so), Voucher::find($inv)];
    }

    private function outstanding(float $left): void
    {
        $this->partialMock(VoucherService::class, fn ($m) => $m->shouldReceive('outstanding')->andReturn($left));
    }

    public function test_the_invoice_asks_for_the_deposit_first_then_the_balance_and_all_at_once_when_the_customer_prefers(): void
    {
        [$so, $inv] = $this->order();
        $checkout = fn () => app(CheckoutService::class);

        $this->outstanding(1000.0);
        $this->assertSame(['due' => 300.0, 'stage' => 'deposit'], $checkout()->payableNow($inv));
        $this->assertSame(['due' => 1000.0, 'stage' => 'full'], $checkout()->payableNow($inv, true));

        $this->outstanding(700.0);   // the deposit is in
        $this->assertSame(['due' => 700.0, 'stage' => 'balance'], $checkout()->payableNow($inv));
        $st = app(VoucherService::class)->depositState($so, $inv);
        $this->assertSame([300.0, 700.0, 'balance'], [$st['paid'], $st['outstanding'], $st['stage']]);

        $this->outstanding(100.0);   // 200 of the balance paid so far
        $this->assertSame(['due' => 100.0, 'stage' => 'balance'], $checkout()->payableNow($inv));

        $this->outstanding(0.0);
        $this->assertSame('done', app(VoucherService::class)->depositState($so, $inv)['stage']);
    }

    public function test_a_part_paid_deposit_asks_only_for_what_is_missing(): void
    {
        [$so, $inv] = $this->order(['percent' => 30, 'amount' => 300.0, 'balance' => 700.0]);
        $this->outstanding(850.0);   // 150 of the 300 came in (say, a second attempt)
        $this->assertSame(['due' => 150.0, 'stage' => 'deposit'], app(CheckoutService::class)->payableNow($inv));
    }

    public function test_an_invoice_that_is_not_a_deposit_one_is_paid_in_full_as_before(): void
    {
        [$so, $inv] = $this->order();
        DB::table('vouchers')->where('id', $so->id)->update(['meta' => json_encode(['preorder' => ['x' => 1]])]);
        $this->outstanding(1000.0);
        $this->assertSame(['due' => 1000.0, 'stage' => 'full'], app(CheckoutService::class)->payableNow($inv->fresh()));
    }

    public function test_the_order_list_row_carries_the_deposit_state(): void
    {
        [$so, $inv] = $this->order();
        $this->outstanding(700.0);
        $row = app(OrderSummaryService::class)->row(Voucher::with(['currency', 'children.type'])->find($so->id));
        $this->assertSame(['percent' => 30, 'amount' => 300.0, 'balance' => 700.0, 'paid' => 300.0, 'outstanding' => 700.0, 'stage' => 'balance', 'due_next' => 700.0], $row['deposit']);
        DB::table('vouchers')->where('id', $so->id)->update(['meta' => json_encode(['preorder' => ['x' => 1]])]);
        $this->assertNull(app(OrderSummaryService::class)->row(Voucher::with(['currency', 'children.type'])->find($so->id))['deposit']);
    }

    // ------------------------------------------------------------ placing it

    public function test_placing_a_deposit_makes_an_invoice_at_once_and_asks_for_the_deposit_alone(): void
    {
        [$so] = $this->order(['percent' => 0, 'amount' => 0.0, 'balance' => 0.0]);
        DB::table('vouchers')->where('id', $so->id)->update(['meta' => json_encode(['preorder' => ['x' => 1], 'contact' => ['phone' => '0712345678']])]);
        $so = $so->fresh();
        $invoice = (new Voucher)->forceFill(['id' => 55, 'voucher_number' => 'INV-9', 'total_amount' => 1000]);
        $asked = [];
        $this->partialMock(VoucherService::class, function ($m) use ($invoice, &$asked) {
            $m->shouldReceive('convert')->once()->andReturnUsing(function ($order, $type, $opts) use ($invoice, &$asked) {
                $asked['convert'] = [$type, $opts['due_date']];

                return $invoice;
            });
        });
        $this->mock(GatewayPaymentService::class, function ($m) use (&$asked) {
            $m->shouldReceive('initiateMpesa')->once()->andReturnUsing(function ($v, $method, $phone, $tenders, $due) use (&$asked) {
                $asked['mpesa'] = [$v->id, $phone, $due];

                return new \App\Models\Books\PaymentAttempt(['id' => 9, 'status' => 'pending', 'amount' => $due]);
            });
        });
        $svc = app(CheckoutService::class);
        $r = new \ReflectionMethod($svc, 'placeDeposit');
        $r->setAccessible(true);
        $a = ['placeable' => ['v@1' => ['offer' => $this->offer(30)]], 'currency' => (object) ['code' => 'KES']];
        $out = $r->invoke($svc, $so, $a, ['phone' => null], null, new PaymentMethod, 30, 1000.0);

        $this->assertSame(['sales', '2026-12-01'], $asked['convert'], 'an invoice, due on the day the customer was promised');
        $this->assertSame([55, '0712345678', 300.0], $asked['mpesa'], 'the prompt is for the deposit, on the invoice');
        $this->assertSame(['awaiting_payment', 300.0], [$out['status'], $out['attempt']['amount']]);
        $this->assertStringContainsString('deposit of KES 300.00', $out['message']);
        $this->assertStringContainsString('balance of KES 700.00', $out['message']);
        $this->assertEquals(['percent' => 30, 'amount' => 300.0, 'balance' => 700.0], $so->fresh()->meta['deposit']);
    }

    // ------------------------------------------------------------ what staff see

    public function test_preorders_waiting_shows_the_balance_to_collect_and_paid_not_delivered_counts_only_what_was_paid(): void
    {
        [$so, $inv] = $this->order();
        $variant = DB::table('product_variants')->insertGetId(['product_id' => DB::table('products')->insertGetId(['name' => 'Gadget']), 'name' => 'Gadget', 'is_default' => true]);
        $item = DB::table('voucher_items')->insertGetId(['voucher_id' => $so->id, 'variant_id' => $variant, 'quantity' => 2, 'amount' => 1000, 'unit_factor' => 1, 'delivered_quantity' => 0, 'is_header' => 0]);
        DB::table('preorder_lines')->insert(['voucher_id' => $so->id, 'offer_id' => 0, 'variant_id' => $variant, 'location_id' => 1]);
        $this->outstanding(700.0);
        $w = $this->svc->waiting();
        $this->assertSame([700.0, 'invoiced'], [$w['lines'][0]['balance_due'], $w['lines'][0]['payment']]);
        $this->assertSame(300.0, $w['paid_not_delivered']['value'], 'a third of the price is paid: that much is "paid, not delivered"');

        $this->outstanding(0.0);
        $w = $this->svc->waiting();
        $this->assertNull($w['lines'][0]['balance_due']);
        $this->assertSame(1000.0, $w['paid_not_delivered']['value']);

        $this->outstanding(1000.0);   // nothing paid at all
        $this->assertSame(0.0, $this->svc->waiting()['paid_not_delivered']['value']);
    }
}
