<?php

namespace Tests\Feature;

use App\Jobs\SendNotificationEmail;
use App\Jobs\SendWhatsAppMessage;
use App\Models\Notification;
use App\Models\NotificationDelivery;
use App\Models\User;
use App\Services\Notify\NotificationTypes;
use App\Services\Notify\Notifier;
use App\Services\Notify\NotifySettings;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;

/** Phase 4.4: an alert that needs a colleague now (a second person to approve) goes by bell and email, and also by WhatsApp when the company's API and a template are set: never as a chore for someone to send by hand. */
class NotifyStaffApprovalTest extends NotifyTestCase
{
    private const META = ['provider' => 'meta', 'auto' => true, 'language' => 'en', 'meta' => ['phone_number_id' => '1055', 'business_account_id' => 'B1', 'access_token' => 'EAAG-token-1234', 'app_secret' => 'app-secret-xyz', 'verify_token' => 'verify-me']];
    private const OPTIONS = ['action_url' => '/admin/security/approvals?open=abc', 'action_text' => 'Look at it', 'short' => 'A second person is needed to approve something. Open Approvals:', 'link_in_whatsapp' => true];

    protected function setUp(): void
    {
        parent::setUp();
        Schema::table('users', fn ($t) => $t->string('phone')->nullable());
        config(['app.frontend_url' => 'https://targetisl.co.ke']);
        Queue::fake();
    }

    private function staff(?string $phone = '0722000111'): User
    {
        return User::forceCreate(['name' => 'Bola Backer', 'email' => 'bola@example.com', 'password' => 'x', 'phone' => $phone]);
    }

    private function whatsappOn(bool $on = true, bool $template = true, ?array $channels = null): void
    {
        $s = app(NotifySettings::class);
        $s->save('general', ['whatsapp_enabled' => $on], $this->admin());
        $s->save('whatsapp', self::META, $this->admin(), fn () => ['ok' => true, 'message' => 'ok']);
        $rule = ['enabled' => true] + ($template ? ['template' => 'approval_needed', 'variables' => ['name', 'message']] : []) + ($channels ? ['channels' => $channels] : []);
        $s->save('types', ['rules' => ['council_request' => $rule, 'recovery_request' => $rule, 'council_answer' => $rule]], $this->admin());
    }

    private function send(User $to, string $type = 'council_request', array $o = self::OPTIONS): array
    {
        return app(Notifier::class)->send($to, $type, 'A second person is needed', 'Alice has asked to: Change who may do what.', $o);
    }

    public function test_the_colleague_gets_the_bell_the_email_and_a_whatsapp_through_the_api_with_a_link_and_no_details(): void
    {
        $this->whatsappOn();
        $r = $this->send($this->staff());

        $this->assertEqualsCanonicalizing(['database', 'email', 'whatsapp'], $r['channels']);
        $this->assertSame(1, Notification::count());
        $this->assertSame(1, NotificationDelivery::where('channel', 'email')->count());
        Queue::assertPushed(SendNotificationEmail::class);
        $wa = NotificationDelivery::where('channel', 'whatsapp')->first();
        $this->assertSame(['queued', 'api', '+254722000111'], [$wa->status, $wa->via, $wa->to_address]);
        $this->assertSame(['Bola Backer', 'A second person is needed to approve something. Open Approvals: https://targetisl.co.ke/admin/security/approvals?open=abc'], $wa->payload['vars']);
        $this->assertStringNotContainsString('Alice', $wa->body);
        $this->assertStringNotContainsString('Change who may do what', json_encode($wa->payload));
        Queue::assertPushed(SendWhatsAppMessage::class, fn ($j) => $j->deliveryId === $wa->id);
        $this->assertNull($wa->wa_url);
        $this->assertStringContainsString('Alice', Notification::first()->message, 'the bell and the email keep the full message');
    }

    public function test_without_a_template_it_is_never_a_chore_for_a_person_to_send_by_hand(): void
    {
        $this->whatsappOn(true, false);
        $r = $this->send($this->staff());

        $this->assertContains('email', $r['channels']);
        $this->assertSame(1, Notification::count());
        $wa = NotificationDelivery::where('channel', 'whatsapp')->get();
        $this->assertCount(1, $wa);
        $this->assertSame(['skipped', 'manual_not_used'], [$wa[0]->status, $wa[0]->error]);
        $this->assertNull($wa[0]->wa_url);
        $this->assertSame(0, NotificationDelivery::where('status', 'to_send')->count());
        Queue::assertNotPushed(SendWhatsAppMessage::class);
    }

    public function test_a_colleague_with_no_phone_is_noted_and_still_gets_the_email(): void
    {
        $this->whatsappOn();
        $r = $this->send($this->staff(null));

        $this->assertContains('email', $r['channels']);
        $this->assertNotContains('whatsapp', $r['channels']);
        $this->assertSame('no_number', NotificationDelivery::where('channel', 'whatsapp')->first()->error);
        Queue::assertNotPushed(SendWhatsAppMessage::class);
    }

    public function test_it_stays_off_when_the_company_has_whatsapp_off_or_the_type_is_email_only(): void
    {
        $this->whatsappOn(false);
        $this->assertNotContains('whatsapp', $this->send($this->staff())['channels']);
        $this->assertSame(0, NotificationDelivery::where('channel', 'whatsapp')->count());

        $this->whatsappOn(true, true, ['email']);
        $this->assertNotContains('whatsapp', $this->send($this->staff())['channels']);
        $this->assertSame(0, NotificationDelivery::where('channel', 'whatsapp')->count());
        Queue::assertNotPushed(SendWhatsAppMessage::class);
    }

    public function test_only_the_messages_that_need_someone_now_use_it(): void
    {
        $this->whatsappOn();
        $r = $this->send($this->staff(), 'council_answer', ['action_url' => '/x']);   // an answer, not a request
        $this->assertNotContains('whatsapp', $r['channels']);
        $this->assertSame(0, NotificationDelivery::where('channel', 'whatsapp')->count());
        $this->assertSame(['council_request', 'recovery_request'], NotificationTypes::STAFF_WHATSAPP);
        foreach (NotificationTypes::STAFF_WHATSAPP as $type) {
            $this->assertContains($type, NotificationTypes::WHATSAPP_ONLY_AUTOMATIC, "{$type} must never wait on a hand-send list");
        }
    }

    public function test_the_security_messages_are_registered_and_essential(): void
    {
        foreach (['council_request', 'council_answer', 'recovery_request', 'recovery_asked', 'recovery_asked_other', 'recovery_approved', 'recovery_approved_other', 'recovery_ended', 'recovery_started', 'recovery_started_other',
            'signin_reset_asked', 'signin_reset_asked_other', 'signin_methods_reset', 'break_glass_used', 'break_glass_used_other', 'email_sign_in_link'] as $type) {
            $this->assertArrayHasKey($type, NotificationTypes::ALL, $type);
            $this->assertTrue(NotificationTypes::isEssential($type), $type);
        }
    }

    public function test_every_type_the_security_alerts_send_is_registered(): void
    {
        $code = file_get_contents(app_path('Services/Security/SecurityAlerts.php'));
        preg_match_all('/\$this->(?:tell|say)\(\$\w+, \'([a-z_]+)\'/', $code, $m);
        $this->assertGreaterThan(15, count($m[1]), 'the pattern should find them all');
        foreach (array_unique($m[1]) as $type) {
            $this->assertArrayHasKey($type, NotificationTypes::ALL, "{$type} is sent but not registered, so it would be treated as a bell-only, non-essential message");
        }
    }
}
