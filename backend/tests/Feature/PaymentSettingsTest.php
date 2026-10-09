<?php

namespace Tests\Feature;

use App\Models\PaymentSettingLog;
use App\Models\PaymentSettingVersion;
use App\Models\User;
use App\Services\DarajaService;
use App\Services\Books\GatewayPaymentService;
use App\Services\Payments\DarajaConfigurator;
use App\Services\Payments\DarajaTester;
use App\Services\Payments\PaymentException;
use App\Services\Payments\PaymentSettings;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;

/** The payment keys: versions and rollback, write-only keys, a proved connection before they go live, the callback token and its two-hour grace, and how they are laid over .env. */
class PaymentSettingsTest extends NotifyTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Schema::create('payment_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->longText('mpesa_enc')->nullable(); $t->json('versions')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('payment_setting_versions', function ($t) { $t->id(); $t->string('part', 20); $t->unsignedInteger('version_no'); $t->longText('snapshot_enc')->nullable(); $t->string('summary', 500)->nullable(); $t->json('changed_keys')->nullable(); $t->string('action', 20)->default('save'); $t->unsignedBigInteger('rolled_back_from')->nullable(); $t->boolean('tested_ok')->nullable(); $t->boolean('has_secrets')->default(false); $t->dateTime('secrets_purged_at')->nullable(); $t->unsignedBigInteger('secrets_purged_by')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamp('created_at')->nullable(); $t->unique(['part', 'version_no']); });
        Schema::create('payment_setting_logs', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('event', 40); $t->string('part', 20)->nullable(); $t->unsignedBigInteger('version_id')->nullable(); $t->string('summary', 500)->nullable(); $t->json('context')->nullable(); $t->string('ip', 45)->nullable(); $t->timestamp('created_at')->nullable(); });
        PaymentSettings::forget();
        config(['daraja.env' => 'sandbox', 'daraja.consumer_key' => 'ENVKEY', 'daraja.consumer_secret' => 'ENVSECRET', 'daraja.shortcode' => '111111', 'daraja.passkey' => 'ENVPASS', 'daraja.callback_token' => '', 'daraja.callback_token_previous' => '']);
    }

    private function svc(): PaymentSettings
    {
        return app(PaymentSettings::class);
    }

    private function keys(array $o = []): array
    {
        return $o + ['env' => 'sandbox', 'consumer_key' => 'KEY-AAAA-1111', 'consumer_secret' => 'SECRET-BBBB-2222', 'shortcode' => '174379', 'passkey' => 'PASS-CCCC-3333'];
    }

    private function ok(): \Closure
    {
        return fn () => ['ok' => true, 'message' => 'Safaricom accepted it.'];
    }

    // ------------------------------------------------------------ saving

    public function test_the_first_save_makes_version_1_a_callback_token_and_a_log_line_without_any_key(): void
    {
        $r = $this->svc()->save('mpesa', $this->keys(), $this->admin(), $this->ok());
        $this->assertSame([1, false], [$r['version']->version_no, $r['unchanged']]);
        $this->assertSame(40, strlen($this->svc()->get('mpesa')['callback_token']), 'made for the owner: callbacks without it are not believed');
        $log = PaymentSettingLog::first();
        $this->assertSame('saved', $log->event);
        $this->assertStringNotContainsString('AAAA', json_encode($log->toArray()));
        $this->assertStringNotContainsString('BBBB', json_encode($log->toArray()));
        $this->assertContains('consumer secret (changed)', $r['changed']);
        $this->assertNotContains('consumer secret', $r['changed']);
    }

    public function test_a_key_is_never_returned_only_whether_it_is_set_and_its_last_four(): void
    {
        $this->svc()->save('mpesa', $this->keys(), $this->admin(), $this->ok());
        $m = $this->svc()->masked('mpesa');
        $this->assertSame(['set' => true, 'hint' => '••••1111'], $m['consumer_key']);
        $this->assertSame(['set' => true, 'hint' => '••••3333'], $m['passkey']);
        $this->assertTrue($m['callback_token']['set']);
        $this->assertStringNotContainsString('SECRET-BBBB', json_encode($m));
        $this->assertStringNotContainsString($this->svc()->get('mpesa')['callback_token'], json_encode($m));
        $this->assertSame('174379', $m['shortcode'], 'the shortcode is a public number, shown as it is');
    }

    public function test_a_blank_key_is_kept_clear_empties_it_and_the_token_can_not_be_typed_in(): void
    {
        $this->svc()->save('mpesa', $this->keys(), $this->admin(), $this->ok());
        $token = $this->svc()->get('mpesa')['callback_token'];
        $r = $this->svc()->save('mpesa', ['shortcode' => '600000', 'consumer_secret' => '', 'callback_token' => 'typed-by-an-attacker'], $this->admin(), $this->ok());
        $this->assertSame(['shortcode'], $r['changed']);
        $c = $this->svc()->get('mpesa');
        $this->assertSame(['SECRET-BBBB-2222', $token], [$c['consumer_secret'], $c['callback_token']]);

        $this->svc()->save('mpesa', [], $this->admin(), $this->ok(), false, ['passkey', 'callback_token']);
        $c = $this->svc()->get('mpesa');
        $this->assertSame(['', $token], [$c['passkey'], $c['callback_token']], 'the token is only ever made or rotated by us');
    }

    public function test_nothing_different_saves_nothing(): void
    {
        $this->svc()->save('mpesa', $this->keys(), $this->admin(), $this->ok());
        $r = $this->svc()->save('mpesa', $this->keys(), $this->admin(), $this->ok());
        $this->assertTrue($r['unchanged']);
        $this->assertSame(1, PaymentSettingVersion::count());
    }

    public function test_the_fields_are_checked(): void
    {
        foreach ([['shortcode' => '12ab'], ['shortcode' => '12'], ['env' => 'staging'], ['account_reference' => 'WAY-TOO-LONG-REF'], ['transaction_desc' => 'a description that is too long'], ['callback_url' => 'not a url']] as $bad) {
            try {
                $this->svc()->save('mpesa', $this->keys($bad), $this->admin(), $this->ok());
                $this->fail('Should have refused ' . json_encode($bad));
            } catch (\Illuminate\Validation\ValidationException) {
                $this->addToAssertionCount(1);
            }
        }
        $this->expectException(PaymentException::class);
        $this->expectExceptionMessage('must start with https://');
        $this->svc()->save('mpesa', $this->keys(['env' => 'production', 'callback_url' => 'http://example.com/cb']), $this->admin(), $this->ok());
    }

    // ------------------------------------------------------------ proving the key first

    public function test_a_key_safaricom_refuses_is_not_saved_unless_the_owner_says_save_anyway(): void
    {
        $refuse = fn () => ['ok' => false, 'message' => 'Safaricom did not accept the key.'];
        try {
            $this->svc()->save('mpesa', $this->keys(), $this->admin(), $refuse);
            $this->fail('should be refused');
        } catch (PaymentException $e) {
            $this->assertStringContainsString('Nothing was changed', $e->getMessage());
        }
        $this->assertSame(0, PaymentSettingVersion::count());
        $this->assertSame('save_refused', PaymentSettingLog::first()->event);

        $r = $this->svc()->save('mpesa', $this->keys(), $this->admin(), $refuse, true);
        $this->assertFalse($r['version']->tested_ok);
        $this->assertSame('saved_anyway', PaymentSettingLog::latest('id')->first()->event);
    }

    public function test_the_test_runs_only_when_the_key_secret_or_environment_changed(): void
    {
        $calls = 0;
        $count = function () use (&$calls) { $calls++; return ['ok' => true, 'message' => 'ok']; };
        $this->svc()->save('mpesa', $this->keys(), $this->admin(), $count);
        $this->assertSame(1, $calls);
        $this->svc()->save('mpesa', ['shortcode' => '600000', 'account_reference' => 'SHOP'], $this->admin(), $count);
        $this->assertSame(1, $calls, 'a changed shortcode needs no round trip to Safaricom');
        $this->svc()->save('mpesa', ['consumer_key' => 'KEY-NEW-9999'], $this->admin(), $count);
        $this->assertSame(2, $calls);
        $this->svc()->save('mpesa', ['env' => 'production'], $this->admin(), $count);
        $this->assertSame(3, $calls);
    }

    public function test_the_tester_asks_safaricom_for_a_token_and_explains_a_refusal(): void
    {
        Http::fake(['sandbox.safaricom.co.ke/*' => Http::response(['access_token' => 'abc'], 200), 'api.safaricom.co.ke/*' => Http::response(['errorMessage' => 'Invalid'], 400)]);
        $t = app(DarajaTester::class);
        $this->assertTrue($t->connection($this->keys())['ok']);
        $bad = $t->connection($this->keys(['env' => 'production']));
        $this->assertFalse($bad['ok']);
        $this->assertStringContainsString('live environment (answer 400)', $bad['message']);
        $this->assertStringContainsString('not the sandbox ones', $bad['message']);
        $this->assertFalse($t->connection(['consumer_key' => '', 'consumer_secret' => ''])['ok']);
    }

    // ------------------------------------------------------------ history

    public function test_a_rollback_restores_the_old_keys_as_a_new_version_but_keeps_the_current_token(): void
    {
        $this->svc()->save('mpesa', $this->keys(), $this->admin(), $this->ok());
        $this->svc()->save('mpesa', ['consumer_key' => 'KEY-SECOND-2222', 'shortcode' => '600000'], $this->admin(), $this->ok());
        $this->svc()->rotateToken('mpesa', $this->admin());
        $token = $this->svc()->get('mpesa')['callback_token'];
        $v1 = PaymentSettingVersion::where('version_no', 1)->first();

        $new = $this->svc()->rollback('mpesa', $v1->id, $this->admin());
        $c = $this->svc()->get('mpesa');
        $this->assertSame([4, 'rollback', 'KEY-AAAA-1111', '174379'], [$new->version_no, $new->action, $c['consumer_key'], $c['shortcode']]);
        $this->assertSame($token, $c['callback_token'], 'the address Safaricom has been given stays valid');
        $this->assertSame($v1->id, $new->rolled_back_from);
        $this->assertSame('rolled_back', PaymentSettingLog::latest('id')->first()->event);

        $this->expectException(PaymentException::class);
        $this->expectExceptionMessage('already the version in use');
        $this->svc()->rollback('mpesa', $new->id, $this->admin());
    }

    public function test_only_old_versions_lose_their_keys_and_those_can_not_be_restored(): void
    {
        $this->svc()->save('mpesa', $this->keys(), $this->admin(), $this->ok());
        $this->svc()->save('mpesa', ['consumer_key' => 'KEY-SECOND-2222'], $this->admin(), $this->ok());
        $ids = PaymentSettingVersion::pluck('id')->all();
        $r = $this->svc()->purgeSecrets($ids, $this->admin());
        $this->assertSame([1, 1, 0], [$r['purged'], $r['skipped_current'], $r['nothing_to_purge']]);
        $this->assertSame('KEY-SECOND-2222', $this->svc()->get('mpesa')['consumer_key'], 'the live keys are untouched');
        $this->assertTrue($this->svc()->versions('mpesa')[1]['keys_deleted']);
        $this->expectException(PaymentException::class);
        $this->expectExceptionMessage('were deleted');
        $this->svc()->rollback('mpesa', PaymentSettingVersion::where('version_no', 1)->value('id'), $this->admin());
    }

    public function test_clearing_goes_back_to_the_server_keys_and_can_be_undone(): void
    {
        $this->svc()->save('mpesa', $this->keys(), $this->admin(), $this->ok());
        $v = $this->svc()->reset('mpesa', $this->admin());
        $this->assertSame('', $this->svc()->get('mpesa')['consumer_key']);
        $this->svc()->rollback('mpesa', PaymentSettingVersion::where('version_no', 1)->value('id'), $this->admin());
        $this->assertSame('KEY-AAAA-1111', $this->svc()->get('mpesa')['consumer_key']);
        $this->assertSame(2, $v->version_no);
    }

    public function test_keys_that_can_no_longer_be_decrypted_are_reported_not_crashed_on(): void
    {
        $this->svc()->save('mpesa', $this->keys(), $this->admin(), $this->ok());
        config(['app.key' => 'base64:' . base64_encode(str_repeat('z', 32))]);
        app()->forgetInstance('encrypter');
        \Illuminate\Support\Facades\Crypt::clearResolvedInstance('encrypter');
        PaymentSettings::forget();
        $this->assertTrue($this->svc()->unreadable('mpesa'));
        $this->assertSame('', $this->svc()->get('mpesa')['consumer_key']);
    }

    // ------------------------------------------------------------ the callback token

    public function test_a_new_token_is_accepted_beside_the_old_one_for_two_hours_only(): void
    {
        $this->svc()->save('mpesa', $this->keys(), $this->admin(), $this->ok());
        app(DarajaConfigurator::class)->apply();
        $old = $this->svc()->get('mpesa')['callback_token'];
        $this->assertTrue(PaymentSettings::callbackTokenValid($old));
        $this->assertFalse(PaymentSettings::callbackTokenValid('wrong'));
        $this->assertFalse(PaymentSettings::callbackTokenValid(null));

        $this->svc()->rotateToken('mpesa', $this->admin());
        app(DarajaConfigurator::class)->apply();
        $new = $this->svc()->get('mpesa')['callback_token'];
        $this->assertNotSame($old, $new);
        $this->assertTrue(PaymentSettings::callbackTokenValid($new));
        $this->assertTrue(PaymentSettings::callbackTokenValid($old), 'a payment already waiting still arrives');

        $this->travel(121)->minutes();
        app(DarajaConfigurator::class)->apply();
        $this->assertFalse(PaymentSettings::callbackTokenValid($old), 'two hours on, the old one is dead');
        $this->assertTrue(PaymentSettings::callbackTokenValid($new));
    }

    public function test_with_no_token_anywhere_callbacks_are_not_refused_as_before_this_screen(): void
    {
        config(['daraja.callback_token' => '', 'daraja.callback_token_previous' => '']);
        $this->assertTrue(PaymentSettings::callbackTokenValid(null));
    }

    public function test_the_callback_door_lets_a_payment_through_only_with_a_believable_token(): void
    {
        $this->svc()->save('mpesa', $this->keys(), $this->admin(), $this->ok());
        app(DarajaConfigurator::class)->apply();
        $token = $this->svc()->get('mpesa')['callback_token'];
        $this->mock(DarajaService::class, fn ($m) => $m->shouldReceive('parseCallback')->andReturn(['checkout_request_id' => 'X']));
        $this->mock(GatewayPaymentService::class, fn ($m) => $m->shouldReceive('handleCallback')->once()->andReturn(true));

        $this->postJson('/api/payments/callback?token=nope', ['Body' => []])->assertOk();   // answered "Accepted" so Safaricom does not retry, but nothing is settled
        $this->postJson('/api/payments/callback?token=' . $token, ['Body' => []])->assertOk();
    }

    // ------------------------------------------------------------ laid over .env

    public function test_what_is_saved_wins_over_env_a_blank_field_falls_back_and_nothing_saved_changes_nothing(): void
    {
        $this->assertFalse(app(DarajaConfigurator::class)->apply());
        $this->assertSame('ENVKEY', config('daraja.consumer_key'));

        $this->svc()->save('mpesa', $this->keys(['passkey' => '']), $this->admin(), $this->ok());
        $this->assertTrue(app(DarajaConfigurator::class)->apply());
        $this->assertSame(['KEY-AAAA-1111', 'SECRET-BBBB-2222', '174379'], [config('daraja.consumer_key'), config('daraja.consumer_secret'), config('daraja.shortcode')]);
        $this->assertSame('ENVPASS', config('daraja.passkey'), 'the passkey was left blank here, so the server\'s own stays');
        $this->assertSame(['ENVKEY', 'ENVPASS'], [app('daraja.server_values')['consumer_key'], app('daraja.server_values')['passkey']], 'what .env said is remembered for the screen');
        $this->assertStringContainsString('/api/payments/callback?token=' . $this->svc()->get('mpesa')['callback_token'], config('daraja.callback_url'));
    }

    public function test_a_typed_callback_address_replaces_the_default(): void
    {
        $this->svc()->save('mpesa', $this->keys(['callback_url' => 'https://tunnel.example.com/api/payments/callback']), $this->admin(), $this->ok());
        app(DarajaConfigurator::class)->apply();
        $this->assertStringStartsWith('https://tunnel.example.com/api/payments/callback?token=', config('daraja.callback_url'));
    }
}
