<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\PaymentSettingsController;
use App\Models\NotificationDelivery;
use App\Models\PaymentSettingLog;
use App\Models\User;
use App\Services\DarajaService;
use App\Services\Notify\Staff;
use App\Services\Payments\DarajaTester;
use App\Services\Payments\PaymentAlerts;
use App\Services\Payments\PaymentSettings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;

/** The owner's payment keys screen API: the password again for every change, the owners emailed, nothing secret ever returned, and the proof against Safaricom. */
class PaymentSettingsControllerTest extends NotifyTestCase
{
    private User $owner;
    private User $other;

    protected function setUp(): void
    {
        parent::setUp();
        Schema::create('payment_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->longText('mpesa_enc')->nullable(); $t->json('versions')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('payment_setting_versions', function ($t) { $t->id(); $t->string('part', 20); $t->unsignedInteger('version_no'); $t->longText('snapshot_enc')->nullable(); $t->string('summary', 500)->nullable(); $t->json('changed_keys')->nullable(); $t->string('action', 20)->default('save'); $t->unsignedBigInteger('rolled_back_from')->nullable(); $t->boolean('tested_ok')->nullable(); $t->boolean('has_secrets')->default(false); $t->dateTime('secrets_purged_at')->nullable(); $t->unsignedBigInteger('secrets_purged_by')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamp('created_at')->nullable(); $t->unique(['part', 'version_no']); });
        Schema::create('payment_setting_logs', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('event', 40); $t->string('part', 20)->nullable(); $t->unsignedBigInteger('version_id')->nullable(); $t->string('summary', 500)->nullable(); $t->json('context')->nullable(); $t->string('ip', 45)->nullable(); $t->timestamp('created_at')->nullable(); });
        PaymentSettings::forget();
        Queue::fake();
        config(['daraja.env' => 'sandbox', 'daraja.consumer_key' => 'ENVKEY', 'daraja.consumer_secret' => 'ENVSECRET', 'daraja.shortcode' => '', 'daraja.passkey' => '', 'daraja.callback_token' => '']);
        $this->owner = User::forceCreate(['id' => 21, 'name' => 'Owner One', 'email' => 'owner@example.com', 'password' => Hash::make('correct-horse')]);
        $this->other = User::forceCreate(['id' => 22, 'name' => 'Owner Two', 'email' => 'owner2@example.com', 'password' => Hash::make('x')]);
        $owners = [$this->owner, $this->other];
        $this->app->instance(Staff::class, new class($owners) extends Staff {
            public function __construct(public array $users)
            {
            }

            public function holding(string $permission): \Illuminate\Support\Collection
            {
                return $permission === 'payments.keys' ? collect($this->users) : collect();
            }
        });
        $this->safaricom(200);
    }

    private function safaricom(int $status): void
    {
        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::fake(['sandbox.safaricom.co.ke/*' => Http::response($status === 200 ? ['access_token' => 't'] : [], $status)]);
    }

    private function c(): PaymentSettingsController
    {
        return new PaymentSettingsController(app(PaymentSettings::class), app(DarajaTester::class), app(PaymentAlerts::class));
    }

    private function req(array $data = [], string $method = 'PUT', ?User $as = null): Request
    {
        $r = Request::create('/x', $method, $data);
        $r->setUserResolver(fn () => $as ?? $this->owner);

        return $r;
    }

    private function body(\Illuminate\Http\JsonResponse $r): array
    {
        return $r->getData(true);
    }

    private function keys(array $o = []): array
    {
        return $o + ['env' => 'sandbox', 'consumer_key' => 'KEY-AAAA-1111', 'consumer_secret' => 'SECRET-BBBB-2222', 'shortcode' => '174379', 'passkey' => 'PASS-CCCC-3333', 'password' => 'correct-horse'];
    }

    public function test_a_change_without_the_right_password_is_refused_logged_and_changes_nothing(): void
    {
        $r = $this->c()->update($this->req(array_replace($this->keys(), ['password' => 'wrong'])), 'mpesa');
        $this->assertSame(422, $r->getStatusCode());
        $this->assertStringContainsString('password is not right', $this->body($r)['message']);
        $this->assertFalse(app(PaymentSettings::class)->isSaved('mpesa'));
        $this->assertSame('password_failed', PaymentSettingLog::latest('id')->first()->event);
        $this->assertSame(0, NotificationDelivery::count(), 'a refused change tells nobody there is a change');

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $this->c()->update($this->req(array_diff_key($this->keys(), ['password' => 1])), 'mpesa');
    }

    public function test_a_saved_change_is_logged_and_emailed_to_every_owner_without_any_key_in_it(): void
    {
        $r = $this->c()->update($this->req($this->keys()), 'mpesa');
        $this->assertSame(200, $r->getStatusCode());
        $this->assertStringContainsString('Saved as version 1', $this->body($r)['message']);

        $mails = NotificationDelivery::where('type', 'payment_settings_changed')->where('channel', 'email')->orderBy('id')->get();
        $this->assertSame(['owner@example.com', 'owner2@example.com'], $mails->pluck('to_address')->all(), 'every holder of the permission, the person who did it included');
        $text = $mails->first()->subject . $mails->first()->body;
        $this->assertStringContainsString('Owner One changed the M-Pesa payment settings', $text);
        $this->assertStringContainsString('consumer secret (changed)', $text);
        $this->assertStringContainsString('roll the change back', $text);
        foreach (['AAAA-1111', 'BBBB-2222', 'CCCC-3333', app(PaymentSettings::class)->get('mpesa')['callback_token']] as $secret) {
            $this->assertStringNotContainsString($secret, $text . json_encode(PaymentSettingLog::all()->toArray()));
        }
    }

    public function test_the_screen_data_never_holds_a_key_and_says_where_each_value_comes_from(): void
    {
        $this->c()->update($this->req($this->keys(['passkey' => ''])), 'mpesa');
        $d = $this->body($this->c()->show($this->req([], 'GET')));
        $json = json_encode($d);
        foreach (['AAAA-1111', 'BBBB-2222', 'ENVKEY'] as $secret) {
            $this->assertStringNotContainsString($secret, $json);
        }
        $this->assertSame(['set' => true, 'hint' => '••••1111'], $d['parts']['mpesa']['consumer_key']);
        $this->assertEquals(['consumer_key' => 'screen', 'consumer_secret' => 'screen', 'shortcode' => 'screen', 'passkey' => 'none', 'env' => 'screen', 'callback_token' => 'screen'], $d['in_use']);
        $this->assertTrue($d['callback']['token_set']);
        $this->assertStringEndsWith('/api/payments/callback', $d['callback']['url']);
        $this->assertStringNotContainsString('token=', $d['callback']['url']);
    }

    public function test_before_anything_is_saved_the_screen_reports_the_servers_own_keys(): void
    {
        app(\App\Services\Payments\DarajaConfigurator::class)->apply();
        $d = $this->body($this->c()->show($this->req([], 'GET')));
        $this->assertFalse($d['saved']['mpesa']);
        $this->assertSame('server', $d['in_use']['consumer_key']);
        $this->assertSame('none', $d['in_use']['passkey']);
        $this->assertFalse($d['callback']['token_set']);
    }

    public function test_the_key_test_uses_the_typed_keys_with_the_saved_ones_filled_in_and_saves_nothing(): void
    {
        $r = $this->c()->test($this->req(['consumer_key' => 'TYPED-KEY', 'consumer_secret' => 'TYPED-SECRET'], 'POST'));
        $this->assertSame(200, $r->getStatusCode());
        Http::assertSent(fn ($req) => str_contains($req->url(), 'sandbox.safaricom.co.ke') && $req->hasHeader('Authorization', 'Basic ' . base64_encode('TYPED-KEY:TYPED-SECRET')));
        $this->assertFalse(app(PaymentSettings::class)->isSaved('mpesa'));
        $this->assertSame('tested', PaymentSettingLog::latest('id')->first()->event);

        $this->safaricom(400);
        $this->assertSame(422, $this->c()->test($this->req(['consumer_key' => 'x', 'consumer_secret' => 'y'], 'POST'))->getStatusCode());
    }

    public function test_saving_keys_safaricom_refuses_is_refused_with_its_reason_and_save_anyway_goes_through_and_is_said_so(): void
    {
        $this->safaricom(400);
        $r = $this->c()->update($this->req($this->keys()), 'mpesa');
        $this->assertSame(422, $r->getStatusCode());
        $this->assertStringContainsString('did not accept the key and secret', $this->body($r)['message']);
        $this->assertFalse(app(PaymentSettings::class)->isSaved('mpesa'));

        $this->c()->update($this->req($this->keys() + ['anyway' => true]), 'mpesa');
        $this->assertTrue(app(PaymentSettings::class)->isSaved('mpesa'));
        $this->assertStringContainsString('saved although Safaricom did not accept the key', NotificationDelivery::where('type', 'payment_settings_changed')->value('body'));
    }

    public function test_rotating_the_token_resetting_and_rolling_back_each_need_the_password_and_tell_the_owners(): void
    {
        $this->c()->update($this->req($this->keys()), 'mpesa');
        $before = NotificationDelivery::count();

        $this->assertSame(422, $this->c()->rotateToken($this->req(['password' => 'nope'], 'POST'), 'mpesa')->getStatusCode());
        $this->assertSame(422, $this->c()->reset($this->req(['password' => 'nope'], 'POST'), 'mpesa')->getStatusCode());
        $this->assertSame(422, $this->c()->rollback($this->req(['password' => 'nope'], 'POST'), 'mpesa', 1)->getStatusCode());
        $this->assertSame($before, NotificationDelivery::count(), 'nothing happened, so nobody is told');

        $this->assertSame(200, $this->c()->rotateToken($this->req(['password' => 'correct-horse'], 'POST'), 'mpesa')->getStatusCode());
        $this->assertSame(200, $this->c()->reset($this->req(['password' => 'correct-horse'], 'POST'), 'mpesa')->getStatusCode());
        $this->assertSame(200, $this->c()->rollback($this->req(['password' => 'correct-horse'], 'POST'), 'mpesa', 1)->getStatusCode());
        $this->assertSame($before + 6, NotificationDelivery::count(), 'three changes, two owners each, one email each');
        $this->assertSame(['KEY-AAAA-1111'], [app(PaymentSettings::class)->get('mpesa')['consumer_key']]);
        $versions = $this->body($this->c()->versions('mpesa'))['data'];
        $this->assertSame([4, 3, 2, 1], array_column($versions, 'version_no'));
    }

    public function test_deleting_old_keys_needs_the_password_and_never_touches_the_live_version(): void
    {
        $this->c()->update($this->req($this->keys()), 'mpesa');
        $this->c()->update($this->req(['password' => 'correct-horse', 'consumer_key' => 'KEY-SECOND-2222']), 'mpesa');
        $ids = array_column($this->body($this->c()->versions('mpesa'))['data'], 'id');
        $this->assertSame(422, $this->c()->purgeKeys($this->req(['password' => 'bad', 'version_ids' => $ids], 'POST'))->getStatusCode());
        $r = $this->body($this->c()->purgeKeys($this->req(['password' => 'correct-horse', 'version_ids' => $ids], 'POST')));
        $this->assertSame([1, 1], [$r['purged'], $r['skipped_current']]);
        $this->assertStringContainsString('Old payment keys were deleted', NotificationDelivery::where('type', 'payment_settings_changed')->latest('id')->value('subject'));
    }

    public function test_the_kes_1_test_prompt_needs_the_password_and_goes_through_the_live_keys(): void
    {
        $sent = [];
        $this->mock(DarajaService::class, function ($m) use (&$sent) {
            $m->shouldReceive('normalizePhone')->andReturn('254712345678');
            $m->shouldReceive('stkPush')->once()->andReturnUsing(function ($phone, $amount) use (&$sent) { $sent = [$phone, $amount]; return ['ResponseCode' => '0']; });
        });
        $this->assertSame(422, $this->c()->testPrompt($this->req(['phone' => '0712345678', 'password' => 'wrong'], 'POST'))->getStatusCode());
        $r = $this->c()->testPrompt($this->req(['phone' => '0712345678', 'password' => 'correct-horse'], 'POST'));
        $this->assertSame(200, $r->getStatusCode());
        $this->assertSame(['254712345678', 1.0], [$sent[0], (float) $sent[1]]);
        $log = PaymentSettingLog::latest('id')->first();
        $this->assertSame('test_prompt', $log->event);
        $this->assertStringNotContainsString('254712345678', $log->summary, 'the number is masked in the record');
    }

    public function test_the_routes_are_for_the_payment_keys_permission_alone(): void
    {
        $this->getJson('/api/admin/payments/settings')->assertStatus(401);
        $routes = collect(\Illuminate\Support\Facades\Route::getRoutes()->getRoutes())->filter(fn ($r) => str_starts_with($r->uri(), 'api/admin/payments'));
        $this->assertGreaterThanOrEqual(10, $routes->count());
        foreach ($routes as $r) {
            $this->assertContains('permission:payments.keys', $r->gatherMiddleware(), $r->uri() . ' must need the payment-keys permission');
        }
    }
}
