<?php

namespace Tests\Feature;

use App\Models\Books\Voucher;
use App\Models\Customer;
use App\Models\Menus\CookingRequest;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use App\Services\Menus\CookingNotices;
use App\Services\Menus\CookingService;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\PrepService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Menus step 10: cooking services, first slice. Made-to-order cakes (a lead time, quoted at once) and catering (staff price it), the deposit, the balance and the job itself.
 * The books and the payment gateways are stood in for; what they are asked is checked.
 */
class MenusCookingTest extends TestCase
{
    use Concerns\CreatesCounterWorld;

    private array $orders = [];
    private array $converted = [];
    private array $received = [];
    private array $voided = [];
    private array $told = [];
    private bool $stockShort = false;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCounterWorld();
        if (! Schema::hasTable('users')) {
            Schema::create('users', function ($t) { $t->id(); $t->string('name'); $t->string('email')->nullable(); $t->softDeletes(); $t->timestamps(); });
        }
        Schema::table('menus_dishes', fn ($t) => $t->unsignedSmallInteger('lead_hours')->nullable());
        Schema::create('menus_requests', function ($t) {
            $t->id(); $t->string('number', 20); $t->string('track_token', 40)->unique(); $t->string('kind', 10); $t->unsignedBigInteger('location_id'); $t->unsignedBigInteger('customer_id')->nullable(); $t->unsignedBigInteger('user_id')->nullable();
            $t->string('name', 160); $t->string('email', 190)->nullable(); $t->string('phone', 40); $t->dateTime('event_at'); $t->string('fulfil', 10)->default('pickup'); $t->text('address')->nullable(); $t->unsignedSmallInteger('headcount')->nullable();
            $t->json('details')->nullable(); $t->string('notes', 1000)->nullable(); $t->string('status', 12)->default('requested'); $t->dateTime('quoted_at')->nullable(); $t->date('valid_until')->nullable();
            foreach (['subtotal', 'tax_total', 'total', 'deposit_amount', 'paid_total'] as $c) { $t->decimal($c, 14, 2)->default(0); } $t->decimal('deposit_pct', 5, 2)->default(0);
            $t->unsignedBigInteger('voucher_id')->nullable(); $t->unsignedBigInteger('invoice_id')->nullable(); $t->unsignedBigInteger('currency_id')->nullable();
            foreach (['accepted_at', 'confirmed_at', 'completed_at', 'cancelled_at'] as $c) { $t->dateTime($c)->nullable(); } $t->string('cancel_reason', 300)->nullable(); $t->timestamps();
        });
        Schema::create('menus_request_lines', function ($t) { $t->id(); $t->unsignedBigInteger('request_id'); $t->unsignedBigInteger('dish_id')->nullable(); $t->string('name', 200); $t->decimal('quantity', 10, 2)->default(1); $t->boolean('per_head')->default(false);
            $t->decimal('unit_price', 14, 2)->default(0); $t->json('options')->nullable(); $t->string('note', 300)->nullable(); $t->timestamps(); });
        $this->books();
        $n = $this->createMock(CookingNotices::class);
        foreach (['requested', 'quoted', 'confirmed', 'ready', 'cancelled'] as $m) {
            $n->method($m)->willReturnCallback(function (CookingRequest $r) use ($m) { $this->told[] = [$m, $r->number]; });
        }
        $this->app->instance(CookingNotices::class, $n);
        $this->on();
    }

    /** The books stood in for: a priced order (VAT 16%), the invoice it becomes, receipts, cancellations and the delivery note that takes the stock. */
    private function books(): void
    {
        $v = $this->createMock(VoucherService::class);
        $v->method('preview')->willReturnCallback(function (array $d) {
            $sub = array_sum(array_map(fn ($l) => in_array($l['type'], ['product', 'custom', 'dish'], true) ? $l['quantity'] * $l['rate'] : 0, $d['lines']));
            $tax = round($sub * 0.16, 2);

            return ['subtotal' => $sub, 'tax_total' => $tax, 'total' => round($sub + $tax, 2), 'lines' => []];
        });
        $v->method('placeOrder')->willReturnCallback(function (array $d) {
            $this->orders[] = $d;
            $sub = array_sum(array_map(fn ($l) => $l['quantity'] * $l['rate'], $d['lines']));

            return Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'SO-'.count($this->orders), 'currency_id' => $d['currency_id'], 'customer_id' => $d['customer_id'], 'total_amount' => round($sub * 1.16, 2), 'meta' => $d['meta']]);
        });
        $v->method('convert')->willReturnCallback(function (Voucher $src, string $base, array $opts = []) {
            $this->converted[] = [$src->id, $base, $opts];
            if ($base === 'delivery_note' && $this->stockShort) {
                throw new BooksException('Not enough flour to make this.');
            }

            return Voucher::create(['voucher_type_id' => 1, 'voucher_number' => strtoupper(substr($base, 0, 2)).'-'.count($this->converted), 'total_amount' => $src->total_amount, 'source_voucher_id' => $src->id, 'meta' => $src->meta]);
        });
        $v->method('receive')->willReturnCallback(function (Voucher $inv, array $opts) { $this->received[] = [$inv->id, $opts]; return Voucher::create(['voucher_type_id' => 1, 'total_amount' => $opts['amount']]); });
        $v->method('cancel')->willReturnCallback(function (Voucher $x) { $this->voided[] = $x->id; $x->update(['status' => Voucher::CANCELLED]); return $x; });
        $this->app->instance(VoucherService::class, $v);
    }

    private function on(array $o = []): void
    {
        MenusSettings::save($o + ['custom_orders' => true, 'sales_ledger_id' => $this->ledger, 'custom_deposit_pct' => 50, 'custom_quote_days' => 7, 'custom_lead_hours' => 72], null);
    }

    private function svc(): CookingService
    {
        return app(CookingService::class);
    }

    private function cake(string $name = 'Chocolate cake', float $price = 3000, int $lead = 48)
    {
        return $this->make($name, $price, ['lead_hours' => $lead]);
    }

    private function user(int $customer = 5): User
    {
        $u = User::forceCreate(['name' => 'Amina', 'email' => "amina{$customer}@example.com"]);
        $u->setRelation('customer', (new Customer())->forceFill(['id' => $customer]));

        return $u;
    }

    private function when(string $s = '2026-10-20 15:00'): string
    {
        return $s;
    }

    /** A valid cake request. */
    private function askCake($d, array $o = []): CookingRequest
    {
        return $this->svc()->request($o + ['kind' => 'cake', 'name' => 'Amina', 'phone' => '0712345678', 'event_at' => $this->when(), 'items' => [['dish_id' => $d->id, 'quantity' => 1]], 'message' => 'Happy birthday Zuri'], null, $this->now);
    }

    private function askCatering(array $o = []): CookingRequest
    {
        return $this->svc()->request($o + ['kind' => 'catering', 'name' => 'Brian', 'phone' => '0722000111', 'email' => 'brian@example.com', 'event_at' => $this->when(), 'headcount' => 50, 'fulfil' => 'serve', 'address' => 'Karen Country Club',
            'wishes' => 'Wedding lunch'], null, $this->now);
    }

    private function quoteLines(array $o = []): array
    {
        return ['lines' => [['name' => 'Buffet lunch', 'unit_price' => 1500, 'per_head' => true], ['name' => 'Waiters', 'unit_price' => 2000, 'quantity' => 4]]] + $o;
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

    /** A quoted cake that the customer has accepted and whose deposit has been asked for. */
    private function accepted(array $o = []): CookingRequest
    {
        $r = $this->askCake($this->cake(), $o);

        return $this->svc()->accept($r, ['payment_method_id' => 4], $this->user())['request'];
    }

    private function paidDeposit(CookingRequest $r, ?float $amount = null): CookingRequest
    {
        $this->svc()->paid(Voucher::findOrFail($r->invoice_id), $amount ?? (float) $r->deposit_amount);

        return $r->fresh();
    }

    // ------------------------------------------------------------ asking

    public function test_nothing_is_taken_until_the_owner_switches_it_on(): void
    {
        $d = $this->cake();
        $this->on(['custom_orders' => false]);
        $this->fails(fn () => $this->askCake($d), 'not taking cake or catering requests');
        $this->assertSame(0, CookingRequest::count());
    }

    public function test_a_dish_with_a_lead_time_is_a_cake_and_ordinary_dishes_are_not(): void
    {
        $cake = $this->cake('Red velvet', 4000, 72);
        $this->make('Chapati', 50);
        $this->assertSame(['Red velvet'], array_column($this->svc()->cakes(), 'name'));
        $this->assertSame(72, $this->svc()->cakes()[0]['lead_hours']);
        $this->fails(fn () => $this->askCake($this->make('Chapati2', 50)), 'is not made to order');
        $cake->update(['is_active' => false]);
        $this->assertSame([], $this->svc()->cakes());
    }

    public function test_a_cake_needs_its_notice_the_longest_of_the_dishes_asked_for(): void
    {
        $quick = $this->cake('Cupcakes', 800, 24);
        $slow = $this->cake('Wedding cake', 9000, 120);
        $this->fails(fn () => $this->askCake($quick, ['event_at' => '2026-10-13 11:00']), '1 day');            // 23 hours away
        $this->assertSame('quoted', $this->askCake($quick, ['event_at' => '2026-10-13 12:00'])->status);       // exactly 24 hours: allowed
        $this->fails(fn () => $this->askCake($quick, ['event_at' => '2026-10-16 12:00', 'items' => [['dish_id' => $quick->id, 'quantity' => 1], ['dish_id' => $slow->id, 'quantity' => 1]]]), '5 days');
        $this->assertSame('quoted', $this->askCake($quick, ['event_at' => '2026-10-17 12:00', 'items' => [['dish_id' => $quick->id, 'quantity' => 1], ['dish_id' => $slow->id, 'quantity' => 1]]])->status);
    }

    public function test_the_date_must_make_sense(): void
    {
        $d = $this->cake();
        $this->fails(fn () => $this->askCake($d, ['event_at' => 'whenever']), 'date and time');
        $this->fails(fn () => $this->askCake($d, ['event_at' => '2028-01-01 10:00']), 'too far ahead');
    }

    public function test_a_cake_is_priced_from_the_dish_and_quoted_at_once_with_the_deposit(): void
    {
        $d = $this->cake('Chocolate cake', 3000);
        $r = $this->askCake($d, ['items' => [['dish_id' => $d->id, 'quantity' => 2]]]);
        $this->assertSame('quoted', $r->status);
        $this->assertEquals(6000.0, (float) $r->subtotal);
        $this->assertEquals(960.0, (float) $r->tax_total);
        $this->assertEquals(6960.0, (float) $r->total);
        $this->assertEquals(50.0, (float) $r->deposit_pct);
        $this->assertEquals(3480.0, (float) $r->deposit_amount);
        $this->assertSame('2026-10-19', $r->valid_until->toDateString());
        $this->assertSame('Happy birthday Zuri', $r->details['message']);
        $this->assertSame([['requested', $r->number]], $this->told);
        $this->assertStringStartsWith('CR-', $r->number);
        $this->assertSame(40, strlen($r->track_token));
        $this->assertSame(1, $r->lines()->count());
        $this->assertEquals(3000.0, (float) $r->lines->first()->unit_price);
    }

    public function test_the_deposit_and_quote_days_come_from_the_settings(): void
    {
        $d = $this->cake();
        $this->on(['custom_deposit_pct' => 30, 'custom_quote_days' => 3]);
        $r = $this->askCake($d);
        $this->assertEquals(30.0, (float) $r->deposit_pct);
        $this->assertEquals(1044.0, (float) $r->deposit_amount);   // 30% of 3480 (3000 + 16%)
        $this->assertSame('2026-10-15', $r->valid_until->toDateString());
    }

    public function test_the_choices_on_a_cake_count_and_are_checked(): void
    {
        $d = $this->cake('Fruit cake', 2000);
        $g = DB::table('menus_option_groups')->insertGetId(['dish_id' => $d->id, 'name' => 'Size', 'kind' => 'single', 'min_choices' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $big = DB::table('menus_options')->insertGetId(['group_id' => $g, 'name' => '2 kg', 'price_delta' => 1500, 'is_default' => false, 'created_at' => now(), 'updated_at' => now()]);
        $this->fails(fn () => $this->askCake($d), 'Size');
        $r = $this->askCake($d, ['items' => [['dish_id' => $d->id, 'quantity' => 1, 'option_ids' => [$big]]]]);
        $this->assertEquals(3500.0, (float) $r->lines->first()->unit_price);
        $this->assertSame(['2 kg'], array_column($r->lines->first()->options, 'name'));
        $this->assertSame('Size', $this->svc()->cakes()[0]['groups'][0]['name']);
    }

    public function test_how_it_is_fetched_and_the_contact_are_checked(): void
    {
        $d = $this->cake();
        $this->fails(fn () => $this->askCake($d, ['fulfil' => 'serve']), 'Choose how you would like it');
        $this->fails(fn () => $this->askCake($d, ['fulfil' => 'delivery']), 'delivery address');
        $this->fails(fn () => $this->askCake($d, ['name' => ' ']), 'Enter your name');
        $this->fails(fn () => $this->askCake($d, ['phone' => '']), 'phone number');
        $this->fails(fn () => $this->askCake($d, ['email' => 'nope']), 'email');
        $this->fails(fn () => $this->askCake($d, ['items' => []]), 'Choose the cake');
        $this->fails(fn () => $this->svc()->request(['kind' => 'wedding'], null, $this->now), 'cake, catering or a private chef');
        $this->assertSame('delivery', $this->askCake($d, ['fulfil' => 'delivery', 'address' => 'Westlands'])->fulfil);
    }

    public function test_catering_waits_for_staff_and_needs_a_headcount_a_venue_and_notice(): void
    {
        $this->fails(fn () => $this->askCatering(['headcount' => null]), 'How many people');
        $this->fails(fn () => $this->askCatering(['headcount' => 0]), 'How many people');
        $this->fails(fn () => $this->askCatering(['address' => '']), 'Enter the venue');
        $this->fails(fn () => $this->askCatering(['event_at' => '2026-10-14 12:00']), '3 days');           // 72 hours' notice by default
        $r = $this->askCatering();
        $this->assertSame('requested', $r->status);
        $this->assertEquals(0.0, (float) $r->total);
        $this->assertSame(50, $r->headcount);
        $this->assertSame('Wedding lunch', $r->details['wishes']);
        $this->assertSame([['requested', $r->number]], $this->told);
    }

    // ------------------------------------------------------------ the quote

    public function test_staff_price_catering_and_a_per_head_line_follows_the_headcount(): void
    {
        $r = $this->askCatering();
        $q = $this->svc()->quote($r, $this->quoteLines(), $this->user());
        $this->assertSame('quoted', $q->status);
        $this->assertEquals(75000.0 + 8000.0, (float) $q->subtotal);       // 50 x 1500 + 4 x 2000
        $this->assertEquals(96280.0, (float) $q->total);                   // + 16%
        $this->assertEquals(48140.0, (float) $q->deposit_amount);
        $this->assertSame(50.0, (float) $q->lines->first()->quantity);
        $this->assertTrue($q->lines->first()->per_head);
        $this->assertSame('quoted', $this->told[1][0]);
        $q2 = $this->svc()->quote($q, $this->quoteLines(['headcount' => 60, 'deposit_pct' => 25, 'valid_days' => 14]), null);   // changed before it was accepted
        $this->assertSame(60.0, (float) $q2->lines->first()->quantity);
        $this->assertEquals(25.0, (float) $q2->deposit_pct);
        $this->assertSame('2026-10-26', $q2->valid_until->toDateString());
        $this->assertSame(2, $q2->lines()->count());   // the old lines were replaced
    }

    public function test_a_quote_is_checked(): void
    {
        $r = $this->askCatering();
        $this->fails(fn () => $this->svc()->quote($r, ['lines' => []], null), 'at least one line');
        $this->fails(fn () => $this->svc()->quote($r, ['lines' => [['name' => ' ', 'unit_price' => 5, 'quantity' => 1]]], null), 'needs a name');
        $this->fails(fn () => $this->svc()->quote($r, ['lines' => [['name' => 'A', 'unit_price' => 5, 'quantity' => 0]]], null), 'more than nothing');
        $this->fails(fn () => $this->svc()->quote($r, ['lines' => [['name' => 'A', 'unit_price' => -5, 'quantity' => 1]]], null), 'enter the price');
        $this->fails(fn () => $this->svc()->quote($r, $this->quoteLines(['deposit_pct' => 101]), null), '0 and 100');
        $this->fails(fn () => $this->svc()->quote($r, $this->quoteLines(['valid_days' => 0]), null), '1 and 90');
        $this->fails(fn () => $this->svc()->quote($r, $this->quoteLines(['headcount' => 9000]), null), '5000');
        $this->fails(fn () => $this->svc()->quote($r, ['lines' => [['dish_id' => 9999, 'unit_price' => 5, 'quantity' => 1]]], null), 'does not exist');
        $this->assertSame('requested', $r->fresh()->status);   // nothing above changed it
        $this->on(['sales_ledger_id' => null]);
        $this->fails(fn () => $this->svc()->quote($r, $this->quoteLines(), null), 'sales account');
    }

    public function test_a_dish_can_be_a_line_of_the_quote_and_is_booked_as_that_dish(): void
    {
        $d = $this->make('Pilau', 400);
        $r = $this->svc()->quote($this->askCatering(), ['lines' => [['dish_id' => $d->id, 'unit_price' => 350, 'quantity' => 50]]], null);
        $this->assertSame('Pilau', $r->lines->first()->name);
        $this->assertEquals(17500.0, (float) $r->subtotal);
        $a = $this->svc()->accept($r, ['payment_method_id' => 4], $this->user());
        $this->assertSame('dish', $this->orders[0]['lines'][0]['type']);
        $this->assertSame($d->id, $this->orders[0]['lines'][0]['dish_id']);
        $this->assertEquals(350.0, $this->orders[0]['lines'][0]['rate']);
    }

    public function test_a_quote_that_was_accepted_can_not_be_changed(): void
    {
        $r = $this->accepted();
        $this->fails(fn () => $this->svc()->quote($r, $this->quoteLines(), null), 'can not be changed');
    }

    // ------------------------------------------------------------ saying yes and paying the deposit

    public function test_accepting_needs_a_customer_account_and_the_right_one(): void
    {
        $r = $this->askCake($this->cake());
        $this->fails(fn () => $this->svc()->accept($r, ['payment_method_id' => 4], null), 'Sign in');
        $guest = User::forceCreate(['name' => 'Guest', 'email' => 'g@example.com']);
        $guest->setRelation('customer', null);
        $this->fails(fn () => $this->svc()->accept($r, ['payment_method_id' => 4], $guest), 'Sign in');
        $this->svc()->accept($r, ['payment_method_id' => 4], $this->user(5));
        $this->assertSame(5, $r->fresh()->customer_id);
        $second = $this->askCake($this->cake('Lemon cake'), ['user' => 1]);
        $second->update(['customer_id' => 5]);
        $this->fails(fn () => $this->svc()->accept($second->fresh(), ['payment_method_id' => 4], $this->user(6)), 'another account');
    }

    public function test_accepting_books_the_order_and_an_invoice_with_no_stock_and_asks_only_for_the_deposit(): void
    {
        $r = $this->askCake($this->cake('Chocolate cake', 3000));
        $res = $this->svc()->accept($r, ['payment_method_id' => 4], $this->user());
        $r = $res['request'];
        $this->assertSame('accepted', $r->status);
        $this->assertNotNull($r->voucher_id);
        $this->assertNotNull($r->invoice_id);
        $this->assertCount(1, $this->orders);
        $this->assertSame(5, $this->orders[0]['customer_id']);
        $this->assertSame($r->id, $this->orders[0]['meta']['menu_request_id']);
        [$src, $base, $opts] = $this->converted[0];
        $this->assertSame('sales', $base);
        $this->assertFalse($opts['moves_stock']);                       // the stock is taken when the job is ready
        $this->assertSame('2026-10-20', $opts['due_date']);
        $this->assertCount(1, $this->started);
        $this->assertEquals(1740.0, $this->started[0]['due']);          // the deposit, not the whole
        $this->assertSame($r->invoice_id, $this->started[0]['order']);
        $this->assertSame('0712345678', $this->started[0]['contact']['phone']);
        $this->assertArrayHasKey('attempt', $res);
        $this->assertStringContainsString('1,740.00', $res['message']);
    }

    public function test_the_deposit_must_be_paid_by_a_method_that_charges_automatically(): void
    {
        $r = $this->askCake($this->cake());
        $this->fails(fn () => $this->svc()->accept($r, [], $this->user()), 'Choose how to pay');
        DB::table('payment_methods')->insert(['id' => 5, 'name' => 'Bank slip', 'kind' => 'bank', 'is_active' => true, 'is_online' => true, 'gateway' => 'bank_slip']);
        $this->fails(fn () => $this->svc()->accept($r, ['payment_method_id' => 5], $this->user()), "can't be charged automatically");
        $this->fails(fn () => $this->svc()->accept($r, ['payment_method_id' => 1], $this->user()), 'Choose how to pay');   // cash is not an online way
        $this->fails(fn () => $this->svc()->accept($r, ['payment_method_id' => 999], $this->user()), 'Choose how to pay');
        $this->assertSame('quoted', $r->fresh()->status);
        $this->assertCount(0, $this->orders);
    }

    public function test_a_gateway_that_fails_leaves_the_quote_open(): void
    {
        $r = $this->askCake($this->cake());
        $this->gatewayFails = true;
        $this->fails(fn () => $this->svc()->accept($r, ['payment_method_id' => 4], $this->user()), 'could not start');
        $this->assertSame('quoted', $r->fresh()->status);
        $this->assertNull($r->fresh()->invoice_id);
    }

    public function test_an_expired_quote_can_not_be_accepted(): void
    {
        $r = $this->askCake($this->cake());
        Carbon::setTestNow($this->now->copy()->addDays(8));
        $this->fails(fn () => $this->svc()->accept($r, ['payment_method_id' => 4], $this->user()), 'ran out');
        $this->assertSame('expired', $r->fresh()->status);
    }

    public function test_a_quote_is_accepted_once(): void
    {
        $r = $this->accepted();
        $this->fails(fn () => $this->svc()->accept($r, ['payment_method_id' => 4], $this->user()), 'accepted this already');
        $this->assertCount(1, $this->orders);
    }

    public function test_no_deposit_confirms_at_once_and_asks_for_no_money(): void
    {
        $this->on(['custom_deposit_pct' => 0]);
        $r = $this->askCake($this->cake());
        $res = $this->svc()->accept($r, [], $this->user());
        $this->assertSame('confirmed', $res['request']->status);
        $this->assertSame([], $this->started);
        $this->assertContains(['confirmed', $r->number], $this->told);
    }

    public function test_the_deposit_confirms_the_job_once_and_a_part_payment_does_not(): void
    {
        $r = $this->accepted();
        $r = $this->paidDeposit($r, 1000.0);
        $this->assertSame('accepted', $r->status);
        $this->assertEquals(1000.0, (float) $r->paid_total);
        $r = $this->paidDeposit($r, 740.0);
        $this->assertSame('confirmed', $r->status);
        $this->assertNotNull($r->confirmed_at);
        $this->assertSame(1, count(array_filter($this->told, fn ($t) => $t[0] === 'confirmed')));
        $r = $this->paidDeposit($r, 500.0);   // the balance paid online later does not confirm it again
        $this->assertSame(1, count(array_filter($this->told, fn ($t) => $t[0] === 'confirmed')));
        $this->assertEquals(2240.0, (float) $r->paid_total);
    }

    public function test_a_payment_on_any_other_invoice_is_ignored(): void
    {
        $r = $this->accepted();
        $other = Voucher::create(['voucher_type_id' => 1, 'total_amount' => 10, 'meta' => []]);
        $this->svc()->paid($other, 500.0);
        $this->svc()->paid(Voucher::create(['voucher_type_id' => 1, 'total_amount' => 10, 'meta' => ['menu_request_id' => 999]]), 500.0);
        $this->assertEquals(0.0, (float) $r->fresh()->paid_total);
    }

    public function test_the_deposit_can_be_asked_for_again_and_only_what_is_still_due(): void
    {
        $r = $this->accepted();
        $res = $this->svc()->pay($r, ['payment_method_id' => 4], $this->user());
        $this->assertEquals(1740.0, $this->started[1]['due']);
        $this->assertStringContainsString('1,740.00', $res['message']);
        $r = $this->paidDeposit($r, 1000.0);
        $this->svc()->pay($r, ['payment_method_id' => 4], $this->user());
        $this->assertEquals(740.0, $this->started[2]['due']);
    }

    // ------------------------------------------------------------ the balance and the job

    public function test_the_balance_is_paid_online_after_the_deposit(): void
    {
        $r = $this->paidDeposit($this->accepted());
        $this->assertSame('confirmed', $r->status);
        $this->assertEquals(1740.0, $r->balance());
        $this->svc()->pay($r, ['payment_method_id' => 4], $this->user());
        $this->assertEquals(1740.0, $this->started[1]['due']);
        $this->fails(fn () => $this->svc()->pay($this->paidDeposit($r, 1740.0), ['payment_method_id' => 4], $this->user()), 'Nothing more is due');
        $this->fails(fn () => $this->svc()->pay($this->askCake($this->cake('Fudge cake')), ['payment_method_id' => 4], $this->user()), 'nothing to pay');
    }

    public function test_staff_take_money_at_the_counter_through_a_receipt_on_the_invoice(): void
    {
        $r = $this->accepted();
        $r = $this->svc()->takePayment($r, [['payment_method_id' => 1, 'amount' => 1740]], null);
        $this->assertSame('confirmed', $r->status);
        $this->assertSame($r->invoice_id, $this->received[0][0]);
        $this->assertEquals(1740.0, $this->received[0][1]['amount']);
        $this->assertSame(1, $this->received[0][1]['tenders'][0]['payment_method_id']);
        $this->fails(fn () => $this->svc()->takePayment($r, [['payment_method_id' => 1, 'amount' => 5000]], null), 'more than the 1,740.00');
        $this->fails(fn () => $this->svc()->takePayment($r, [['payment_method_id' => 1, 'amount' => 0]], null), 'amount received');
        $this->fails(fn () => $this->svc()->takePayment($r, [], null), 'amount received');
        $this->fails(fn () => $this->svc()->takePayment($this->askCake($this->cake('Carrot cake')), [['payment_method_id' => 1, 'amount' => 10]], null), 'once the quote is accepted');
        $r = $this->svc()->takePayment($r, [['payment_method_id' => 1, 'amount' => 1000], ['payment_method_id' => 2, 'amount' => 740]], null);
        $this->assertEquals(0.0, $r->balance());
    }

    public function test_a_job_moves_along_and_is_completed_only_when_paid_in_full(): void
    {
        $r = $this->paidDeposit($this->accepted());
        $this->fails(fn () => $this->svc()->advance($r, 'completed', null), 'can not become');
        $r = $this->svc()->advance($r, 'preparing', null);
        $this->assertSame('preparing', $r->status);
        $this->fails(fn () => $this->svc()->advance($r, 'preparing', null), 'can not become');
        $r = $this->svc()->advance($r, 'ready', null);
        $this->assertContains(['ready', $r->number], $this->told);
        $this->fails(fn () => $this->svc()->advance($r, 'completed', null), 'Take the balance of 1,740.00');
        $r = $this->svc()->takePayment($r, [['payment_method_id' => 1, 'amount' => 1740]], null);
        $r = $this->svc()->advance($r, 'completed', null);
        $this->assertSame('completed', $r->status);
        $this->assertNotNull($r->completed_at);
        $this->fails(fn () => $this->svc()->advance($r, 'ready', null), 'can not become');
        $this->assertFalse($r->open());
    }

    public function test_a_confirmed_job_can_go_straight_to_ready(): void
    {
        $r = $this->svc()->advance($this->paidDeposit($this->accepted()), 'ready', null);
        $this->assertSame('ready', $r->status);
    }

    public function test_the_stock_is_taken_when_the_job_is_ready_and_a_shortage_never_stops_it(): void
    {
        $r = $this->svc()->advance($this->paidDeposit($this->accepted()), 'ready', null);
        [$src, $base, $opts] = $this->converted[1];
        $this->assertSame('delivery_note', $base);
        $this->assertSame($r->voucher_id, $src);
        $this->assertSame($r->number, $opts['reference_no']);
        $this->assertSame('taken', $r->fresh()->details['stock']);

        $this->stockShort = true;
        $r2 = $this->svc()->advance($this->paidDeposit($this->askAccept('Zebra cake')), 'ready', null);
        $this->assertSame('ready', $r2->status);
        $this->assertStringContainsString('Not enough flour', $r2->fresh()->details['stock']);
        $this->assertSame('Happy birthday Zuri', $r2->fresh()->details['message']);   // what the customer wrote is kept
    }

    private function askAccept(string $name): CookingRequest
    {
        return $this->svc()->accept($this->askCake($this->cake($name)), ['payment_method_id' => 4], $this->user())['request'];
    }

    // ------------------------------------------------------------ turning down and cancelling

    public function test_a_request_or_quote_can_be_turned_down_with_a_reason(): void
    {
        $r = $this->askCatering();
        $r = $this->svc()->decline($r, '  We are fully booked that day  ');
        $this->assertSame('declined', $r->status);
        $this->assertSame('We are fully booked that day', $r->cancel_reason);
        $this->assertContains(['cancelled', $r->number], $this->told);
        $this->assertFalse($r->open());
        $this->fails(fn () => $this->svc()->decline($r, null), 'can not be turned down');
        $this->fails(fn () => $this->svc()->decline($this->accepted(), null), 'can not be turned down');
    }

    public function test_cancelling_before_any_money_cancels_the_books(): void
    {
        $r = $this->accepted();
        $r = $this->svc()->cancel($r, 'Changed my mind', null);
        $this->assertSame('cancelled', $r->status);
        $this->assertSame([$r->invoice_id, $r->voucher_id], $this->voided);
        $this->assertFalse($r->refundDue());
    }

    public function test_cancelling_after_a_deposit_keeps_the_books_and_flags_the_refund(): void
    {
        $r = $this->paidDeposit($this->accepted());
        $r = $this->svc()->cancel($r, null, null);
        $this->assertSame('cancelled', $r->status);
        $this->assertSame([], $this->voided);
        $this->assertTrue($r->refundDue());
        $this->assertSame([['requested', $r->number]], array_slice($this->told, 0, 1));
        $this->assertContains(['cancelled', $r->number], $this->told);
        $this->fails(fn () => $this->svc()->cancel($r, null, null), 'can not be cancelled');
    }

    public function test_a_quote_not_yet_accepted_is_cancelled_as_declined_and_a_ready_job_can_not_be_cancelled(): void
    {
        $q = $this->svc()->cancel($this->askCake($this->cake()), null, null);
        $this->assertSame('declined', $q->status);
        $this->assertSame([], $this->voided);
        $ready = $this->svc()->advance($this->paidDeposit($this->askAccept('Mango cake')), 'ready', null);
        $this->fails(fn () => $this->svc()->cancel($ready, null, null), 'is ready');
    }

    public function test_an_unanswered_quote_lapses_and_an_unpaid_acceptance_is_let_go_after_a_day(): void
    {
        $quoted = $this->askCake($this->cake());
        $unpaid = $this->askAccept('Plain cake');
        $paid = $this->paidDeposit($this->askAccept('Paid cake'));
        $this->assertSame(0, $this->svc()->sweep($this->now->copy()->addHours(23)));
        $this->assertSame(1, $this->svc()->sweep($this->now->copy()->addHours(25)));       // only the unpaid one
        $this->assertSame('cancelled', $unpaid->fresh()->status);
        $this->assertSame('quoted', $quoted->fresh()->status);
        $this->assertSame('confirmed', $paid->fresh()->status);
        $this->assertSame(1, $this->svc()->sweep($this->now->copy()->addDays(8)));        // the quote is a week old
        $this->assertSame('expired', $quoted->fresh()->status);
        $this->assertSame('confirmed', $paid->fresh()->status);
    }

    public function test_a_part_paid_deposit_is_not_let_go_after_a_day(): void
    {
        $r = $this->paidDeposit($this->askAccept('Half paid cake'), 500.0);
        $this->assertSame('accepted', $r->status);
        $this->assertSame(0, $this->svc()->sweep($this->now->copy()->addHours(30)));
        $this->assertSame('accepted', $r->fresh()->status);
    }

    // ------------------------------------------------------------ what people see

    public function test_the_customer_sees_the_quote_what_to_pay_and_never_our_notes(): void
    {
        $r = $this->askCake($this->cake(), ['notes' => 'VIP, give a discount']);
        $v = $this->svc()->customerView($r);
        $this->assertTrue($v['can_accept']);
        $this->assertSame('Quoted', $v['status_label']);
        $this->assertEquals(3480.0, $v['total']);
        $this->assertEquals(1740.0, $v['deposit_amount']);
        $this->assertSame(0.0, $v['pay_due']);
        $this->assertArrayNotHasKey('notes', $v);
        $this->assertArrayNotHasKey('track_token', $v);
        $this->assertArrayNotHasKey('phone', $v);
        $this->assertSame('VIP, give a discount', $this->svc()->staffView($r)['notes']);
        $a = $this->svc()->customerView($this->svc()->accept($r, ['payment_method_id' => 4], $this->user())['request']);
        $this->assertFalse($a['can_accept']);
        $this->assertEquals(1740.0, $a['pay_due']);
        $r->refresh();
        $r->update(['status' => 'confirmed', 'paid_total' => 1740]);
        $this->assertEquals(1740.0, $this->svc()->customerView($r)['pay_due']);
    }

    public function test_a_quote_past_its_date_can_not_be_accepted_from_the_page(): void
    {
        $r = $this->askCake($this->cake());
        Carbon::setTestNow($this->now->copy()->addDays(9));
        $this->assertFalse($this->svc()->customerView($r)['can_accept']);
    }

    public function test_staff_see_what_they_can_do_next(): void
    {
        $r = $this->askCatering();
        $v = $this->svc()->staffView($r);
        $this->assertTrue($v['can_quote']);
        $this->assertFalse($v['can_take_payment']);
        $r = $this->paidDeposit($this->accepted());
        $v = $this->svc()->staffView($r);
        $this->assertSame(['preparing', 'ready'], $v['next']);
        $this->assertTrue($v['can_take_payment']);
        $this->assertFalse($v['refund_due']);
    }

    public function test_booked_jobs_count_towards_the_prep_list_for_their_day_only(): void
    {
        $d = $this->cake('Prep cake', 3000);
        $quoted = $this->askCake($d, ['items' => [['dish_id' => $d->id, 'quantity' => 2]]]);
        $day = Carbon::parse('2026-10-20', 'Africa/Nairobi');
        $this->assertSame([], app(PrepService::class)->booked($day, 1));                                  // only asked: nothing booked yet
        $this->svc()->accept($quoted, ['payment_method_id' => 4], $this->user());
        $this->assertSame([], app(PrepService::class)->booked($day, 1));                                  // accepted but no deposit
        $this->paidDeposit($quoted->fresh());
        $this->assertEquals([$d->id => 2.0], app(PrepService::class)->booked($day, 1));
        $this->assertSame([], app(PrepService::class)->booked($day->copy()->addDay(), 1));                // another day
        DB::table('menus_orders')->insert(['id' => 90, 'number' => 'MO-90', 'track_token' => 'tok', 'order_type' => 'pickup', 'location_id' => 1, 'name' => 'W', 'phone' => '1', 'status' => 'placed', 'payment' => 'paid', 'fulfil_at' => '2026-10-20 10:00:00']);
        DB::table('menus_order_lines')->insert(['order_id' => 90, 'dish_id' => $d->id, 'name' => 'Prep cake', 'quantity' => 3]);
        $this->assertEquals([$d->id => 5.0], app(PrepService::class)->booked($day, 1));                   // an online order for the same dish adds to the job
        $free = $this->svc()->quote($this->askCatering(), ['lines' => [['name' => 'Waiters', 'unit_price' => 100, 'quantity' => 2]]], null);
        $this->paidDeposit($this->svc()->accept($free, ['payment_method_id' => 4], $this->user())['request']);
        $this->assertEquals([$d->id => 5.0], app(PrepService::class)->booked($day, 1));                   // a free line has no dish to make
        DB::table('menus_orders')->delete();
        DB::table('menus_order_lines')->delete();
        $this->assertSame([], app(PrepService::class)->booked($day, 2));                                  // another branch
        $this->svc()->advance($quoted->fresh(), 'ready', null);
        $this->assertSame([], app(PrepService::class)->booked($day, 1));                                  // made already
    }

    public function test_a_dish_keeps_its_lead_time_and_it_can_be_removed(): void
    {
        $d = $this->cake('Marble cake', 2500, 36);
        $this->assertSame(36, (int) $d->fresh()->lead_hours);
        $d = $this->dishes()->save(['name' => 'Marble cake', 'lead_hours' => 0], $d->id);
        $this->assertNull($d->fresh()->lead_hours);
        $this->assertSame([], $this->svc()->cakes());
    }

    public function test_the_settings_keep_to_their_limits(): void
    {
        $this->fails(fn () => MenusSettings::save(['custom_deposit_pct' => 101], null), 'between 0 and 100');
        $this->fails(fn () => MenusSettings::save(['custom_quote_days' => 0], null), 'between 1 and 90');
        $this->fails(fn () => MenusSettings::save(['custom_lead_hours' => 721], null), 'between 0 and 720');
        $s = MenusSettings::save(['custom_orders' => false], null);
        $this->assertFalse($s['custom_orders']);
        $this->assertSame(50.0, (float) $s['custom_deposit_pct']);
        $this->assertSame(7, MenusSettings::save(['custom_quote_days' => '7.0'], null)['custom_quote_days']);
        $this->assertSame(96, MenusSettings::save(['custom_lead_hours' => 96], null)['custom_lead_hours']);
    }
}
