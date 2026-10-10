<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\PaymentSettingsController;
use App\Models\Books\PaymentAttempt;
use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\CheckoutService;
use App\Services\Books\GatewayPaymentService;
use App\Services\Notify\Staff;
use App\Services\Payments\DarajaTester;
use App\Services\Payments\Gateways;
use App\Services\Payments\PaymentAlerts;
use App\Services\Payments\PaymentSettings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;

/**
 * Card payments from end to end around the providers: the owner's screen saves a provider and puts it on (or takes it off) the checkout, a payment is started and the
 * customer sent on, and what comes back (a webhook, the customer returning) is only ever believed after the provider is asked. The providers themselves are stood in for.
 */
class CardPaymentFlowTest extends NotifyTestCase
{
    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
        Gateways::forget();
        Schema::create('payment_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); foreach (['mpesa', 'stripe', 'paystack', 'flutterwave', 'pesapal', 'dpo'] as $p) { $t->longText($p . '_enc')->nullable(); } $t->json('versions')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('payment_setting_versions', function ($t) { $t->id(); $t->string('part', 20); $t->unsignedInteger('version_no'); $t->longText('snapshot_enc')->nullable(); $t->string('summary', 500)->nullable(); $t->json('changed_keys')->nullable(); $t->string('action', 20)->default('save'); $t->unsignedBigInteger('rolled_back_from')->nullable(); $t->boolean('tested_ok')->nullable(); $t->boolean('has_secrets')->default(false); $t->dateTime('secrets_purged_at')->nullable(); $t->unsignedBigInteger('secrets_purged_by')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamp('created_at')->nullable(); $t->unique(['part', 'version_no']); });
        Schema::create('payment_setting_logs', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('event', 40); $t->string('part', 20)->nullable(); $t->unsignedBigInteger('version_id')->nullable(); $t->string('summary', 500)->nullable(); $t->json('context')->nullable(); $t->string('ip', 45)->nullable(); $t->timestamp('created_at')->nullable(); });
        Schema::create('ledger_groups', function ($t) { $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->timestamps(); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->unsignedBigInteger('group_id')->nullable(); $t->string('name'); $t->boolean('is_active')->default(true); $t->boolean('offer_at_checkout')->default(false); $t->timestamps(); });
        Schema::create('payment_methods', function ($t) { $t->id(); $t->string('name'); $t->string('code')->nullable(); $t->string('kind')->nullable(); $t->unsignedBigInteger('ledger_id')->nullable(); $t->boolean('is_online')->default(false); $t->string('gateway')->nullable(); $t->boolean('requires_reference')->default(false); $t->text('instructions')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('payment_attempts', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('customer_id')->nullable(); $t->unsignedBigInteger('payment_method_id')->nullable(); $t->string('gateway', 30)->nullable(); $t->string('status')->default('pending'); $t->decimal('amount', 12, 2)->default(0); $t->unsignedBigInteger('currency_id')->nullable(); $t->decimal('gateway_amount', 12, 2)->nullable(); $t->string('gateway_currency')->nullable(); $t->string('phone')->nullable(); $t->string('merchant_request_id')->nullable(); $t->string('checkout_request_id')->nullable(); $t->string('receipt_number')->nullable(); $t->json('callback_raw')->nullable(); $t->string('failure_reason')->nullable(); $t->json('tenders')->nullable(); $t->unsignedBigInteger('settled_voucher_id')->nullable(); $t->dateTime('confirmed_at')->nullable(); $t->dateTime('failed_at')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->text('notes')->nullable(); $t->timestamps(); });
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('base_type'); $t->timestamps(); });
        DB::table('voucher_types')->insert(['id' => 1, 'base_type' => 'sales_order']);
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('voucher_number')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->string('status')->default('posted'); $t->json('meta')->nullable(); $t->timestamps(); });
        Schema::table('currencies', function ($t) { $t->string('name')->nullable(); $t->string('symbol')->nullable(); $t->decimal('conversion_rate', 16, 8)->default(1); $t->decimal('anchor_rate', 16, 8)->nullable(); $t->boolean('is_active')->default(true); $t->timestamps(); });
        DB::table('currencies')->insert([['id' => 2, 'code' => 'USD', 'is_base' => false, 'is_active' => true, 'conversion_rate' => 100]]);
        DB::table('currencies')->where('id', 1)->update(['is_active' => true]);
        PaymentSettings::forget();
        $this->owner = User::forceCreate(['id' => 21, 'name' => 'Owner One', 'email' => 'owner@example.com', 'password' => Hash::make('correct-horse')]);
        $this->app->instance(Staff::class, new class([$this->owner]) extends Staff {
            public function __construct(public array $users)
            {
            }

            public function holding(string $permission): \Illuminate\Support\Collection
            {
                return collect($this->users);
            }
        });
        $this->mock(\App\Services\DarajaService::class);
        $gid = DB::table('ledger_groups')->insertGetId(['name' => 'Bank Accounts']);
        DB::table('ledgers')->insert([['id' => 7, 'group_id' => $gid, 'name' => 'Stripe clearing'], ['id' => 8, 'group_id' => 999, 'name' => 'Not a bank']]);
        config(['app.frontend_url' => 'https://shop.example.com', 'app.url' => 'https://api.example.com']);
    }

    private function controller(): PaymentSettingsController
    {
        return new PaymentSettingsController(app(PaymentSettings::class), app(DarajaTester::class), app(PaymentAlerts::class));
    }

    private function req(array $data = [], string $method = 'PUT'): Request
    {
        $r = Request::create('/x', $method, $data);
        $r->setUserResolver(fn () => $this->owner);

        return $r;
    }

    private function saveStripe(array $o = []): \Illuminate\Http\JsonResponse
    {
        return $this->controller()->update($this->req($o + ['secret_key' => 'sk_test_ABCDEFGH', 'webhook_secret' => 'whsec_test', 'enabled' => true, 'ledger_id' => 7, 'password' => 'correct-horse']), 'stripe');
    }

    // ------------------------------------------------------------ the owner's screen

    public function test_saving_a_provider_with_an_account_puts_it_on_the_checkout_and_marks_the_account_as_offered(): void
    {
        Http::fake(['api.stripe.com/*' => Http::response(['livemode' => false], 200)]);
        $r = $this->saveStripe();
        $this->assertSame(200, $r->getStatusCode());
        $m = PaymentMethod::where('gateway', 'stripe')->first();
        $this->assertTrue($m->is_active && $m->is_online);
        $this->assertSame([7, 'card', 'card_stripe'], [$m->ledger_id, $m->kind, $m->code]);
        $this->assertTrue((bool) DB::table('ledgers')->where('id', 7)->value('offer_at_checkout'));
        $this->assertTrue(PaymentMethod::offeredAtCheckout()->where('gateway', 'stripe')->exists());
    }

    public function test_a_provider_whose_keys_the_provider_refuses_is_not_saved_and_not_offered(): void
    {
        Http::fake(['api.stripe.com/*' => Http::response(['error' => ['message' => 'Invalid API Key provided']], 401)]);
        $res = $this->saveStripe();
        $this->assertSame(422, $res->getStatusCode());
        $this->assertStringContainsString('Invalid API Key provided', $res->getData(true)['message']);
        $this->assertSame(0, PaymentMethod::count());
        $this->assertFalse(app(PaymentSettings::class)->isSaved('stripe'));
    }

    public function test_switching_it_on_needs_an_account_to_book_into(): void
    {
        Http::fake(['api.stripe.com/*' => Http::response(['livemode' => false], 200)]);
        $res = $this->controller()->update($this->req(['secret_key' => 'sk_test_ABCDEFGH', 'enabled' => true, 'password' => 'correct-horse']), 'stripe');
        $this->assertSame(422, $res->getStatusCode());
        $this->assertStringContainsString('account the money is booked into', $res->getData(true)['message']);
        $this->assertSame(0, PaymentMethod::count());
    }

    public function test_switching_it_off_takes_it_off_the_checkout_but_keeps_the_method_for_past_payments(): void
    {
        Http::fake(['api.stripe.com/*' => Http::response(['livemode' => false], 200)]);
        $this->saveStripe();
        $this->controller()->update($this->req(['enabled' => false, 'password' => 'correct-horse']), 'stripe');
        $m = PaymentMethod::where('gateway', 'stripe')->first();
        $this->assertNotNull($m);
        $this->assertFalse($m->is_active);
        $this->assertFalse(PaymentMethod::offeredAtCheckout()->where('gateway', 'stripe')->exists());
    }

    public function test_clearing_a_provider_removes_its_keys_and_switches_it_off(): void
    {
        Http::fake(['api.stripe.com/*' => Http::response(['livemode' => false], 200)]);
        $this->saveStripe();
        $this->controller()->reset($this->req(['password' => 'correct-horse'], 'POST'), 'stripe');
        PaymentSettings::forget();
        $this->assertSame('', app(PaymentSettings::class)->get('stripe')['secret_key']);
        $this->assertFalse((bool) PaymentMethod::where('gateway', 'stripe')->value('is_active'));
    }

    public function test_the_screen_gets_every_provider_with_its_fields_and_webhook_address_but_never_a_key(): void
    {
        Http::fake(['api.stripe.com/*' => Http::response(['livemode' => false], 200)]);
        $this->saveStripe();
        $raw = $this->controller()->show($this->req([], 'GET'))->getContent();
        $this->assertStringNotContainsString('sk_test_ABCDEFGH', $raw);
        $this->assertStringNotContainsString('whsec_test', $raw);
        $d = json_decode($raw, true);
        $this->assertTrue($d['cards_ready']);
        $this->assertSame(['stripe', 'paystack', 'flutterwave', 'pesapal', 'dpo'], array_column($d['gateways'], 'key'));
        $stripe = $d['gateways'][0];
        $this->assertSame(url('/api/payments/webhook/stripe'), $stripe['webhook_url']);
        $this->assertTrue($stripe['ready']);
        $this->assertContains('offer_link', array_column($stripe['fields'], 'key'));
        $this->assertSame(['set' => true, 'hint' => '••••EFGH'], $d['parts']['stripe']['secret_key']);
        $this->assertSame([['id' => 7, 'name' => 'Stripe clearing']], $d['ledgers'], 'only bank and cash accounts can be chosen');
    }

    public function test_the_key_test_uses_typed_keys_and_saves_nothing(): void
    {
        Http::fake(['api.stripe.com/*' => Http::response(['livemode' => true], 200)]);
        $res = $this->controller()->testCard($this->req(['secret_key' => 'sk_live_TYPED'], 'POST'), 'stripe');
        $this->assertSame(200, $res->getStatusCode());
        $this->assertStringContainsString('live', $res->getData(true)['message']);
        $this->assertFalse(app(PaymentSettings::class)->isSaved('stripe'));
        Http::assertSent(fn ($req) => $req->hasHeader('Authorization', 'Bearer sk_live_TYPED'));
        $this->expectException(\Symfony\Component\HttpKernel\Exception\NotFoundHttpException::class);
        $this->controller()->testCard($this->req([], 'POST'), 'nonsense');
    }

    // ------------------------------------------------------------ starting a payment

    private function stripeOn(): PaymentMethod
    {
        Http::fake(['api.stripe.com/v1/balance' => Http::response(['livemode' => false], 200)]);
        $this->saveStripe();

        return PaymentMethod::where('gateway', 'stripe')->first();
    }

    private function order(float $total = 1000.0, int $currency = 1): Voucher
    {
        return Voucher::forceCreate(['voucher_type_id' => 1, 'voucher_number' => 'ORD-7', 'currency_id' => $currency, 'customer_id' => null, 'status' => 'posted', 'meta' => ['contact' => ['email' => 'amina@example.com']]]);
    }

    public function test_starting_a_card_payment_records_the_attempt_and_sends_the_customer_to_the_provider(): void
    {
        $method = $this->stripeOn();
        Http::fake(['api.stripe.com/v1/checkout/sessions' => Http::response(['id' => 'cs_test_1', 'url' => 'https://checkout.stripe.com/c/pay/cs_test_1'], 200)]);
        $order = $this->order();
        $r = app(GatewayPaymentService::class)->start($order, $method, ['email' => 'amina@example.com', 'phone' => '0712345678', 'name' => 'Amina'], [], 1000.0);
        $a = $r['attempt'];
        $this->assertSame('https://checkout.stripe.com/c/pay/cs_test_1', $r['redirect_url']);
        $this->assertSame(['stripe', 'pending', 'cs_test_1', 'KES'], [$a->gateway, $a->status, $a->checkout_request_id, $a->gateway_currency]);
        $this->assertMatchesRegularExpression('/^TISL-' . $a->id . '-[A-F0-9]{6}$/', $a->merchant_request_id);
        Http::assertSent(function ($req) use ($a) {
            parse_str($req->body(), $f);

            return str_contains($req->url(), '/checkout/sessions') && $f['success_url'] === 'https://shop.example.com/payment/return?attempt=' . $a->id . '&t=' . GatewayPaymentService::returnToken($a->id)
                && $f['client_reference_id'] === $a->merchant_request_id && $f['line_items'][0]['price_data']['unit_amount'] === '100000';
        });
    }

    public function test_a_provider_that_will_not_start_leaves_a_failed_attempt_and_a_kind_message(): void
    {
        $method = $this->stripeOn();
        Http::fake(['api.stripe.com/v1/checkout/sessions' => Http::response(['error' => ['message' => 'Invalid currency']], 400)]);
        try {
            app(GatewayPaymentService::class)->start($this->order(), $method, ['email' => 'a@b.co'], [], 1000.0);
            $this->fail('Expected a refusal');
        } catch (BooksException $e) {
            $this->assertStringContainsString('could not start the card payment (Stripe)', $e->getMessage());
            $this->assertStringNotContainsString('Invalid currency', $e->getMessage(), 'the provider\'s words are for the log, not the customer');
        }
        $this->assertSame('failed', PaymentAttempt::first()->status);
    }

    public function test_a_provider_that_was_switched_off_after_the_method_was_chosen_is_refused(): void
    {
        $method = $this->stripeOn();
        $this->controller()->update($this->req(['enabled' => false, 'password' => 'correct-horse']), 'stripe');
        $this->expectException(BooksException::class);
        app(GatewayPaymentService::class)->start($this->order(), $method, [], [], 1000.0);
    }

    public function test_the_charge_currency_converts_the_order_amount(): void
    {
        $method = $this->stripeOn();
        $this->controller()->update($this->req(['charge_currency' => 'usd', 'password' => 'correct-horse']), 'stripe');
        Http::fake(['api.stripe.com/v1/checkout/sessions' => Http::response(['id' => 'cs_2', 'url' => 'https://x'], 200)]);
        $r = app(GatewayPaymentService::class)->start($this->order(), $method, ['email' => 'a@b.co'], [], 1000.0);
        $this->assertSame(['USD', 10.0], [$r['attempt']->gateway_currency, (float) $r['attempt']->gateway_amount]);
        $this->assertSame(1000.0, (float) $r['attempt']->amount, 'the order is still owed in its own currency');
    }

    public function test_only_automatic_methods_are_charged_here(): void
    {
        $this->assertTrue(GatewayPaymentService::isAutomatic(new PaymentMethod(['gateway' => 'mpesa_stk'])));
        $this->assertTrue(GatewayPaymentService::isAutomatic(new PaymentMethod(['gateway' => 'pesapal'])));
        $this->assertFalse(GatewayPaymentService::isAutomatic(new PaymentMethod(['gateway' => null])));
        $this->assertFalse(GatewayPaymentService::isAutomatic(null));
        $this->expectException(BooksException::class);
        app(GatewayPaymentService::class)->start($this->order(), new PaymentMethod(['name' => 'Bank', 'gateway' => null]), [], [], 5.0);
    }

    // ------------------------------------------------------------ hearing back

    /** @return array{0: PaymentAttempt, 1: array} the attempt, and what the books were asked to settle */
    private function pending(float $amount = 1000.0): array
    {
        $this->stripeOn();
        $order = $this->order();
        $a = PaymentAttempt::forceCreate(['voucher_id' => $order->id, 'payment_method_id' => 1, 'gateway' => 'stripe', 'status' => 'pending', 'amount' => $amount, 'currency_id' => 1,
            'gateway_amount' => $amount, 'gateway_currency' => 'KES', 'merchant_request_id' => 'TISL-1-AAAAAA', 'checkout_request_id' => 'cs_test_1', 'tenders' => []]);
        $settled = [];
        $checkout = \Mockery::mock(CheckoutService::class);
        $checkout->shouldReceive('settle')->andReturnUsing(function ($o, $tenders) use (&$settled) {
            $settled[] = [$o->id, $tenders];

            return (new Voucher)->forceFill(['id' => 900]);
        });
        $this->app->instance(CheckoutService::class, $checkout);
        $this->settled = &$settled;

        return [$a, $settled];
    }

    private array $settled = [];

    private function providerSays(string $status, string $payment, int $cents = 100000, string $currency = 'kes'): void
    {
        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::fake(['api.stripe.com/v1/checkout/sessions/cs_test_1' => Http::response(['status' => $status, 'payment_status' => $payment, 'amount_total' => $cents, 'currency' => $currency, 'payment_intent' => 'pi_77'], 200)]);
    }

    public function test_a_paid_session_is_confirmed_and_booked_once_however_many_times_we_hear_about_it(): void
    {
        [$a] = $this->pending();
        $this->providerSays('complete', 'paid');
        $svc = app(GatewayPaymentService::class);
        $svc->verifyCard($a);
        $svc->verifyCard($a->fresh());
        $svc->refresh($a->fresh());
        $a = $a->fresh();
        $this->assertSame(['confirmed', 'pi_77', 900], [$a->status, $a->receipt_number, $a->settled_voucher_id]);
        $this->assertCount(1, $this->settled, 'booked exactly once');
        $this->assertSame([['payment_method_id' => 1, 'amount' => 1000.0, 'reference' => 'pi_77']], $this->settled[0][1]);
    }

    public function test_an_unpaid_session_stays_waiting_and_an_expired_one_fails(): void
    {
        [$a] = $this->pending();
        $this->providerSays('open', 'unpaid');
        app(GatewayPaymentService::class)->verifyCard($a);
        $this->assertSame('pending', $a->fresh()->status);
        $this->providerSays('expired', 'unpaid');
        app(GatewayPaymentService::class)->verifyCard($a->fresh());
        $this->assertSame('failed', $a->fresh()->status);
        $this->assertSame([], $this->settled);
    }

    public function test_less_money_or_another_currency_than_asked_is_never_booked_on_its_own(): void
    {
        [$a] = $this->pending();
        $this->providerSays('complete', 'paid', 50000);
        app(GatewayPaymentService::class)->verifyCard($a);
        $this->assertSame('pending', $a->fresh()->status);
        $this->assertStringContainsString('check it with the provider', $a->fresh()->notes);
        $this->providerSays('complete', 'paid', 100000, 'usd');
        app(GatewayPaymentService::class)->verifyCard($a->fresh());
        $this->assertSame('pending', $a->fresh()->status);
        $this->assertSame([], $this->settled);
    }

    public function test_more_than_asked_is_fine(): void
    {
        [$a] = $this->pending();
        $this->providerSays('complete', 'paid', 100500);
        app(GatewayPaymentService::class)->verifyCard($a);
        $this->assertSame('confirmed', $a->fresh()->status);
    }

    private function stripeHook(array $over = [], ?string $secret = 'whsec_test', ?int $at = null): Request
    {
        $body = json_encode(['type' => 'checkout.session.completed', 'data' => ['object' => $over + ['id' => 'cs_test_1', 'client_reference_id' => 'TISL-1-AAAAAA']]]);
        $r = Request::create('/api/payments/webhook/stripe', 'POST', [], [], [], [], $body);
        $t = $at ?? time();
        $r->headers->set('Stripe-Signature', "t={$t},v1=" . hash_hmac('sha256', $t . '.' . $body, $secret));

        return $r;
    }

    public function test_a_signed_webhook_makes_us_ask_the_provider_and_only_then_book(): void
    {
        [$a] = $this->pending();
        $this->providerSays('complete', 'paid');
        $this->assertTrue(app(GatewayPaymentService::class)->handleWebhook('stripe', $this->stripeHook()));
        $this->assertSame('confirmed', $a->fresh()->status);
        Http::assertSent(fn ($req) => str_contains($req->url(), '/checkout/sessions/cs_test_1'));
    }

    public function test_a_webhook_that_says_paid_while_the_provider_says_unpaid_books_nothing(): void
    {
        [$a] = $this->pending();
        $this->providerSays('open', 'unpaid');
        $this->assertTrue(app(GatewayPaymentService::class)->handleWebhook('stripe', $this->stripeHook(['payment_status' => 'paid'])));
        $this->assertSame('pending', $a->fresh()->status);
    }

    public function test_a_forged_or_replayed_webhook_is_refused_and_asks_the_provider_nothing(): void
    {
        [$a] = $this->pending();
        $this->providerSays('complete', 'paid');
        $svc = app(GatewayPaymentService::class);
        $this->assertFalse($svc->handleWebhook('stripe', $this->stripeHook([], 'whsec_wrong')));
        $this->assertFalse($svc->handleWebhook('stripe', $this->stripeHook([], 'whsec_test', time() - 7200)));
        $this->assertSame('pending', $a->fresh()->status);
        Http::assertNothingSent();
    }

    public function test_a_webhook_for_a_payment_we_do_not_know_is_accepted_quietly(): void
    {
        $this->pending();
        $this->providerSays('complete', 'paid');
        $this->assertTrue(app(GatewayPaymentService::class)->handleWebhook('stripe', $this->stripeHook(['id' => 'cs_other', 'client_reference_id' => 'TISL-99-ZZZZZZ'])));
        $this->assertSame([], $this->settled);
    }

    public function test_a_webhook_does_not_find_another_providers_payment(): void
    {
        [$a] = $this->pending();
        $a->update(['gateway' => 'paystack']);
        $this->providerSays('complete', 'paid');
        $this->assertTrue(app(GatewayPaymentService::class)->handleWebhook('stripe', $this->stripeHook()));
        $this->assertSame('pending', $a->fresh()->status);
    }

    // ------------------------------------------------------------ the public doors

    public function test_the_webhook_door_answers_400_for_a_forgery_and_the_providers_own_reply_otherwise(): void
    {
        [$a] = $this->pending();
        $this->providerSays('complete', 'paid');
        $hook = $this->stripeHook();
        $this->call('POST', '/api/payments/webhook/stripe', [], [], [], ['HTTP_STRIPE_SIGNATURE' => $hook->header('Stripe-Signature')], $hook->getContent())->assertOk()->assertJson(['received' => true]);
        $this->assertSame('confirmed', $a->fresh()->status);
        $this->call('POST', '/api/payments/webhook/stripe', [], [], [], ['HTTP_STRIPE_SIGNATURE' => 't=1,v1=bad'], $hook->getContent())->assertStatus(400);
        $this->postJson('/api/payments/webhook/nonsense', [])->assertNotFound();
    }

    public function test_the_return_page_status_needs_the_code_in_the_link(): void
    {
        [$a] = $this->pending();
        $this->getJson('/api/payments/attempts/' . $a->id)->assertNotFound();
        $this->getJson('/api/payments/attempts/' . $a->id . '?t=' . str_repeat('0', 32))->assertNotFound();
        $t = GatewayPaymentService::returnToken($a->id);
        $this->getJson('/api/payments/attempts/' . $a->id . '?t=' . $t)->assertOk()->assertJson(['status' => 'pending', 'order_number' => 'ORD-7', 'amount' => 1000.0]);
        $other = PaymentAttempt::forceCreate(['voucher_id' => 1, 'gateway' => 'stripe', 'status' => 'pending', 'amount' => 5]);
        $this->getJson('/api/payments/attempts/' . $other->id . '?t=' . $t)->assertNotFound();   // the code belongs to one payment only
    }

    public function test_coming_back_and_asking_to_check_books_a_paid_payment_without_a_webhook(): void
    {
        [$a] = $this->pending();
        $this->providerSays('complete', 'paid');
        $t = GatewayPaymentService::returnToken($a->id);
        $this->getJson('/api/payments/attempts/' . $a->id . '?check=1&t=' . $t)->assertOk()->assertJson(['status' => 'confirmed', 'receipt' => 'pi_77']);
        $this->assertCount(1, $this->settled);
    }
}
