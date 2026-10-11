<?php

namespace Tests\Feature;

use App\Models\PaymentSettingLog;
use App\Models\User;
use App\Services\DarajaService;
use App\Services\Notify\Staff;
use App\Services\Payments\PaymentSettings;
use App\Services\Security\SecuritySettings;
use App\Services\Security\Sessions;
use App\Services\Security\StepUp\StepUp;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Payment keys and the "one more step" rule: once the rule is on, the door asks (passkey, or password until there is one) and the screen does not ask for the password a second time. */
class PaymentKeysStepUpTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('payment_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->longText('mpesa_enc')->nullable(); $t->json('versions')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('payment_setting_versions', function ($t) { $t->id(); $t->string('part', 20); $t->unsignedInteger('version_no'); $t->longText('snapshot_enc')->nullable(); $t->string('summary', 500)->nullable(); $t->json('changed_keys')->nullable(); $t->string('action', 20)->default('save'); $t->unsignedBigInteger('rolled_back_from')->nullable(); $t->boolean('tested_ok')->nullable(); $t->boolean('has_secrets')->default(false); $t->dateTime('secrets_purged_at')->nullable(); $t->unsignedBigInteger('secrets_purged_by')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamp('created_at')->nullable(); $t->unique(['part', 'version_no']); });
        Schema::create('payment_setting_logs', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('event', 40); $t->string('part', 20)->nullable(); $t->unsignedBigInteger('version_id')->nullable(); $t->string('summary', 500)->nullable(); $t->json('context')->nullable(); $t->string('ip', 45)->nullable(); $t->timestamp('created_at')->nullable(); });
        Cache::flush();
        PaymentSettings::forget();
        config(['app.key' => 'base64:'.base64_encode(str_repeat('k', 32)), 'app.cipher' => 'AES-256-CBC', 'security.rate_limits.step_up' => ['user' => [[1000, 15]]],
            'daraja.env' => 'sandbox', 'daraja.consumer_key' => 'ENVKEY', 'daraja.consumer_secret' => 'ENVSECRET', 'daraja.shortcode' => '', 'daraja.passkey' => '', 'daraja.callback_token' => '',
            'security.policy.stepup.payment_keys.mode' => 'off', 'security.policy.kill_switch' => false]);
        SecuritySettings::forget();
        StepUp::forget();
        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::fake(['sandbox.safaricom.co.ke/*' => Http::response(['access_token' => 't'], 200)]);
        $this->owner = User::forceCreate(['name' => 'Olive Owner', 'email' => 'owner@example.com', 'password' => Hash::make('Right-password-1'), 'role' => 'super_admin']);
        $owners = [$this->owner];
        $this->app->instance(Staff::class, new class($owners) extends Staff {
            public function __construct(public array $users) {}

            public function holding(string $permission): \Illuminate\Support\Collection
            {
                return collect($this->users);
            }
        });
        $this->app->instance(\App\Services\Notify\Notifier::class, new class extends \App\Services\Notify\Notifier {
            public function __construct() {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }

            public function sendToContact(array $contact, string $type, string $title, string $message, array $o = []): array
            {
                return $this->send(new \App\Models\User(), $type, $title, $message, $o);
            }
        });
    }

    private function mode(string $mode): void
    {
        config(['security.policy.stepup.payment_keys.mode' => $mode]);
        SecuritySettings::forget();
    }

    private ?string $token = null;

    /** The owner, in one sign-in for the whole test (an answer belongs to the sign-in that was asked). */
    private function as(): self
    {
        $token = $this->token ??= app(Sessions::class)->issue($this->owner, Request::create('/x', 'POST', [], [], [], ['REMOTE_ADDR' => '41.80.1.1']), 'auth-token', 'password');
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->defaultHeaders = [];
        $this->unencryptedCookies = [];

        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    private function keys(array $more = []): array
    {
        return $more + ['env' => 'sandbox', 'consumer_key' => 'KEY-AAAA-1111', 'consumer_secret' => 'SECRET-BBBB-2222', 'shortcode' => '174379', 'passkey' => 'PASS-CCCC-3333'];
    }

    public function test_with_the_rule_off_nothing_changes_the_password_is_still_asked_for(): void
    {
        $this->assertTrue($this->as()->getJson('/api/admin/payments/settings')->assertOk()->json('confirm_with_password'));
        $this->as()->putJson('/api/admin/payments/settings/mpesa', $this->keys())->assertStatus(422)->assertJsonValidationErrors('password');
        $this->as()->putJson('/api/admin/payments/settings/mpesa', $this->keys(['password' => 'wrong']))->assertStatus(422);
        $this->assertFalse(app(PaymentSettings::class)->isSaved('mpesa'));
        $this->as()->putJson('/api/admin/payments/settings/mpesa', $this->keys(['password' => 'Right-password-1']))->assertOk();
        $this->assertTrue(app(PaymentSettings::class)->isSaved('mpesa'));
    }

    public function test_in_test_mode_the_password_is_still_asked_for_and_the_screen_still_shows_its_box(): void
    {
        $this->mode('log');
        $this->assertTrue($this->as()->getJson('/api/admin/payments/settings')->json('confirm_with_password'));
        $this->as()->putJson('/api/admin/payments/settings/mpesa', $this->keys())->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_with_the_rule_on_the_door_asks_once_and_the_screen_does_not_ask_for_the_password_again(): void
    {
        $this->mode('enforce');
        $this->assertFalse($this->as()->getJson('/api/admin/payments/settings')->assertOk()->json('confirm_with_password'));

        $held = $this->as()->putJson('/api/admin/payments/settings/mpesa', $this->keys())->assertStatus(403);
        $held->assertJsonPath('step_up.rule', 'payment_keys');
        $id = $held->json('step_up.pending');
        $this->assertFalse(app(PaymentSettings::class)->isSaved('mpesa'));

        // the answer (a password, as this owner has no passkey yet) is the only proof asked for
        $this->as()->postJson("/api/auth/step-up/{$id}/approve", ['current_password' => 'Right-password-1', 'reason' => 'Rotating the keys'])->assertOk();
        $r = $this->as()->withHeader('X-Step-Up', $id)->putJson('/api/admin/payments/settings/mpesa', $this->keys())->assertOk();
        $this->assertStringContainsString('Saved as version 1', $r->json('message'));
        $this->assertTrue(app(PaymentSettings::class)->isSaved('mpesa'));
        $this->assertSame(0, PaymentSettingLog::where('event', 'password_failed')->count());
    }

    public function test_an_old_screen_that_still_sends_the_password_gets_the_same_question_and_answer(): void
    {
        $this->mode('enforce');
        $held = $this->as()->putJson('/api/admin/payments/settings/mpesa', $this->keys(['password' => 'Right-password-1']))->assertStatus(403);
        $id = $held->json('step_up.pending');
        $this->as()->postJson("/api/auth/step-up/{$id}/approve", ['current_password' => 'Right-password-1', 'reason' => 'Rotating the keys'])->assertOk();
        // the retry may or may not carry the password: it is not part of what was asked
        $this->as()->withHeader('X-Step-Up', $id)->putJson('/api/admin/payments/settings/mpesa', $this->keys(['password' => 'something else']))->assertOk();
        $facts = collect($held->json('step_up.facts'))->map(fn ($f) => $f['label'].': '.$f['value'])->implode(' | ');
        $this->assertStringNotContainsString('Right-password-1', $facts);
    }

    public function test_the_approval_covers_only_what_was_asked(): void
    {
        $this->mode('enforce');
        $id = $this->as()->putJson('/api/admin/payments/settings/mpesa', $this->keys())->assertStatus(403)->json('step_up.pending');
        $this->as()->postJson("/api/auth/step-up/{$id}/approve", ['current_password' => 'Right-password-1', 'reason' => 'Rotating the keys'])->assertOk();
        $this->as()->withHeader('X-Step-Up', $id)->putJson('/api/admin/payments/settings/mpesa', $this->keys(['shortcode' => '999999']))->assertStatus(403);   // another value, another question
        $this->assertFalse(app(PaymentSettings::class)->isSaved('mpesa'));
        $this->as()->withHeader('X-Step-Up', $id)->postJson('/api/admin/payments/settings/mpesa/reset')->assertStatus(403);                                    // another action
        $this->as()->withHeader('X-Step-Up', $id)->putJson('/api/admin/payments/settings/mpesa', $this->keys())->assertOk();
        $this->as()->withHeader('X-Step-Up', $id)->putJson('/api/admin/payments/settings/mpesa', $this->keys(['consumer_key' => 'KEY-DDDD-4444']))->assertStatus(403);   // used once
    }

    public function test_every_other_action_on_the_keys_is_confirmed_at_the_door_too(): void
    {
        $this->mode('enforce');
        $this->as()->postJson('/api/admin/payments/settings/mpesa/rotate-token')->assertStatus(403)->assertJsonPath('step_up.rule', 'payment_keys');
        $this->as()->postJson('/api/admin/payments/settings/mpesa/reset')->assertStatus(403)->assertJsonPath('step_up.rule', 'payment_keys');
        $this->as()->postJson('/api/admin/payments/settings/purge-keys', ['version_ids' => [1]])->assertStatus(403)->assertJsonPath('step_up.rule', 'payment_keys');
        $this->as()->postJson('/api/admin/payments/settings/mpesa/versions/1/rollback')->assertStatus(403)->assertJsonPath('step_up.rule', 'payment_keys');
    }

    public function test_the_kes_1_test_prompt_keeps_asking_for_the_password_because_it_is_not_at_the_door(): void
    {
        $this->mode('enforce');
        $this->mock(DarajaService::class, function ($m) {
            $m->shouldReceive('normalizePhone')->andReturn('254712345678');
            $m->shouldReceive('stkPush')->once()->andReturn(['ResponseCode' => '0']);
        });
        $this->as()->postJson('/api/admin/payments/settings/mpesa/test-prompt', ['phone' => '0712345678'])->assertStatus(422)->assertJsonValidationErrors('password');
        $this->as()->postJson('/api/admin/payments/settings/mpesa/test-prompt', ['phone' => '0712345678', 'password' => 'wrong'])->assertStatus(422);
        $this->assertSame(1, PaymentSettingLog::where('event', 'password_failed')->count());
        $this->as()->postJson('/api/admin/payments/settings/mpesa/test-prompt', ['phone' => '0712345678', 'password' => 'Right-password-1'])->assertOk();
    }

    public function test_the_emergency_switch_brings_the_password_back(): void
    {
        $this->mode('enforce');
        config(['security.policy.kill_switch' => true]);
        $this->assertTrue($this->as()->getJson('/api/admin/payments/settings')->json('confirm_with_password'));
        $this->as()->putJson('/api/admin/payments/settings/mpesa', $this->keys())->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_the_routes_that_skip_the_password_all_carry_the_rule(): void
    {
        // the controller drops its own password check only where the door has already asked: every route that reaches it that way must carry the rule
        $source = file_get_contents(app_path('Http/Controllers/Api/PaymentSettingsController.php'));
        preg_match_all('/\$this->confirm\(\$request(, false)?\)/', $source, $m);
        $skipping = count(array_filter($m[1], fn ($x) => $x === ''));
        $doors = collect(\Illuminate\Support\Facades\Route::getRoutes()->getRoutes())->filter(fn ($r) => str_starts_with($r->uri(), 'api/admin/payments/settings') && in_array('assurance:payment_keys', (array) $r->middleware(), true));
        $this->assertSame($skipping, $doors->count());
    }
}
