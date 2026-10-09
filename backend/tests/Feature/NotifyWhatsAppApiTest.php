<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\NotificationSettingsController;
use App\Http\Controllers\Api\WhatsAppWebhookController;
use App\Jobs\SendWhatsAppMessage;
use App\Models\Customer;
use App\Models\NotificationDelivery;
use App\Models\User;
use App\Services\Notify\ConnectionTester;
use App\Services\Notify\Notifier;
use App\Services\Notify\NotifyException;
use App\Services\Notify\NotifySettings;
use App\Services\Notify\WhatsApp\MetaCloud;
use App\Services\Notify\WhatsApp\Twilio;
use App\Services\Notify\WhatsApp\WhatsAppProviders;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Validation\ValidationException;

/**
 * Phase 3: automatic WhatsApp through Meta or Twilio, set up on a screen. The two drivers (what they send, how they check a callback), the choice between
 * automatic and by hand, the fallback to a person when the API fails, delivery statuses coming back, and the settings gate (a connection check before it goes live).
 */
class NotifyWhatsAppApiTest extends NotifyTestCase
{
    private const META = ['provider' => 'meta', 'auto' => true, 'language' => 'en', 'meta' => ['phone_number_id' => '1055', 'business_account_id' => 'B1', 'access_token' => 'EAAG-token-1234', 'app_secret' => 'app-secret-xyz', 'verify_token' => 'verify-me']];
    private const TWILIO = ['provider' => 'twilio', 'auto' => true, 'twilio' => ['account_sid' => 'ACabc', 'auth_token' => 'twilio-auth-token', 'from' => '+14155238886']];

    private function save(array $whatsapp, bool $on = true): void
    {
        $s = app(NotifySettings::class);
        $s->save('general', ['whatsapp_enabled' => $on], $this->admin());
        $s->save('whatsapp', $whatsapp, $this->admin(), fn () => ['ok' => true, 'message' => 'ok']);
    }

    private function customer(): Customer
    {
        $user = User::find(40) ?? User::forceCreate(['id' => 40, 'name' => 'Amina Wanjiru', 'email' => 'amina@example.com', 'password' => 'x']);

        return Customer::where('user_id', 40)->first() ?? Customer::forceCreate(['user_id' => $user->id, 'first_name' => 'Amina', 'last_name' => 'Wanjiru', 'email' => 'amina@example.com', 'whatsapp' => '0712345678', 'whatsapp_consent_source' => 'profile']);
    }

    private function template(string $type = 'order_placed', array $vars = ['name', 'message'], string $tpl = 'order_update'): void
    {
        app(NotifySettings::class)->save('types', ['rules' => [$type => ['enabled' => true, 'template' => $tpl, 'variables' => $vars]]], $this->admin());
    }

    // ------------------------------------------------------------ Meta

    public function test_meta_sends_the_template_with_the_values_in_order(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.123']]])]);
        $r = (new MetaCloud(self::META))->send('254712345678', 'order_update', 'en', ['Amina', 'We have your order.']);
        $this->assertSame(['ok' => true, 'id' => 'wamid.123', 'error' => null], $r);
        Http::assertSent(function ($req) {
            $b = $req->data();

            return $req->url() === 'https://graph.facebook.com/v20.0/1055/messages' && $req->hasHeader('Authorization', 'Bearer EAAG-token-1234')
                && $b['to'] === '254712345678' && $b['type'] === 'template' && $b['template']['name'] === 'order_update' && $b['template']['language']['code'] === 'en'
                && array_column($b['template']['components'][0]['parameters'], 'text') === ['Amina', 'We have your order.'];
        });
    }

    public function test_meta_errors_are_returned_in_the_providers_words(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['error' => ['message' => 'Template name does not exist in the translation']], 400)]);
        $r = (new MetaCloud(self::META))->send('254712345678', 'nope', 'en', []);
        $this->assertFalse($r['ok']);
        $this->assertSame('Template name does not exist in the translation', $r['error']);
    }

    public function test_meta_check_reads_the_account_and_names_a_refusal(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::sequence()->push(['verified_name' => 'TISL Store', 'display_phone_number' => '+254 700 111 222'])->push(['error' => ['message' => 'Invalid OAuth access token']], 401)]);
        $this->assertSame(['ok' => true, 'message' => 'Connected to TISL Store (+254 700 111 222).'], (new MetaCloud(self::META))->check());
        $this->assertStringContainsString('Invalid OAuth access token', (new MetaCloud(self::META))->check()['message']);
        $this->assertFalse((new MetaCloud(['meta' => []]))->check()['ok'], 'empty keys are not sent anywhere');
    }

    public function test_meta_callbacks_must_carry_the_right_signature(): void
    {
        $body = json_encode(['entry' => []]);
        $good = 'sha256=' . hash_hmac('sha256', $body, 'app-secret-xyz');
        $m = new MetaCloud(self::META);
        $this->assertTrue($m->verifies('u', $body, ['x-hub-signature-256' => [$good]], []));
        $this->assertFalse($m->verifies('u', $body . ' ', ['x-hub-signature-256' => [$good]], []), 'a changed body');
        $this->assertFalse($m->verifies('u', $body, ['x-hub-signature-256' => ['sha256=00']], []));
        $this->assertFalse($m->verifies('u', $body, [], []), 'no signature');
        $this->assertFalse((new MetaCloud(['meta' => ['app_secret' => '']]))->verifies('u', $body, ['x-hub-signature-256' => ['sha256=' . hash_hmac('sha256', $body, '')]], []), 'no secret saved: nothing is believed');
    }

    public function test_meta_statuses_are_read_from_the_callback(): void
    {
        $payload = ['entry' => [['changes' => [['value' => ['statuses' => [
            ['id' => 'wamid.1', 'status' => 'delivered'], ['id' => 'wamid.2', 'status' => 'failed', 'errors' => [['title' => 'Message undeliverable']]], ['id' => 'wamid.3', 'status' => 'typing'], ['status' => 'read'],
        ]]]]]]];
        $this->assertSame([['id' => 'wamid.1', 'status' => 'delivered', 'error' => null], ['id' => 'wamid.2', 'status' => 'failed', 'error' => 'Message undeliverable']], (new MetaCloud(self::META))->statuses($payload));
    }

    // ------------------------------------------------------------ Twilio

    public function test_twilio_sends_a_content_template_with_numbered_variables_and_a_status_callback(): void
    {
        Http::fake(['api.twilio.com/*' => Http::response(['sid' => 'SM123'], 201)]);
        $r = (new Twilio(self::TWILIO, 'https://shop.example/api/webhooks/whatsapp/twilio'))->send('254712345678', 'HX0123', 'en', ['Amina', 'Your order']);
        $this->assertSame(['ok' => true, 'id' => 'SM123', 'error' => null], $r);
        Http::assertSent(function ($req) {
            $b = $req->data();

            return $req->url() === 'https://api.twilio.com/2010-04-01/Accounts/ACabc/Messages.json' && $b['To'] === 'whatsapp:+254712345678' && $b['From'] === 'whatsapp:+14155238886'
                && $b['ContentSid'] === 'HX0123' && json_decode($b['ContentVariables'], true) === ['1' => 'Amina', '2' => 'Your order'] && $b['StatusCallback'] === 'https://shop.example/api/webhooks/whatsapp/twilio'
                && ! isset($b['MessagingServiceSid']) && str_starts_with($req->header('Authorization')[0], 'Basic ');
        });
    }

    public function test_twilio_uses_a_messaging_service_when_there_is_one_and_reports_errors(): void
    {
        Http::fake(['api.twilio.com/*' => Http::response(['message' => 'The From phone number is not a valid WhatsApp sender'], 400)]);
        $cfg = ['twilio' => ['account_sid' => 'ACabc', 'auth_token' => 't', 'messaging_service_sid' => 'MG1']];
        $r = (new Twilio($cfg))->send('254712345678', 'HX1', 'en', []);
        $this->assertSame('The From phone number is not a valid WhatsApp sender', $r['error']);
        Http::assertSent(fn ($req) => ($req->data()['MessagingServiceSid'] ?? null) === 'MG1' && ! isset($req->data()['From']) && ! isset($req->data()['ContentVariables']));
    }

    public function test_twilio_signature_follows_twilios_published_example(): void
    {
        // the example in Twilio's own documentation: token 12345
        $form = ['Digits' => '1234', 'To' => '+18005551212', 'From' => '+14158675310', 'Caller' => '+14158675310', 'CallSid' => 'CA1234567890ABCDE'];
        $t = new Twilio(['twilio' => ['auth_token' => '12345']]);
        $this->assertTrue($t->verifies('https://mycompany.com/myapp.php?foo=1&bar=2', '', ['x-twilio-signature' => ['GvWf1cFY/Q7PnoempGyD5oXAezc=']], $form));
        $this->assertFalse($t->verifies('https://mycompany.com/myapp.php?foo=1&bar=3', '', ['x-twilio-signature' => ['GvWf1cFY/Q7PnoempGyD5oXAezc=']], $form), 'another address');
        $this->assertFalse($t->verifies('https://mycompany.com/myapp.php?foo=1&bar=2', '', [], $form));
    }

    public function test_twilio_statuses(): void
    {
        $t = new Twilio(self::TWILIO);
        $this->assertSame([['id' => 'SM1', 'status' => 'read', 'error' => null]], $t->statuses(['MessageSid' => 'SM1', 'MessageStatus' => 'read']));
        $this->assertSame([['id' => 'SM2', 'status' => 'failed', 'error' => 'error 63016']], $t->statuses(['MessageSid' => 'SM2', 'MessageStatus' => 'undelivered', 'ErrorCode' => '63016']));
        $this->assertSame([], $t->statuses(['MessageSid' => 'SM3', 'MessageStatus' => 'queued']));
    }

    // ------------------------------------------------------------ automatic or by hand

    public function test_with_the_api_on_and_a_template_the_message_is_queued_for_the_api(): void
    {
        Queue::fake();
        $this->save(self::META);
        $this->template('order_placed', ['name', 'title', 'message']);
        app(Notifier::class)->send($this->customer(), 'order_placed', 'Order  PRE-1 placed', "We have\nyour order.");

        $d = NotificationDelivery::where('channel', 'whatsapp')->first();
        $this->assertSame(['queued', 'api', '+254712345678'], [$d->status, $d->via, $d->to_address]);
        $this->assertSame(['provider' => 'meta', 'template' => 'order_update', 'language' => 'en', 'vars' => ['Amina', 'Order PRE-1 placed', 'We have your order.']], $d->payload);
        $this->assertNull($d->wa_url);
        Queue::assertPushed(SendWhatsAppMessage::class, fn ($j) => $j->deliveryId === $d->id);
    }

    public function test_without_a_template_or_with_the_api_off_it_waits_for_a_person(): void
    {
        Queue::fake();
        $this->save(self::META);   // API on, but no template for the type
        app(Notifier::class)->send($this->customer(), 'order_placed', 'Order placed', 'x');
        $this->assertSame(['to_send', 'link'], [NotificationDelivery::where('channel', 'whatsapp')->first()->status, NotificationDelivery::where('channel', 'whatsapp')->first()->via]);

        NotificationDelivery::query()->delete();
        $this->template();
        app(NotifySettings::class)->save('whatsapp', ['auto' => false], $this->admin(), fn () => ['ok' => true]);
        app(Notifier::class)->send($this->customer(), 'order_placed', 'Order placed', 'x');
        $this->assertSame('to_send', NotificationDelivery::where('channel', 'whatsapp')->first()->status);
        Queue::assertNotPushed(SendWhatsAppMessage::class);
    }

    public function test_an_api_with_missing_keys_never_tries_to_send(): void
    {
        Queue::fake();
        $this->save(['provider' => 'meta', 'auto' => true, 'meta' => ['phone_number_id' => '', 'access_token' => '']]);
        $this->template();
        app(Notifier::class)->send($this->customer(), 'order_placed', 'Order placed', 'x');
        $this->assertSame('to_send', NotificationDelivery::where('channel', 'whatsapp')->first()->status);
    }

    public function test_before_script_110_the_message_waits_for_a_person_instead_of_getting_stuck(): void
    {
        Queue::fake();
        $this->save(self::META);
        $this->template();
        \Illuminate\Support\Facades\Schema::table('notification_deliveries', fn ($t) => $t->dropColumn('payload'));
        app(Notifier::class)->send($this->customer(), 'order_placed', 'Order placed', 'x');
        $d = NotificationDelivery::where('channel', 'whatsapp')->first();
        $this->assertSame(['to_send', 'link'], [$d->status, $d->via]);
        Queue::assertNotPushed(SendWhatsAppMessage::class);
    }

    public function test_the_job_sends_once_and_keeps_the_providers_id(): void
    {
        Queue::fake();
        $this->save(self::META);
        $this->template();
        app(Notifier::class)->send($this->customer(), 'order_placed', 'Order placed', 'x');
        $d = NotificationDelivery::where('channel', 'whatsapp')->first();
        Http::fake(['graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.9']]])]);

        (new SendWhatsAppMessage($d->id))->handle(app(WhatsAppProviders::class));
        (new SendWhatsAppMessage($d->id))->handle(app(WhatsAppProviders::class));

        $d->refresh();
        $this->assertSame(['sent', 'wamid.9', 1], [$d->status, $d->external_id, $d->attempts]);
        Http::assertSentCount(1);
    }

    public function test_when_the_api_gives_up_the_message_moves_to_the_list_with_a_link_and_the_reason(): void
    {
        Queue::fake();
        $this->save(self::META);
        $this->template();
        app(Notifier::class)->send($this->customer(), 'order_placed', 'Order placed', 'We have your order.');
        $d = NotificationDelivery::where('channel', 'whatsapp')->first();
        Http::fake(['graph.facebook.com/*' => Http::response(['error' => ['message' => 'Re-engagement message']], 400)]);

        try {
            (new SendWhatsAppMessage($d->id))->handle(app(WhatsAppProviders::class));
            $this->fail('Expected the job to fail so it is retried');
        } catch (\RuntimeException $e) {
            (new SendWhatsAppMessage($d->id))->failed($e);   // the last try
        }
        $d->refresh();
        $this->assertSame('to_send', $d->status);
        $this->assertSame('link', $d->via);
        $this->assertStringStartsWith('api_failed: Re-engagement message', $d->error);
        $this->assertStringStartsWith('https://wa.me/254712345678?text=', $d->wa_url);
    }

    // ------------------------------------------------------------ statuses coming back

    private function sentDelivery(string $status = 'sent'): NotificationDelivery
    {
        return NotificationDelivery::create(['type' => 'order_placed', 'channel' => 'whatsapp', 'via' => 'api', 'status' => $status, 'to_address' => '+254712345678', 'body' => 'We have your order. — TISL', 'external_id' => 'wamid.1']);
    }

    public function test_statuses_move_forward_never_back(): void
    {
        $d = $this->sentDelivery();
        $n = app(Notifier::class);
        $this->assertTrue($n->applyStatus('wamid.1', 'read', null));
        $this->assertSame('read', $d->fresh()->status);
        $this->assertNotNull($d->fresh()->read_at);
        $this->assertNotNull($d->fresh()->delivered_at, 'read implies delivered');
        $n->applyStatus('wamid.1', 'delivered', null);
        $n->applyStatus('wamid.1', 'sent', null);
        $this->assertSame('read', $d->fresh()->status);
        $this->assertFalse($n->applyStatus('wamid.unknown', 'read', null));
    }

    public function test_a_failure_reported_later_goes_to_a_person_unless_it_was_already_delivered(): void
    {
        $d = $this->sentDelivery();
        app(Notifier::class)->applyStatus('wamid.1', 'failed', 'Message undeliverable');
        $d->refresh();
        $this->assertSame(['to_send', 'link'], [$d->status, $d->via]);
        $this->assertStringContainsString('Message undeliverable', $d->error);

        $ok = NotificationDelivery::create(['type' => 'order_placed', 'channel' => 'whatsapp', 'via' => 'api', 'status' => 'delivered', 'to_address' => '+254700000000', 'body' => 'x', 'external_id' => 'wamid.2']);
        app(Notifier::class)->applyStatus('wamid.2', 'failed', 'late noise');
        $this->assertSame('delivered', $ok->fresh()->status);
    }

    // ------------------------------------------------------------ the webhooks

    private function signedPost(string $path, string $body, array $server = []): Request
    {
        return Request::create($path, 'POST', [], [], [], $server + ['CONTENT_TYPE' => 'application/json'], $body);
    }

    private function hook(): WhatsAppWebhookController
    {
        return app(WhatsAppWebhookController::class);
    }

    public function test_the_meta_webhook_verifies_the_address_and_only_believes_signed_calls(): void
    {
        $this->save(self::META);
        $ok = Request::create('/x', 'GET', ['hub_mode' => 'subscribe', 'hub_verify_token' => 'verify-me', 'hub_challenge' => '98765']);
        $this->assertSame(['98765', 200], [$this->hook()->metaVerify($ok)->getContent(), $this->hook()->metaVerify($ok)->getStatusCode()]);
        $this->assertSame(403, $this->hook()->metaVerify(Request::create('/x', 'GET', ['hub_mode' => 'subscribe', 'hub_verify_token' => 'wrong', 'hub_challenge' => '1']))->getStatusCode());

        $d = $this->sentDelivery();
        $body = json_encode(['entry' => [['changes' => [['value' => ['statuses' => [['id' => 'wamid.1', 'status' => 'delivered']]]]]]]]);
        $bad = $this->hook()->meta($this->signedPost('/x', $body, ['HTTP_X_HUB_SIGNATURE_256' => 'sha256=deadbeef']));
        $this->assertSame([403, 'sent'], [$bad->getStatusCode(), $d->fresh()->status]);

        $good = $this->hook()->meta($this->signedPost('/x', $body, ['HTTP_X_HUB_SIGNATURE_256' => 'sha256=' . hash_hmac('sha256', $body, 'app-secret-xyz')]));
        $this->assertSame([200, 'delivered'], [$good->getStatusCode(), $d->fresh()->status]);
    }

    public function test_the_webhooks_believe_nothing_before_the_keys_are_saved(): void
    {
        $body = json_encode(['entry' => []]);
        $this->assertSame(403, $this->hook()->meta($this->signedPost('/x', $body, ['HTTP_X_HUB_SIGNATURE_256' => 'sha256=' . hash_hmac('sha256', $body, '')]))->getStatusCode());
        $this->assertSame(403, $this->hook()->metaVerify(Request::create('/x', 'GET', ['hub_mode' => 'subscribe', 'hub_verify_token' => '', 'hub_challenge' => '1']))->getStatusCode());
    }

    public function test_the_twilio_webhook_checks_the_signature_of_the_callback_address(): void
    {
        $this->save(self::TWILIO);
        config(['app.url' => 'https://shop.example']);
        $d = NotificationDelivery::create(['type' => 'order_placed', 'channel' => 'whatsapp', 'via' => 'api', 'status' => 'sent', 'to_address' => '+254712345678', 'body' => 'x', 'external_id' => 'SM9']);
        $form = ['MessageSid' => 'SM9', 'MessageStatus' => 'delivered'];
        ksort($form);
        $data = 'https://shop.example/api/webhooks/whatsapp/twilio';
        foreach ($form as $k => $v) {
            $data .= $k . $v;
        }
        $sig = base64_encode(hash_hmac('sha1', $data, 'twilio-auth-token', true));

        $forged = Request::create('/x', 'POST', $form, [], [], ['HTTP_X_TWILIO_SIGNATURE' => 'AAAA']);
        $this->assertSame([403, 'sent'], [$this->hook()->twilio($forged)->getStatusCode(), $d->fresh()->status]);
        $real = Request::create('/x', 'POST', $form, [], [], ['HTTP_X_TWILIO_SIGNATURE' => $sig]);
        $this->assertSame([200, 'delivered'], [$this->hook()->twilio($real)->getStatusCode(), $d->fresh()->status]);
    }

    // ------------------------------------------------------------ the settings gate

    private function api(array $permissions, string $method = 'PUT', array $data = []): Request
    {
        $user = \Mockery::mock(User::class)->makePartial();
        $user->forceFill(['id' => 5, 'name' => 'Admin 5', 'email' => 'admin5@example.com']);
        $user->shouldReceive('hasPermission')->andReturnUsing(fn ($p) => in_array($p, $permissions, true));
        $this->admin();
        $r = Request::create('/x', $method, $data);
        $r->setUserResolver(fn () => $user);

        return $r;
    }

    private function ctl(): NotificationSettingsController
    {
        return new NotificationSettingsController(app(NotifySettings::class), app(ConnectionTester::class));
    }

    public function test_saving_whatsapp_keys_asks_the_provider_first_and_refuses_bad_keys(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['error' => ['message' => 'Invalid OAuth access token']], 401)]);
        $r = $this->ctl()->update($this->api(['notifications.settings'], 'PUT', self::META), 'whatsapp');
        $this->assertSame(422, $r->getStatusCode());
        $this->assertStringContainsString('Invalid OAuth access token', $r->getData(true)['message']);
        $this->assertFalse(app(NotifySettings::class)->isSaved('whatsapp'));

        $any = $this->ctl()->update($this->api(['notifications.settings'], 'PUT', self::META + ['anyway' => true]), 'whatsapp');
        $this->assertSame(200, $any->getStatusCode());
    }

    public function test_good_keys_are_saved_and_the_screen_never_gets_them_back(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['verified_name' => 'TISL', 'display_phone_number' => '+254 700'])]);
        $r = $this->ctl()->update($this->api(['notifications.settings'], 'PUT', self::META), 'whatsapp');
        $this->assertSame(200, $r->getStatusCode());
        $shown = json_encode($this->ctl()->show($this->api(['notifications.view', 'notifications.settings'], 'GET'))->getData(true), JSON_UNESCAPED_SLASHES);
        foreach (['EAAG-token', 'app-secret-xyz', 'verify-me', 'twilio-auth-token'] as $secret) {
            $this->assertStringNotContainsString($secret, $shown);
        }
        $this->assertStringContainsString('/api/webhooks/whatsapp/meta', $shown);
    }

    public function test_the_screen_reports_whether_automatic_sending_is_really_on(): void
    {
        $d = fn () => $this->ctl()->show($this->api(['notifications.view'], 'GET'))->getData(true)['whatsapp_api'];
        $this->assertFalse($d()['automatic']);
        $this->save(self::META);
        $this->template();
        $this->assertTrue($d()['automatic']);
        $this->assertSame(1, $d()['types_ready']);
    }

    public function test_the_test_message_goes_through_the_saved_keys_and_is_logged(): void
    {
        $this->save(self::META);
        Http::fake(['graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.t']]])]);
        $r = $this->ctl()->testWhatsApp($this->api(['notifications.send'], 'POST', ['to' => '0712 345 678', 'template' => 'hello_world']));
        $this->assertSame(200, $r->getStatusCode());
        $this->assertStringContainsString('+254712345678', $r->getData(true)['message']);
        $this->assertSame('tested', \App\Models\NotificationSettingLog::orderByDesc('id')->value('event'));

        $bad = $this->ctl()->testWhatsApp($this->api(['notifications.send'], 'POST', ['to' => 'abc', 'template' => 'hello_world']));
        $this->assertSame(422, $bad->getStatusCode());
    }

    public function test_a_type_can_only_use_known_variables(): void
    {
        $this->expectException(ValidationException::class);
        app(NotifySettings::class)->save('types', ['rules' => ['order_placed' => ['enabled' => true, 'template' => 'x', 'variables' => ['name', 'password']]]], $this->admin());
    }

    public function test_messages_to_a_number_without_digits_are_skipped_not_sent(): void
    {
        Queue::fake();
        $this->save(self::META);
        $this->template();
        $c = $this->customer();
        $c->forceFill(['whatsapp' => 'call me'])->save();
        app(Notifier::class)->send($c->fresh(), 'order_placed', 'Order placed', 'x');
        Queue::assertNotPushed(SendWhatsAppMessage::class);
        $this->assertSame([], NotificationDelivery::where('channel', 'whatsapp')->where('status', 'queued')->get()->all());
    }
}
