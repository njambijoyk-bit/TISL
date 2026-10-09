<?php

namespace Tests\Feature;

use App\Jobs\SendNotificationEmail;
use App\Mail\NotificationMail;
use App\Models\Customer;
use App\Models\Notification;
use App\Models\NotificationDelivery;
use App\Models\NotificationSettingLog;
use App\Models\User;
use App\Services\Notify\MailConfigurator;
use App\Services\Notify\Notifier;
use App\Services\Notify\NotifyException;
use App\Services\Notify\NotifySettings;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;

/**
 * The Notifier end to end: the bell row, the queued email through the settings saved on the screen, the WhatsApp message left for a person to send,
 * what is recorded for each, and the old Notification::createFor now really sending email.
 */
class NotifierTest extends NotifyTestCase
{
    private function customer(array $o = []): Customer
    {
        $user = User::find(40) ?? User::forceCreate(['id' => 40, 'name' => 'Amina Wanjiru', 'email' => 'amina@example.com', 'password' => 'x']);

        return Customer::where('user_id', 40)->first() ?? Customer::forceCreate($o + ['user_id' => $user->id, 'first_name' => 'Amina', 'last_name' => 'Wanjiru', 'email' => 'amina@example.com', 'whatsapp' => '0712345678']);
    }

    private function general(array $o): void
    {
        app(NotifySettings::class)->save('general', $o, $this->admin());
    }

    public function test_an_essential_message_makes_the_bell_row_a_queued_email_and_a_whatsapp_message_to_send(): void
    {
        Queue::fake();
        $this->general(['whatsapp_enabled' => true]);
        $c = $this->customer();

        $r = app(Notifier::class)->send($c, 'order_placed', 'Order PRE-00001 placed', 'We have your order.', ['action_url' => '/orders/1', 'action_text' => 'View order']);

        $this->assertSame(['database', 'email', 'whatsapp'], $r['channels']);
        $bell = Notification::first();
        $this->assertSame(User::class, $bell->notifiable_type, 'the bell belongs to the login');
        $this->assertSame('high', $bell->priority);
        $email = NotificationDelivery::where('channel', 'email')->first();
        $this->assertSame(['queued', 'amina@example.com'], [$email->status, $email->to_address]);
        Queue::assertPushed(SendNotificationEmail::class, fn ($j) => $j->deliveryId === $email->id);
        $wa = NotificationDelivery::where('channel', 'whatsapp')->first();
        $this->assertSame(['to_send', 'link', '+254712345678'], [$wa->status, $wa->via, $wa->to_address]);
        $this->assertStringStartsWith('https://wa.me/254712345678?text=', $wa->wa_url);
    }

    public function test_the_job_sends_the_email_and_marks_it_sent(): void
    {
        Mail::fake();
        Queue::fake();
        $c = $this->customer();
        app(Notifier::class)->send($c, 'order_placed', 'Order placed', 'We have your order.', ['action_url' => '/orders/1', 'action_text' => 'View order']);
        $d = NotificationDelivery::where('channel', 'email')->first();

        (new SendNotificationEmail($d->id))->handle(app(MailConfigurator::class));

        Mail::assertSent(NotificationMail::class, fn ($m) => $m->hasTo('amina@example.com') && $m->subjectLine === 'Order placed' && str_contains($m->render(), 'View order') && str_contains($m->render(), 'Hello Amina'));
        $this->assertSame('sent', $d->fresh()->status);
        $this->assertNotNull(Notification::first()->email_sent_at);
    }

    public function test_the_job_never_sends_the_same_email_twice(): void
    {
        Mail::fake();
        Queue::fake();
        app(Notifier::class)->send($this->customer(), 'order_placed', 'Order placed', 'x');
        $d = NotificationDelivery::where('channel', 'email')->first();
        $job = new SendNotificationEmail($d->id);
        $job->handle(app(MailConfigurator::class));
        $job->handle(app(MailConfigurator::class));
        Mail::assertSentCount(1);
    }

    public function test_a_failed_send_is_kept_with_its_reason_and_can_be_retried_by_a_named_person(): void
    {
        Queue::fake();
        app(Notifier::class)->send($this->customer(), 'order_placed', 'Order placed', 'x');
        $d = NotificationDelivery::where('channel', 'email')->first();

        (new SendNotificationEmail($d->id))->failed(new \RuntimeException("Connection could not be established with host smtp.example.com\n  :stream_socket_client(): refused"));
        $d->refresh();
        $this->assertSame('failed', $d->status);
        $this->assertStringContainsString('Connection could not be established with host smtp.example.com :stream_socket_client(): refused', $d->error);

        app(Notifier::class)->retry($d, $this->admin(7));
        $this->assertSame(['queued', null, 7], [$d->fresh()->status, $d->fresh()->error, $d->fresh()->handled_by]);
        Queue::assertPushed(SendNotificationEmail::class, 2);
        $log = NotificationSettingLog::orderByDesc('id')->first();
        $this->assertSame(['message_retried', 7], [$log->event, $log->user_id]);

        $this->expectException(NotifyException::class);
        $d->forceFill(['status' => 'sent'])->save();
        app(Notifier::class)->retry($d->fresh(), $this->admin(7));
    }

    public function test_a_problem_on_a_channel_never_reaches_the_caller(): void
    {
        \Illuminate\Support\Facades\Schema::drop('notification_deliveries');
        $r = app(Notifier::class)->send($this->customer(), 'order_placed', 'Order placed', 'x');
        $this->assertSame([], $r['channels']);   // reported, not thrown
    }

    public function test_the_company_can_switch_email_off_or_a_type_off(): void
    {
        Queue::fake();
        $this->general(['email_enabled' => false]);
        $r = app(Notifier::class)->send($this->customer(), 'order_placed', 'Order placed', 'x');
        $this->assertSame(['database'], $r['channels']);
        $this->assertSame(['nobody_reachable'], NotificationDelivery::pluck('error')->all(), 'a switched-off channel is not a problem in itself; an essential message with nobody to reach is');

        $this->general(['email_enabled' => true]);
        app(NotifySettings::class)->save('types', ['rules' => ['order_placed' => ['enabled' => false]]], $this->admin());
        $this->assertSame(['database'], app(Notifier::class)->send($this->customer(), 'order_placed', 'Order placed', 'x')['channels']);
        Queue::assertNothingPushed();
    }

    public function test_a_customer_with_no_email_is_noted_not_dropped(): void
    {
        Queue::fake();
        $c = $this->customer(['email' => null]);
        \App\Models\User::whereKey($c->user_id)->update(['email' => null]);
        $r = app(Notifier::class)->send($c->fresh(), 'order_placed', 'Order placed', 'x');
        $this->assertSame(['database'], $r['channels']);
        $row = NotificationDelivery::where('channel', 'email')->first();
        $this->assertSame(['skipped', 'no_email'], [$row->status, $row->error]);
    }

    public function test_the_old_create_for_with_the_email_channel_now_sends_an_email(): void
    {
        Queue::fake();
        $c = $this->customer();
        Notification::createFor($c->user, 'referral_earned', 'Reward!', 'You earned a reward.', null, null, null, ['database', 'email']);
        $d = NotificationDelivery::where('channel', 'email')->first();
        $this->assertSame('amina@example.com', $d->to_address);
        Queue::assertPushed(SendNotificationEmail::class);

        Notification::createFor($c->user, 'referral_earned', 'Reward!', 'You earned a reward.');   // database only: nothing sent
        $this->assertSame(1, NotificationDelivery::count());
    }

    public function test_the_old_create_for_respects_the_company_switch_and_type_rules(): void
    {
        Queue::fake();
        $c = $this->customer();
        $this->general(['email_enabled' => false]);
        Notification::createFor($c->user, 'referral_earned', 'Reward!', 'x', null, null, null, ['database', 'email']);
        $this->assertSame(0, NotificationDelivery::count());
    }

    public function test_the_old_create_for_obeys_a_type_that_the_company_switched_off(): void
    {
        Queue::fake();
        $c = $this->customer();
        app(NotifySettings::class)->save('types', ['rules' => ['referral_earned' => ['enabled' => false]]], $this->admin());
        Notification::createFor($c->user, 'referral_earned', 'Reward!', 'x', null, null, null, ['database', 'email']);
        $this->assertSame(0, NotificationDelivery::count());
        $this->assertSame(1, Notification::count(), 'the bell row is still made');
    }

    public function test_the_saved_email_settings_reach_the_running_mailer(): void
    {
        $this->assertFalse(app(MailConfigurator::class)->apply(), 'nothing saved: the server settings stay');
        app(NotifySettings::class)->save('email', ['host' => 'smtp.example.com', 'port' => 465, 'encryption' => 'ssl', 'username' => 'm', 'password' => 'p', 'from_address' => 'shop@example.com', 'from_name' => 'The Shop', 'reply_to' => 'help@example.com'], $this->admin(), fn () => ['ok' => true]);
        $this->assertTrue(app(MailConfigurator::class)->apply());
        $this->assertSame('smtp.example.com', config('mail.mailers.smtp.host'));
        $this->assertSame('smtps', config('mail.mailers.smtp.scheme'));
        $this->assertSame('shop@example.com', config('mail.from.address'));
        $this->assertSame('help@example.com', config('mail.reply_to_address'));
    }
}
