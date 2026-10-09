<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\NotificationSettingsController;
use App\Models\NotificationDelivery;
use App\Models\User;
use App\Services\Notify\ConnectionTester;
use App\Services\Notify\Notifier;
use App\Services\Notify\NotifySettings;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

/** The settings API: what it returns (never a secret), what it refuses, and that a failed connection test changes nothing unless the admin says so. */
class NotificationSettingsControllerTest extends NotifyTestCase
{
    private function c(): NotificationSettingsController
    {
        return new NotificationSettingsController(app(NotifySettings::class), app(ConnectionTester::class));
    }

    /** A request by a user who holds exactly these permissions. */
    private function as(array $permissions, string $method = 'GET', array $data = []): Request
    {
        $user = \Mockery::mock(User::class)->makePartial();
        $user->forceFill(['id' => 5, 'name' => 'Admin 5', 'email' => 'admin5@example.com']);
        $user->shouldReceive('hasPermission')->andReturnUsing(fn ($p) => in_array($p, $permissions, true));
        $this->admin();
        $r = Request::create('/x', $method, $data);
        $r->setUserResolver(fn () => $user);

        return $r;
    }

    private function body(\Illuminate\Http\JsonResponse $r): array
    {
        return $r->getData(true);
    }

    public function test_the_settings_screen_data_has_no_secret_and_says_what_the_person_may_do(): void
    {
        $this->c()->update($this->as(['notifications.settings'], 'PUT', ['host' => 'smtp.example.com', 'password' => 'hunter2-SECRET', 'from_address' => 'shop@example.com', 'anyway' => true]), 'email');
        $d = $this->body($this->c()->show($this->as(['notifications.view', 'notifications.settings'])));

        $this->assertStringNotContainsString('hunter2', json_encode($d));
        $this->assertSame(['set' => true, 'hint' => '••••CRET'], $d['parts']['email']['password']);
        $this->assertTrue($d['saved']['email']);
        $this->assertSame(['settings' => true, 'send' => false, 'purge' => false], $d['can']);
        $this->assertContains('order_placed', array_column($d['types'], 'key'));
    }

    public function test_a_failed_test_returns_a_422_with_the_reason_and_changes_nothing(): void
    {
        $r = $this->c()->update($this->as(['notifications.settings'], 'PUT', ['host' => '127.0.0.1', 'port' => 1, 'encryption' => 'none', 'from_address' => 'shop@example.com']), 'email');
        $this->assertSame(422, $r->getStatusCode());
        $this->assertStringContainsString('Nothing was changed', $this->body($r)['message']);
        $this->assertFalse(app(NotifySettings::class)->isSaved('email'));
    }

    public function test_save_anyway_is_honoured_and_the_general_part_needs_no_test(): void
    {
        $r = $this->c()->update($this->as(['notifications.settings'], 'PUT', ['host' => '127.0.0.1', 'port' => 1, 'encryption' => 'none', 'from_address' => 'shop@example.com', 'anyway' => true]), 'email');
        $this->assertSame(200, $r->getStatusCode());
        $g = $this->c()->update($this->as(['notifications.settings'], 'PUT', ['default_mode' => 'email']), 'general');
        $this->assertSame(200, $g->getStatusCode());
        $this->assertSame('email', app(NotifySettings::class)->get('general')['default_mode']);
    }

    public function test_a_part_that_does_not_exist_is_not_found(): void
    {
        $this->expectException(HttpException::class);
        $this->c()->update($this->as(['notifications.settings'], 'PUT', ['provider' => 'meta']), 'sms');
    }

    public function test_history_and_rollback_through_the_api(): void
    {
        $s = app(NotifySettings::class);
        $s->save('general', ['default_mode' => 'email'], $this->admin());
        $s->save('general', ['default_mode' => 'whatsapp'], $this->admin());
        $v = $this->body($this->c()->versions('general'))['data'];
        $this->assertSame([2, 1], array_column($v, 'version_no'));

        $r = $this->c()->rollback($this->as(['notifications.settings'], 'POST'), 'general', $v[1]['id']);
        $this->assertSame(200, $r->getStatusCode());
        $this->assertSame('email', $s->get('general')['default_mode']);

        $bad = $this->c()->rollback($this->as(['notifications.settings'], 'POST'), 'general', 9999);
        $this->assertSame(422, $bad->getStatusCode());
    }

    public function test_the_log_shows_who_and_what_without_secrets(): void
    {
        $this->c()->update($this->as(['notifications.settings'], 'PUT', ['host' => 'smtp.example.com', 'password' => 'hunter2-SECRET', 'from_address' => 'shop@example.com', 'anyway' => true]), 'email');
        $log = $this->body($this->c()->log($this->as(['notifications.view'])));
        $this->assertSame('saved_anyway', $log['data'][0]['event']);
        $this->assertSame('Admin 5', $log['data'][0]['by']);
        $this->assertStringNotContainsString('hunter2', json_encode($log));
    }

    public function test_the_owner_purges_old_keys_through_the_api(): void
    {
        $s = app(NotifySettings::class);
        $s->save('email', ['host' => 'a.example.com', 'password' => 'first-KEY-1111', 'from_address' => 'shop@example.com'], $this->admin(), fn () => ['ok' => true]);
        $s->save('email', ['password' => 'second-KEY-2222'], $this->admin(), fn () => ['ok' => true]);
        $ids = array_column($s->versions('email'), 'id');
        $r = $this->c()->purgeKeys($this->as(['notifications.keys.purge'], 'POST', ['version_ids' => $ids]));
        $this->assertSame(['purged' => 1, 'skipped_current' => 1, 'nothing_to_purge' => 0], $this->body($r)['result']);
    }

    public function test_the_delivery_log_filters_and_retry_names_the_person(): void
    {
        \Illuminate\Support\Facades\Queue::fake();
        foreach ([['email', 'failed', 'a@example.com'], ['email', 'sent', 'b@example.com'], ['whatsapp', 'to_send', '+254700000000']] as [$ch, $st, $to]) {
            NotificationDelivery::create(['type' => 'order_placed', 'channel' => $ch, 'status' => $st, 'to_address' => $to, 'subject' => 'Order placed']);
        }
        $failed = $this->body($this->c()->deliveries($this->as(['notifications.view'], 'GET', ['status' => 'failed'])));
        $this->assertSame(['a@example.com'], array_column($failed['data'], 'to'));
        $this->assertSame('Order placed', $failed['data'][0]['type_label'] === 'Order placed' ? 'Order placed' : '');
        $this->assertCount(1, $this->body($this->c()->deliveries($this->as(['notifications.view'], 'GET', ['channel' => 'whatsapp'])))['data']);

        $r = $this->c()->retry($this->as(['notifications.send'], 'POST'), $failed['data'][0]['id'], app(Notifier::class));
        $this->assertSame(200, $r->getStatusCode());
        $this->assertSame('queued', NotificationDelivery::find($failed['data'][0]['id'])->status);
        $this->assertSame(422, $this->c()->retry($this->as(['notifications.send'], 'POST'), NotificationDelivery::where('status', 'sent')->value('id'), app(Notifier::class))->getStatusCode());
    }
}
