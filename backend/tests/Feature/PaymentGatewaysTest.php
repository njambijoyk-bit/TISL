<?php

namespace Tests\Feature;

use App\Models\Books\PaymentAttempt;
use App\Services\Payments\Gateways\Dpo;
use App\Services\Payments\Gateways\Flutterwave;
use App\Services\Payments\Gateways\Paystack;
use App\Services\Payments\Gateways\Pesapal;
use App\Services\Payments\Gateways\Stripe;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The five card providers, each against a stand-in for its API (the requests we send and the answers we read are the providers' documented ones; nothing here calls them for real):
 * what is sent to start a payment, what a provider's answer means, and which webhooks are believed.
 */
class PaymentGatewaysTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.default' => 'array']);
        Cache::flush();
    }

    private function p(array $o = []): array
    {
        return $o + ['reference' => 'TISL-7-ABC123', 'amount' => 1250.0, 'currency' => 'KES', 'email' => 'amina@example.com', 'phone' => '0712345678', 'name' => 'Amina Wanjiru', 'description' => 'Order PRE-00007',
            'return_url' => 'https://shop.example.com/payment/return?attempt=7&t=x', 'cancel_url' => 'https://shop.example.com/cart', 'webhook_url' => 'https://shop.example.com/api/payments/webhook/x', 'attempt_id' => 7];
    }

    private function attempt(?string $providerRef, ?string $ourRef = 'TISL-7-ABC123'): PaymentAttempt
    {
        return (new PaymentAttempt)->forceFill(['id' => 7, 'checkout_request_id' => $providerRef, 'merchant_request_id' => $ourRef]);
    }

    private function hook(string $body, array $headers = [], string $method = 'POST'): Request
    {
        $r = Request::create('/x', $method, [], [], [], [], $body);
        foreach ($headers as $k => $v) {
            $r->headers->set($k, $v);
        }

        return $r;
    }

    // ------------------------------------------------------------ Stripe

    public function test_stripe_starts_a_checkout_session_with_the_amount_in_cents_and_link_when_asked(): void
    {
        Http::fake(['api.stripe.com/*' => Http::response(['id' => 'cs_test_1', 'url' => 'https://checkout.stripe.com/c/pay/cs_test_1'], 200)]);
        $r = (new Stripe)->start(['secret_key' => 'sk_test_abc', 'offer_link' => true], $this->p());
        $this->assertSame(['redirect_url' => 'https://checkout.stripe.com/c/pay/cs_test_1', 'provider_ref' => 'cs_test_1'], $r);
        Http::assertSent(function ($req) {
            $f = [];
            parse_str($req->body(), $f);

            return $req->url() === 'https://api.stripe.com/v1/checkout/sessions' && $req->hasHeader('Authorization', 'Bearer sk_test_abc')
                && $f['mode'] === 'payment' && $f['payment_method_types'] === ['card', 'link'] && $f['client_reference_id'] === 'TISL-7-ABC123'
                && $f['line_items'][0]['price_data']['unit_amount'] === '125000' && $f['line_items'][0]['price_data']['currency'] === 'kes'
                && $f['customer_email'] === 'amina@example.com' && $f['cancel_url'] === 'https://shop.example.com/cart';
        });
    }

    public function test_stripe_amounts_without_cents_are_not_multiplied_and_a_refusal_is_explained(): void
    {
        Http::fake(['api.stripe.com/*' => Http::response(['error' => ['message' => 'Invalid API Key provided']], 401)]);
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Invalid API Key provided');
        (new Stripe)->start(['secret_key' => 'sk_test_bad'], $this->p(['currency' => 'UGX', 'amount' => 5000.0]));
    }

    public function test_stripe_zero_decimal_amount(): void
    {
        Http::fake(['api.stripe.com/*' => Http::response(['id' => 'cs_1', 'url' => 'https://x'], 200)]);
        (new Stripe)->start(['secret_key' => 'sk_test_abc'], $this->p(['currency' => 'UGX', 'amount' => 5000.0]));
        Http::assertSent(function ($req) {
            parse_str($req->body(), $f);

            return $f['line_items'][0]['price_data']['unit_amount'] === '5000' && $f['payment_method_types'] === ['card'];
        });
    }

    public function test_stripe_verify_reads_the_session(): void
    {
        $g = new Stripe;
        Http::fake(['api.stripe.com/v1/checkout/sessions/cs_paid' => Http::response(['payment_status' => 'paid', 'status' => 'complete', 'amount_total' => 125000, 'currency' => 'kes', 'payment_intent' => 'pi_9'], 200),
            'api.stripe.com/v1/checkout/sessions/cs_open' => Http::response(['payment_status' => 'unpaid', 'status' => 'open', 'currency' => 'kes'], 200),
            'api.stripe.com/v1/checkout/sessions/cs_old' => Http::response(['payment_status' => 'unpaid', 'status' => 'expired', 'currency' => 'kes'], 200)]);
        $cfg = ['secret_key' => 'sk_test_abc'];
        $this->assertSame(['paid', 1250.0, 'KES', 'pi_9'], array_values(array_intersect_key($g->verify($cfg, $this->attempt('cs_paid')), array_flip(['state', 'amount', 'currency', 'receipt']))));
        $this->assertSame('pending', $g->verify($cfg, $this->attempt('cs_open'))['state']);
        $this->assertSame('failed', $g->verify($cfg, $this->attempt('cs_old'))['state']);
        $this->assertSame('pending', $g->verify($cfg, $this->attempt(null))['state'], 'nothing to ask about yet');
    }

    public function test_stripe_webhooks_need_a_good_fresh_signature(): void
    {
        $g = new Stripe;
        $cfg = ['webhook_secret' => 'whsec_test'];
        $body = json_encode(['type' => 'checkout.session.completed', 'data' => ['object' => ['id' => 'cs_1', 'client_reference_id' => 'TISL-7-ABC123']]]);
        $sign = fn (int $t, string $b = null, string $secret = 'whsec_test') => "t={$t},v1=" . hash_hmac('sha256', $t . '.' . ($b ?? $body), $secret);

        $this->assertSame(['reference' => 'TISL-7-ABC123', 'provider_ref' => 'cs_1'], $g->parseWebhook($this->hook($body, ['Stripe-Signature' => $sign(time())]), $cfg));
        $this->assertNull($g->parseWebhook($this->hook($body, ['Stripe-Signature' => $sign(time(), null, 'whsec_other')]), $cfg), 'signed with another secret');
        $this->assertNull($g->parseWebhook($this->hook($body . ' ', ['Stripe-Signature' => $sign(time())]), $cfg), 'the body was changed');
        $this->assertNull($g->parseWebhook($this->hook($body, ['Stripe-Signature' => $sign(time() - 3600)]), $cfg), 'an old one replayed');
        $this->assertNull($g->parseWebhook($this->hook($body), $cfg), 'no signature');
        $this->assertNull($g->parseWebhook($this->hook($body, ['Stripe-Signature' => $sign(time())]), ['webhook_secret' => '']), 'no secret saved: nothing is believed');
        $other = json_encode(['type' => 'customer.created', 'data' => ['object' => []]]);
        $this->assertNull($g->parseWebhook($this->hook($other, ['Stripe-Signature' => $sign(time(), $other)]), $cfg), 'not about a payment');
    }

    public function test_stripe_test_and_configured(): void
    {
        $g = new Stripe;
        $this->assertTrue($g->configured(['secret_key' => 'sk_live_x']));
        $this->assertFalse($g->configured(['secret_key' => 'pk_live_x']));
        Http::fake(['api.stripe.com/v1/balance' => Http::response(['livemode' => false], 200)]);
        $this->assertStringContainsString('test mode', $g->test(['secret_key' => 'sk_test_x'])['message']);
        $this->assertFalse($g->test(['secret_key' => 'nope'])['ok']);
    }

    // ------------------------------------------------------------ Paystack

    public function test_paystack_initialises_in_kobo_style_minor_units_with_our_reference(): void
    {
        Http::fake(['api.paystack.co/*' => Http::response(['status' => true, 'data' => ['authorization_url' => 'https://checkout.paystack.com/abc', 'access_code' => 'abc', 'reference' => 'TISL-7-ABC123']], 200)]);
        $r = (new Paystack)->start(['secret_key' => 'sk_test_x'], $this->p());
        $this->assertSame(['redirect_url' => 'https://checkout.paystack.com/abc', 'provider_ref' => 'TISL-7-ABC123'], $r);
        Http::assertSent(fn ($req) => $req['amount'] === 125000 && $req['currency'] === 'KES' && $req['reference'] === 'TISL-7-ABC123' && $req['email'] === 'amina@example.com' && $req['callback_url'] === 'https://shop.example.com/payment/return?attempt=7&t=x');
    }

    public function test_paystack_verify_and_webhook(): void
    {
        $g = new Paystack;
        Http::fake(['api.paystack.co/transaction/verify/PAID' => Http::response(['status' => true, 'data' => ['status' => 'success', 'amount' => 125000, 'currency' => 'KES', 'reference' => 'PAID']], 200),
            'api.paystack.co/transaction/verify/BAD' => Http::response(['status' => true, 'data' => ['status' => 'failed', 'gateway_response' => 'Declined']], 200),
            'api.paystack.co/transaction/verify/NEW' => Http::response(['status' => false, 'message' => 'Transaction reference not found'], 404),
            'api.paystack.co/transaction/verify/ABANDON' => Http::response(['status' => true, 'data' => ['status' => 'abandoned']], 200)]);
        $cfg = ['secret_key' => 'sk_test_x'];
        $v = $g->verify($cfg, $this->attempt('PAID'));
        $this->assertSame(['paid', 1250.0, 'KES'], [$v['state'], $v['amount'], $v['currency']]);
        $this->assertSame(['failed', 'Declined'], [$g->verify($cfg, $this->attempt('BAD'))['state'], $g->verify($cfg, $this->attempt('BAD'))['reason']]);
        $this->assertSame('pending', $g->verify($cfg, $this->attempt('NEW'))['state']);
        $this->assertSame('pending', $g->verify($cfg, $this->attempt('ABANDON'))['state'], 'abandoned may still be paid: the customer can come back');

        $body = json_encode(['event' => 'charge.success', 'data' => ['reference' => 'TISL-7-ABC123']]);
        $sig = hash_hmac('sha512', $body, 'sk_test_x');
        $this->assertSame(['reference' => 'TISL-7-ABC123', 'provider_ref' => 'TISL-7-ABC123'], $g->parseWebhook($this->hook($body, ['x-paystack-signature' => $sig]), $cfg));
        $this->assertNull($g->parseWebhook($this->hook($body, ['x-paystack-signature' => 'bad']), $cfg));
        $this->assertNull($g->parseWebhook($this->hook($body), $cfg));
    }

    // ------------------------------------------------------------ Flutterwave

    public function test_flutterwave_creates_a_payment_link_in_whole_units(): void
    {
        Http::fake(['api.flutterwave.com/*' => Http::response(['status' => 'success', 'data' => ['link' => 'https://checkout.flutterwave.com/v3/hosted/pay/abc']], 200)]);
        $r = (new Flutterwave)->start(['secret_key' => 'FLWSECK_TEST-x'], $this->p());
        $this->assertSame('https://checkout.flutterwave.com/v3/hosted/pay/abc', $r['redirect_url']);
        Http::assertSent(fn ($req) => $req->url() === 'https://api.flutterwave.com/v3/payments' && $req['tx_ref'] === 'TISL-7-ABC123' && $req['amount'] == 1250.0 && $req['currency'] === 'KES'
            && $req['customer']['email'] === 'amina@example.com' && $req['redirect_url'] === 'https://shop.example.com/payment/return?attempt=7&t=x');
    }

    public function test_flutterwave_verify_by_reference_and_both_kinds_of_webhook_signature(): void
    {
        $g = new Flutterwave;
        Http::fake(['api.flutterwave.com/v3/transactions/verify_by_reference*' => Http::sequence()
            ->push(['status' => 'success', 'data' => ['status' => 'successful', 'amount' => 1250, 'currency' => 'KES', 'flw_ref' => 'FLW-1', 'tx_ref' => 'TISL-7-ABC123']], 200)
            ->push(['status' => 'success', 'data' => ['status' => 'failed', 'processor_response' => 'Insufficient funds']], 200)
            ->push(['status' => 'error', 'message' => 'No transaction was found'], 404)]);
        $cfg = ['secret_key' => 'FLWSECK_TEST-x', 'secret_hash' => 'my-long-hash'];
        $this->assertSame(['paid', 1250.0, 'FLW-1'], array_values(array_intersect_key($g->verify($cfg, $this->attempt(null)), array_flip(['state', 'amount', 'receipt']))));
        $this->assertSame('failed', $g->verify($cfg, $this->attempt(null))['state']);
        $this->assertSame('pending', $g->verify($cfg, $this->attempt(null))['state']);

        $body = json_encode(['event' => 'charge.completed', 'data' => ['id' => 99, 'tx_ref' => 'TISL-7-ABC123', 'status' => 'successful']]);
        $this->assertSame('TISL-7-ABC123', $g->parseWebhook($this->hook($body, ['verif-hash' => 'my-long-hash']), $cfg)['reference']);
        $this->assertSame('TISL-7-ABC123', $g->parseWebhook($this->hook($body, ['flutterwave-signature' => base64_encode(hash_hmac('sha256', $body, 'my-long-hash', true))]), $cfg)['reference']);
        $this->assertNull($g->parseWebhook($this->hook($body, ['verif-hash' => 'guess']), $cfg));
        $this->assertNull($g->parseWebhook($this->hook($body), $cfg));
        $this->assertNull($g->parseWebhook($this->hook($body, ['verif-hash' => '']), ['secret_hash' => '']), 'no secret hash saved: nothing is believed');
    }

    // ------------------------------------------------------------ Pesapal

    public function test_pesapal_gets_a_token_registers_the_notification_address_once_and_submits_the_order(): void
    {
        Http::fake([
            'cybqa.pesapal.com/pesapalv3/api/Auth/RequestToken' => Http::response(['token' => 'TKN', 'status' => '200'], 200),
            'cybqa.pesapal.com/pesapalv3/api/URLSetup/RegisterIPN' => Http::response(['ipn_id' => 'IPN-1', 'status' => '200'], 200),
            'cybqa.pesapal.com/pesapalv3/api/Transactions/SubmitOrderRequest' => Http::response(['order_tracking_id' => 'OT-1', 'merchant_reference' => 'TISL-7-ABC123', 'redirect_url' => 'https://cybqa.pesapal.com/pesapaliframe/PesapalIframe3/Index/?OrderTrackingId=OT-1', 'status' => '200'], 200),
        ]);
        $g = new Pesapal;
        $cfg = ['env' => 'sandbox', 'consumer_key' => 'ck', 'consumer_secret' => 'cs'];
        $r = $g->start($cfg, $this->p());
        $this->assertSame(['https://cybqa.pesapal.com/pesapaliframe/PesapalIframe3/Index/?OrderTrackingId=OT-1', 'OT-1'], [$r['redirect_url'], $r['provider_ref']]);
        $g->start($cfg, $this->p(['reference' => 'TISL-8-X']));
        Http::assertSentCount(4);   // token, IPN, order, then (token and IPN remembered) just the second order
        Http::assertSent(fn ($req) => str_ends_with($req->url(), 'SubmitOrderRequest') && $req['notification_id'] === 'IPN-1' && $req->hasHeader('Authorization', 'Bearer TKN') && $req['amount'] == 1250.0 && $req['currency'] === 'KES');
    }

    public function test_pesapal_status_mapping_ipn_and_the_reply_it_wants(): void
    {
        $g = new Pesapal;
        Http::fake(['*Auth/RequestToken' => Http::response(['token' => 'T'], 200),
            '*GetTransactionStatus*' => Http::sequence()->push(['status_code' => 1, 'payment_status_description' => 'Completed', 'amount' => 1250, 'currency' => 'KES', 'confirmation_code' => 'CC1'], 200)
                ->push(['status_code' => 2, 'payment_status_description' => 'Failed'], 200)->push(['status_code' => 0, 'payment_status_description' => 'Invalid'], 200)]);
        $cfg = ['env' => 'live', 'consumer_key' => 'ck', 'consumer_secret' => 'cs'];
        $v = $g->verify($cfg, $this->attempt('OT-1'));
        $this->assertSame(['paid', 1250.0, 'KES', 'CC1'], [$v['state'], $v['amount'], $v['currency'], $v['receipt']]);
        $this->assertSame('failed', $g->verify($cfg, $this->attempt('OT-1'))['state']);
        $this->assertSame('pending', $g->verify($cfg, $this->attempt('OT-1'))['state']);
        Http::assertSent(fn ($req) => str_contains($req->url(), 'pay.pesapal.com/v3/'));

        $ipn = Request::create('/x?OrderTrackingId=OT-1&OrderMerchantReference=TISL-7-ABC123&OrderNotificationType=IPNCHANGE', 'GET');
        $this->assertSame(['reference' => 'TISL-7-ABC123', 'provider_ref' => 'OT-1'], $g->parseWebhook($ipn, $cfg));
        $this->assertSame(['orderNotificationType' => 'IPNCHANGE', 'orderTrackingId' => 'OT-1', 'orderMerchantReference' => 'TISL-7-ABC123', 'status' => 200], $g->ack($ipn));
        $this->assertNull($g->parseWebhook(Request::create('/x', 'GET'), $cfg));
    }

    public function test_pesapal_test_reports_a_refusal(): void
    {
        Http::fake(['*Auth/RequestToken' => Http::response(['error' => ['code' => 'invalid_consumer_key_or_secret_provided', 'message' => 'Invalid keys']], 200)]);
        $r = (new Pesapal)->test(['env' => 'sandbox', 'consumer_key' => 'a', 'consumer_secret' => 'b']);
        $this->assertFalse($r['ok']);
        $this->assertStringContainsString('Invalid keys', $r['message']);
    }

    // ------------------------------------------------------------ DPO

    public function test_dpo_creates_a_token_and_sends_the_customer_to_its_pay_page(): void
    {
        Http::fake(['secure.3gdirectpay.com/*' => Http::response('<?xml version="1.0" encoding="utf-8"?><API3G><Result>000</Result><ResultExplanation>Transaction created</ResultExplanation><TransToken>TOKEN-1</TransToken><TransRef>REF-1</TransRef></API3G>', 200)]);
        $r = (new Dpo)->start(['company_token' => 'CT-1', 'service_type' => '5525'], $this->p(['name' => 'Amina & Sons <Ltd>']));
        $this->assertSame(['redirect_url' => 'https://secure.3gdirectpay.com/payv2.php?ID=TOKEN-1', 'provider_ref' => 'TOKEN-1'], $r);
        Http::assertSent(function ($req) {
            $b = $req->body();
            $x = simplexml_load_string($b);   // well-formed even with & and < in a name

            return $x !== false && (string) $x->Request === 'createToken' && (string) $x->CompanyToken === 'CT-1' && (string) $x->Transaction->PaymentAmount === '1250.00'
                && (string) $x->Transaction->PaymentCurrency === 'KES' && (string) $x->Transaction->CompanyRef === 'TISL-7-ABC123' && (string) $x->Services->Service->ServiceType === '5525'
                && (string) $x->Transaction->RedirectURL === 'https://shop.example.com/payment/return?attempt=7&t=x';
        });
    }

    public function test_dpo_refusal_and_verify_codes(): void
    {
        $g = new Dpo;
        Http::fake(['secure.3gdirectpay.com/*' => Http::sequence()
            ->push('<API3G><Result>802</Result><ResultExplanation>Company token does not exist</ResultExplanation></API3G>', 200)
            ->push('<API3G><Result>000</Result><TransactionAmount>1250.00</TransactionAmount><TransactionCurrency>KES</TransactionCurrency><TransactionApproval>AP1</TransactionApproval></API3G>', 200)
            ->push('<API3G><Result>900</Result><ResultExplanation>Transaction not paid yet</ResultExplanation></API3G>', 200)
            ->push('<API3G><Result>904</Result><ResultExplanation>Transaction cancelled</ResultExplanation></API3G>', 200)]);
        $cfg = ['company_token' => 'CT', 'service_type' => '1'];
        try {
            $g->start($cfg, $this->p());
            $this->fail('should be refused');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('Company token does not exist', $e->getMessage());
        }
        $v = $g->verify($cfg, $this->attempt('TOKEN-1'));
        $this->assertSame(['paid', 1250.0, 'KES', 'AP1'], [$v['state'], $v['amount'], $v['currency'], $v['receipt']]);
        $this->assertSame('pending', $g->verify($cfg, $this->attempt('TOKEN-1'))['state']);
        $this->assertSame('failed', $g->verify($cfg, $this->attempt('TOKEN-1'))['state']);
    }

    public function test_dpo_return_carries_only_which_payment_to_ask_about(): void
    {
        $r = Request::create('/x?TransactionToken=TOKEN-1&CompanyRef=TISL-7-ABC123', 'GET');
        $this->assertSame(['reference' => 'TISL-7-ABC123', 'provider_ref' => 'TOKEN-1'], (new Dpo)->parseWebhook($r, []));
        $this->assertNull((new Dpo)->parseWebhook(Request::create('/x', 'GET'), []));
    }

    public function test_dpo_test_tells_a_bad_company_token_from_a_good_one(): void
    {
        $g = new Dpo;
        Http::fake(['secure.3gdirectpay.com/*' => Http::sequence()->push('<API3G><Result>802</Result><ResultExplanation>Company token does not exist</ResultExplanation></API3G>', 200)->push('<API3G><Result>904</Result></API3G>', 200)]);
        $this->assertFalse($g->test(['company_token' => 'bad', 'service_type' => '1'])['ok']);
        $this->assertTrue($g->test(['company_token' => 'good', 'service_type' => '1'])['ok']);
        $this->assertFalse($g->test(['company_token' => 'good', 'service_type' => ''])['ok']);
    }

    public function test_every_gateway_names_its_own_secrets_among_its_fields(): void
    {
        foreach (\App\Services\Payments\Gateways::all() as $g) {
            $keys = array_column($g->fields(), 'key');
            foreach ($g->secrets() as $s) {
                $this->assertContains($s, $keys, "{$g->key()}: {$s} is a secret and a field");
                $this->assertSame('secret', collect($g->fields())->firstWhere('key', $s)['type']);
            }
            $this->assertEqualsCanonicalizing(array_keys($g->rules()), array_diff($keys, []), "{$g->key()}: every field has a rule");
            $this->assertNotEmpty($g->help()['steps']);
        }
        $this->assertSame(['stripe', 'paystack', 'flutterwave', 'pesapal', 'dpo'], \App\Services\Payments\Gateways::keys());
    }
}
