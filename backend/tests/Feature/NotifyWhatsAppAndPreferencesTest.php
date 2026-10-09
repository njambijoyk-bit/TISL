<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\CustomerNotificationPreferencesController;
use App\Http\Controllers\Api\NotificationSettingsController;
use App\Models\Customer;
use App\Models\NotificationDelivery;
use App\Models\NotificationSettingLog;
use App\Models\User;
use App\Services\Notify\ConnectionTester;
use App\Services\Notify\NotificationPreferences;
use App\Services\Notify\Notifier;
use App\Services\Notify\NotifyException;
use App\Services\Notify\NotifySettings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Queue;
use Illuminate\Validation\ValidationException;

/**
 * Phase 2: the customer's own notification choices, WhatsApp messages left for a person to send by hand (with who sent or skipped them), the
 * company default way and which numbers count, and the 12-month blanking of old message text.
 */
class NotifyWhatsAppAndPreferencesTest extends NotifyTestCase
{
    private function customer(array $o = []): Customer
    {
        $user = User::find(40) ?? User::forceCreate(['id' => 40, 'name' => 'Amina Wanjiru', 'email' => 'amina@example.com', 'password' => 'x']);

        return Customer::where('user_id', 40)->first() ?? Customer::forceCreate($o + ['user_id' => $user->id, 'first_name' => 'Amina', 'last_name' => 'Wanjiru', 'email' => 'amina@example.com']);
    }

    private function general(array $o): void
    {
        app(NotifySettings::class)->save('general', $o, $this->admin());
    }

    private function prefs(): NotificationPreferences
    {
        return app(NotificationPreferences::class);
    }

    // ---------------------------------------------------------------- the customer's choices

    public function test_a_customer_with_no_choices_follows_the_company(): void
    {
        $this->general(['default_mode' => 'email']);
        $p = $this->prefs()->show($this->customer());
        $this->assertNull($p['mode']);
        $this->assertNull($p['essential_only']);
        $this->assertSame('email', $p['company']['default_mode']);
        $this->assertTrue($p['now']['email']);
        $this->assertFalse($p['now']['whatsapp']);
    }

    public function test_choosing_a_way_and_essentials_only_is_saved_and_default_goes_back_to_the_company(): void
    {
        $c = $this->customer();
        $this->prefs()->save($c, ['mode' => 'whatsapp', 'essential_only' => true]);
        $this->assertSame(['whatsapp', true], [$c->fresh()->notify_mode, $c->fresh()->notify_essential_only]);
        $this->prefs()->save($c, ['mode' => 'default', 'essential_only' => null]);
        $this->assertSame([null, null], [$c->fresh()->notify_mode, $c->fresh()->notify_essential_only]);
    }

    public function test_a_customer_can_choose_everything_even_when_the_company_default_is_essentials_only(): void
    {
        $this->general(['essential_only_default' => true]);
        $c = $this->customer();
        $r = app(\App\Services\Notify\Recipients::class)->for($c)['person'];
        $this->assertNull($r['essential_only'], 'no choice: the company default applies');
        $this->prefs()->save($c, ['essential_only' => false]);
        $this->assertFalse(app(\App\Services\Notify\Recipients::class)->for($c->fresh())['person']['essential_only']);
    }

    public function test_an_invalid_way_or_number_is_refused_with_the_field(): void
    {
        $c = $this->customer();
        foreach ([['mode' => 'carrier-pigeon'], ['whatsapp' => 'abc']] as $bad) {
            try {
                $this->prefs()->save($c, $bad);
                $this->fail('Expected a refusal');
            } catch (ValidationException $e) {
                $this->assertArrayHasKey(array_key_first($bad), $e->errors());
            }
        }
    }

    public function test_giving_a_number_records_when_and_from_where_and_only_when_it_changes(): void
    {
        $c = $this->customer();
        $this->prefs()->save($c, ['whatsapp' => '0712 345 678']);
        $first = $c->fresh();
        $this->assertSame('profile', $first->whatsapp_consent_source);
        $this->assertNotNull($first->whatsapp_consent_at);

        \Illuminate\Support\Carbon::setTestNow(now()->addDay());
        $this->prefs()->save($c->fresh(), ['whatsapp' => '0712 345 678', 'mode' => 'both']);   // same number again
        $this->assertTrue($c->fresh()->whatsapp_consent_at->equalTo($first->whatsapp_consent_at), 'the time of the first consent is kept');
        \Illuminate\Support\Carbon::setTestNow();

        $this->prefs()->save($c->fresh(), ['whatsapp' => '']);   // removed
        $this->assertSame([null, null, null], [$c->fresh()->whatsapp, $c->fresh()->whatsapp_consent_at, $c->fresh()->whatsapp_consent_source]);
    }

    public function test_the_phone_given_at_checkout_becomes_the_whatsapp_number_only_when_there_is_none(): void
    {
        $c = $this->customer();
        $this->prefs()->noteCheckoutNumber($c, '0722 000 111');
        $this->assertSame(['0722 000 111', 'checkout'], [$c->fresh()->whatsapp, $c->fresh()->whatsapp_consent_source]);

        $this->prefs()->noteCheckoutNumber($c->fresh(), '0799 999 999');   // already has one
        $this->assertSame('0722 000 111', $c->fresh()->whatsapp);
    }

    public function test_email_only_customers_and_bad_numbers_are_left_alone_at_checkout(): void
    {
        $c = $this->customer();
        $this->prefs()->save($c, ['mode' => 'email']);
        $this->prefs()->noteCheckoutNumber($c->fresh(), '0722 000 111');
        $this->assertNull($c->fresh()->whatsapp, 'choosing email only always wins');

        $this->prefs()->save($c->fresh(), ['mode' => 'default']);
        $this->prefs()->noteCheckoutNumber($c->fresh(), 'call me');
        $this->assertNull($c->fresh()->whatsapp);
    }

    // ---------------------------------------------------------------- the choices at work

    public function test_the_company_default_and_the_customers_override_decide_what_is_sent(): void
    {
        Queue::fake();
        $this->general(['whatsapp_enabled' => true, 'default_mode' => 'both']);
        $c = $this->customer(['whatsapp' => '0712345678', 'whatsapp_consent_source' => 'profile']);
        $n = app(Notifier::class);

        $this->assertSame(['database', 'email', 'whatsapp'], $n->send($c, 'order_placed', 'Order placed', 'x')['channels'], 'company default: both');
        $this->prefs()->save($c, ['mode' => 'email']);
        $this->assertSame(['database', 'email'], $n->send($c->fresh(), 'order_placed', 'Order placed', 'x')['channels'], 'the customer chose email only');
        $this->prefs()->save($c->fresh(), ['mode' => 'whatsapp']);
        $this->assertSame(['database', 'whatsapp'], $n->send($c->fresh(), 'order_placed', 'Order placed', 'x')['channels']);
    }

    public function test_a_number_from_a_source_the_company_does_not_accept_is_noted_and_email_is_used(): void
    {
        Queue::fake();
        $this->general(['whatsapp_enabled' => true, 'whatsapp_number_sources' => 'profile']);
        $c = $this->customer(['whatsapp' => '0712345678', 'whatsapp_consent_source' => 'checkout']);

        $r = app(Notifier::class)->send($c, 'order_placed', 'Order placed', 'x');
        $this->assertSame(['database', 'email'], $r['channels']);
        $row = NotificationDelivery::where('channel', 'whatsapp')->first();
        $this->assertSame(['skipped', 'number_source'], [$row->status, $row->error]);

        $this->general(['whatsapp_number_sources' => 'both']);
        $this->assertContains('whatsapp', app(Notifier::class)->send($c->fresh(), 'order_placed', 'Order placed', 'x')['channels']);
    }

    public function test_a_type_can_be_limited_to_email_only(): void
    {
        Queue::fake();
        $this->general(['whatsapp_enabled' => true]);
        app(NotifySettings::class)->save('types', ['rules' => ['order_placed' => ['enabled' => true, 'channels' => ['email']]]], $this->admin());
        $c = $this->customer(['whatsapp' => '0712345678', 'whatsapp_consent_source' => 'profile']);
        $this->assertSame(['database', 'email'], app(Notifier::class)->send($c, 'order_placed', 'Order placed', 'x')['channels']);
    }

    // ---------------------------------------------------------------- the staff list

    private function waiting(): NotificationDelivery
    {
        Queue::fake();
        $this->general(['whatsapp_enabled' => true]);
        $c = $this->customer(['whatsapp' => '0712345678', 'whatsapp_consent_source' => 'profile']);
        app(Notifier::class)->send($c, 'order_placed', 'Order PRE-1 placed', 'We have your order.');

        return NotificationDelivery::where('channel', 'whatsapp')->firstOrFail();
    }

    public function test_marking_a_whatsapp_message_sent_names_who_and_cannot_be_done_twice(): void
    {
        $d = $this->waiting();
        $this->assertSame('to_send', $d->status);
        app(Notifier::class)->markSent($d, $this->admin(7));
        $d->refresh();
        $this->assertSame(['sent', 7], [$d->status, $d->handled_by]);
        $this->assertNotNull($d->sent_at);
        $log = NotificationSettingLog::orderByDesc('id')->first();
        $this->assertSame(['whatsapp_marked_sent', 7], [$log->event, $log->user_id]);

        $this->expectException(NotifyException::class);
        app(Notifier::class)->markSent($d->fresh(), $this->admin(7));
    }

    public function test_skipping_keeps_the_reason_and_the_person(): void
    {
        $d = $this->waiting();
        app(Notifier::class)->skip($d, $this->admin(8), 'wrong number');
        $d->refresh();
        $this->assertSame(['skipped', 'skipped_by_staff', 8], [$d->status, $d->error, $d->handled_by]);
        $log = NotificationSettingLog::orderByDesc('id')->first();
        $this->assertSame(['whatsapp_skipped', 8], [$log->event, $log->user_id]);
        $this->assertStringContainsString('wrong number', $log->summary);
    }

    public function test_an_email_or_a_sent_message_cannot_be_marked_as_sent_by_hand(): void
    {
        $d = $this->waiting();
        $email = NotificationDelivery::where('channel', 'email')->first();
        $this->expectException(NotifyException::class);
        app(Notifier::class)->markSent($email, $this->admin());
    }

    private function staff(array $permissions, array $data = []): Request
    {
        $user = \Mockery::mock(User::class)->makePartial();
        $user->forceFill(['id' => 5, 'name' => 'Admin 5']);
        $user->shouldReceive('hasPermission')->andReturnUsing(fn ($p) => in_array($p, $permissions, true));
        $this->admin();
        $r = Request::create('/x', 'GET', $data);
        $r->setUserResolver(fn () => $user);

        return $r;
    }

    public function test_the_whatsapp_list_shows_who_what_and_the_link_oldest_first_with_the_waiting_count(): void
    {
        $this->waiting();
        $c = new NotificationSettingsController(app(NotifySettings::class), app(ConnectionTester::class));
        $r = $c->whatsapp($this->staff(['notifications.view']))->getData(true);

        $this->assertSame(1, $r['waiting']);
        $row = $r['data'][0];
        $this->assertSame('Amina Wanjiru', $row['name'] ?? null);
        $this->assertSame('+254712345678', $row['to']);
        $this->assertSame('We have your order. — ' . \App\Models\CompanyProfile::name(), $row['message']);
        $this->assertStringStartsWith('https://wa.me/254712345678?text=', $row['wa_url']);

        app(Notifier::class)->markSent(NotificationDelivery::where('channel', 'whatsapp')->first(), $this->admin());
        $this->assertSame(0, $c->whatsapp($this->staff(['notifications.view']))->getData(true)['waiting']);
        $this->assertCount(1, $c->whatsapp($this->staff(['notifications.view'], ['status' => 'sent']))->getData(true)['data']);
    }

    // ---------------------------------------------------------------- the customer API

    public function test_the_customer_api_returns_and_saves_their_own_choices_only(): void
    {
        $c = $this->customer();
        $ctl = new CustomerNotificationPreferencesController($this->prefs());
        $req = Request::create('/x', 'PUT', ['mode' => 'both', 'whatsapp' => '0712345678']);
        $req->setUserResolver(fn () => $c->user);
        $r = $ctl->update($req);
        $this->assertSame(200, $r->getStatusCode());
        $this->assertSame('both', $c->fresh()->notify_mode);
        $this->assertSame('both', $ctl->show((function () use ($c) { $q = Request::create('/x'); $q->setUserResolver(fn () => $c->user); return $q; })())->getData(true)['mode']);

        $stranger = Request::create('/x');
        $stranger->setUserResolver(fn () => User::forceCreate(['id' => 41, 'name' => 'No customer', 'password' => 'x']));
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        $ctl->show($stranger);
    }

    // ---------------------------------------------------------------- retention

    public function test_old_message_text_is_blanked_but_status_and_time_stay_and_it_is_logged(): void
    {
        $old = NotificationDelivery::create(['type' => 'order_placed', 'channel' => 'email', 'status' => 'sent', 'to_address' => 'a@example.com', 'subject' => 'Order placed', 'body' => 'We have your order.', 'wa_url' => null]);
        $old->forceFill(['created_at' => now()->subMonths(13)])->save();
        $new = NotificationDelivery::create(['type' => 'order_placed', 'channel' => 'email', 'status' => 'sent', 'to_address' => 'b@example.com', 'subject' => 'Order placed', 'body' => 'Recent.']);

        $this->artisan('notifications:prune')->assertSuccessful();

        $this->assertSame([null, null, 'sent'], [$old->fresh()->body, $old->fresh()->subject, $old->fresh()->status]);
        $this->assertSame('Recent.', $new->fresh()->body);
        $this->assertSame('log_pruned', NotificationSettingLog::orderByDesc('id')->value('event'));
        $this->artisan('notifications:prune')->assertSuccessful();   // nothing more to do, and no second log line
        $this->assertSame(1, NotificationSettingLog::where('event', 'log_pruned')->count());
    }
}
