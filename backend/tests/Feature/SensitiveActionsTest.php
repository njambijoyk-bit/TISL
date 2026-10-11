<?php

namespace Tests\Feature;

use App\Models\Security\AuthCredential;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\SecuritySettings;
use App\Services\Security\Sessions;
use App\Services\Security\StepUp\Catalogue;
use App\Services\Security\StepUp\StepUp;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\Support\FakeAuthenticator;
use Tests\TestCase;

/** The owner's page for sensitive actions: what each rule is set to, how often it would have asked, switching it, and the safeguard that the switch is never one the owner could not get through. */
class SensitiveActionsTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Cache::flush();
        config(['security.rate_limits.passkey' => ['ip' => [[1000, 1]]], 'security.rate_limits.passkey_manage' => ['user' => [[1000, 15]]], 'security.rate_limits.step_up' => ['user' => [[1000, 15]]],
            'security.policy.kill_switch' => false, 'security.stepup.password_fallback' => true, 'security.stepup.new_passkey_hours' => 24]);
        foreach (Catalogue::keys() as $rule) {
            config(["security.policy.stepup.{$rule}.mode" => 'off']);
        }
        config(['security.policy.risk.mode' => 'off']);
        SecuritySettings::forget();
        StepUp::forget();
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

    private function person(string $role, string $name = 'Someone'): User
    {
        static $n = 0;

        return User::forceCreate(['name' => $name, 'email' => 'q'.(++$n).'@example.com', 'password' => Hash::make('Right-password-1'), 'role' => $role]);
    }

    private function openSession(User $u): string
    {
        return app(Sessions::class)->issue($u, Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', 'REMOTE_ADDR' => '41.80.1.1']), 'auth-token', 'password');
    }

    private function as(string $token): self
    {
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->defaultHeaders = [];
        $this->unencryptedCookies = [];

        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    private function save(string $token, array $body)
    {
        return $this->as($token)->putJson('/api/admin/security-policy/actions', $body);
    }

    private function page(string $token)
    {
        return $this->as($token)->getJson('/api/admin/security-policy/actions');
    }

    private function rule(array $payload, string $key): array
    {
        return collect($payload['rules'])->firstWhere('key', $key);
    }

    private function event(string $event, array $detail, ?int $daysAgo = null): void
    {
        SecurityEvent::create(['subject_type' => 'user', 'subject_id' => 1, 'event' => $event, 'severity' => 'info', 'detail' => $detail, 'created_at' => now()->subDays($daysAgo ?? 0)->subMinute()]);
    }

    /** A passkey on the person's account, added `$hoursAgo` hours ago. */
    private function passkey(User $u, int $hoursAgo): AuthCredential
    {
        static $n = 0;
        $c = AuthCredential::forceCreate(['user_id' => $u->id, 'credential_hash' => hash('sha256', 'c'.(++$n)), 'credential_id' => 'c'.$n, 'public_key' => 'k', 'user_handle' => 'h', 'name' => 'Key '.$n, 'counter' => 0]);
        AuthCredential::where('id', $c->id)->update(['created_at' => now()->subHours($hoursAgo)]);

        return $c->refresh();
    }

    // ------------------------------------------------------------ who may see and change it

    public function test_an_admin_can_see_the_page_but_not_change_it(): void
    {
        $token = $this->openSession($this->person('admin'));
        $this->page($token)->assertOk()->assertJsonPath('ready', true);
        $this->save($token, ['rules' => ['payment_keys' => 'log']])->assertStatus(403);
        $this->assertSame(0, DB::table('security_settings')->count());
    }

    public function test_someone_without_security_access_sees_nothing(): void
    {
        $token = $this->openSession($this->person('sales_rep'));
        $this->page($token)->assertStatus(403);
        $this->save($token, ['risk_mode' => 'log'])->assertStatus(403);
    }

    public function test_the_routes_are_guarded_by_their_permissions_and_the_permission_comes_first(): void
    {
        $routes = collect(Route::getRoutes()->getRoutes())->filter(fn ($r) => $r->uri() === 'api/admin/security-policy/actions');
        $this->assertCount(2, $routes);
        foreach ($routes as $r) {
            $m = array_values(array_filter((array) $r->middleware(), 'is_string'));
            $permission = in_array('GET', $r->methods()) ? 'permission:security.view' : 'permission:security.manage';
            $this->assertContains($permission, $m);
            if (in_array('PUT', $r->methods())) {
                $this->assertContains('assurance:security_settings', $m);                       // changing the rules is itself a sensitive action
                $this->assertLessThan(array_search('assurance:security_settings', $m), array_search($permission, $m));
            }
        }
    }

    // ------------------------------------------------------------ what the page shows

    public function test_every_rule_in_the_catalogue_is_listed_with_how_it_is_set(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        $p = $this->page($token)->assertOk()->json();
        $this->assertSame(Catalogue::keys(), array_column($p['rules'], 'key'));
        $row = $this->rule($p, 'payroll_run');
        $this->assertSame('Run or pay payroll', $row['label']);
        $this->assertSame('critical', $row['class']);
        $this->assertSame(2, $row['strength']);
        $this->assertTrue($row['reason']);
        $this->assertTrue($row['two']);
        $this->assertFalse($row['window']);
        $this->assertSame('off', $row['mode']);
        $this->assertSame('off', $row['in_force']);
        $window = $this->rule($p, 'export_bulk');
        $this->assertTrue($window['window']);
        $this->assertSame(15, $window['fresh']);
        $this->assertSame('off', $p['risk']['mode']);
        $this->assertSame(1, $p['risk']['notice_at']);
        $this->assertSame(2, $p['risk']['stronger_at']);
        $this->assertSame(['new_device', 'new_network', 'odd_hour', 'new_country', 'many_failures'], array_column($p['risk']['signals'], 'key'));
        $this->assertSame(2, collect($p['risk']['signals'])->firstWhere('key', 'new_country')['weight']);
    }

    public function test_it_says_what_the_owner_chose_and_what_is_really_in_force(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        config(['security.policy.stepup.payment_keys.mode' => 'enforce', 'security.policy.stepup.payroll_run.mode' => 'log', 'security.policy.risk.mode' => 'log']);
        SecuritySettings::forget();
        $p = $this->page($token)->json();
        $this->assertSame('enforce', $this->rule($p, 'payment_keys')['mode']);
        $this->assertSame('enforce', $this->rule($p, 'payment_keys')['in_force']);
        $this->assertSame('log', $this->rule($p, 'payroll_run')['mode']);
        $this->assertSame('log', $p['risk']['mode']);
        $this->assertSame('log', $p['risk']['in_force']);

        config(['security.policy.kill_switch' => true]);                                         // the emergency switch puts every one to sleep, whatever the page says
        $p = $this->page($token)->json();
        $this->assertTrue($p['kill_switch']);
        $this->assertSame('enforce', $this->rule($p, 'payment_keys')['mode']);
        $this->assertSame('off', $this->rule($p, 'payment_keys')['in_force']);
        $this->assertSame('log', $p['risk']['mode']);
        $this->assertSame('off', $p['risk']['in_force']);
    }

    public function test_a_setting_that_is_not_a_mode_reads_as_off(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        config(['security.policy.stepup.payroll_run.mode' => 'banana', 'security.policy.risk.mode' => 'banana']);
        SecuritySettings::forget();
        $p = $this->page($token)->json();
        $this->assertSame('off', $this->rule($p, 'payroll_run')['mode']);
        $this->assertSame('off', $p['risk']['mode']);
    }

    public function test_a_screen_choice_beats_the_server_setting(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        config(['security.policy.stepup.payment_keys.mode' => 'enforce']);
        $this->save($token, ['rules' => ['payment_keys' => 'off']])->assertOk();
        $this->assertSame('off', $this->rule($this->page($token)->json(), 'payment_keys')['mode']);
    }

    public function test_the_counts_are_the_last_seven_days_per_rule(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        $this->event('stepup_would_ask', ['rule' => 'payroll_run']);
        $this->event('stepup_would_ask', ['rule' => 'payroll_run']);
        $this->event('stepup_would_ask', ['rule' => 'payroll_run'], 8);                          // too long ago
        $this->event('stepup_would_ask', ['rule' => 'export_bulk']);
        $this->event('stepup_asked', ['rule' => 'payment_keys']);
        $this->event('stepup_asked', ['rule' => 'payment_keys']);
        $this->event('stepup_approved', ['rule' => 'payment_keys']);
        $this->event('stepup_failed', ['rule' => 'payment_keys', 'why' => 'wrong_password']);
        $this->event('stepup_asked', ['rule' => 'no_such_rule']);                                // not a rule we know: not counted anywhere
        $this->event('stepup_cancelled', ['rule' => 'payment_keys']);                            // not one of the four
        $this->event('sign_in', []);

        $p = $this->page($token)->json();
        $this->assertSame(['asked' => 0, 'approved' => 0, 'failed' => 0, 'would_ask' => 2], $this->rule($p, 'payroll_run')['stats']);
        $this->assertSame(['asked' => 0, 'approved' => 0, 'failed' => 0, 'would_ask' => 1], $this->rule($p, 'export_bulk')['stats']);
        $this->assertSame(['asked' => 2, 'approved' => 1, 'failed' => 1, 'would_ask' => 0], $this->rule($p, 'payment_keys')['stats']);
        $this->assertSame(['asked' => 0, 'approved' => 0, 'failed' => 0, 'would_ask' => 0], $this->rule($p, 'backup_restore')['stats']);
        $this->assertSame(7, $p['days']);
    }

    public function test_the_sign_in_check_shows_how_often_and_why(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        $this->event('sign_in', []);
        $this->event('sign_in', []);
        $this->event('sign_in', [], 9);
        $this->event('risk_notice', ['signals' => ['odd_hour']]);
        $this->event('risk_notice', ['signals' => ['new_device']]);
        $this->event('risk_stronger', ['signals' => ['new_device', 'new_network']]);
        $this->event('risk_would_ask', ['signals' => ['new_network'], 'score' => 1, 'would' => 'tell_the_person']);
        $this->event('risk_would_ask', ['signals' => ['new_network'], 'score' => 1, 'would' => 'tell_the_person']);
        $this->event('risk_would_ask', ['signals' => ['new_country'], 'score' => 2], 10);                  // too long ago

        $s = $this->page($token)->json('risk.stats');
        $this->assertSame(3, $s['sign_ins']);                                                    // the two above, and the owner's own, today; not the one 9 days ago
        $this->assertSame(2, $s['would_ask']);
        $this->assertSame(2, $s['told']);
        $this->assertSame(1, $s['held']);
        $this->assertSame(['new_network' => 3, 'new_device' => 2, 'odd_hour' => 1], $s['by_signal']);       // the most common first
    }

    public function test_without_the_scripts_it_says_so_and_changes_nothing(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        Schema::drop('auth_pending_actions');
        StepUp::forget();
        $this->page($token)->assertOk()->assertJsonPath('ready', false)->assertJsonPath('rules.0.stats.asked', 0);
        $this->save($token, ['rules' => ['payment_keys' => 'log']])->assertStatus(409);
        $this->assertSame(0, DB::table('security_settings')->count());
    }

    // ------------------------------------------------------------ changing it

    public function test_the_owner_can_switch_rules_and_the_sign_in_check_and_it_is_written_down(): void
    {
        $owner = $this->person('super_admin');
        $token = $this->openSession($owner);
        $r = $this->save($token, ['rules' => ['payroll_run' => 'log', 'export_bulk' => 'enforce'], 'risk_mode' => 'log'])->assertOk();
        $r->assertJsonPath('message', 'Saved.');
        $this->assertSame('log', $this->rule($r->json(), 'payroll_run')['mode']);
        $this->assertSame('enforce', $this->rule($r->json(), 'export_bulk')['mode']);
        $this->assertSame('off', $this->rule($r->json(), 'payment_keys')['mode']);               // the ones not mentioned are left alone
        $this->assertSame('log', $r->json('risk.mode'));
        $this->assertSame('log', app(SecuritySettings::class)->get('stepup.payroll_run.mode'));
        $this->assertSame($owner->id, DB::table('security_settings')->where('setting_key', 'stepup.payroll_run.mode')->value('updated_by_id'));

        $e = SecurityEvent::where('event', 'stepup_rules_changed')->first();
        $this->assertNotNull($e);
        $this->assertSame('warning', $e->severity);
        $this->assertSame($owner->id, $e->subject_id);
        $this->assertEquals(['stepup.payroll_run.mode' => ['from' => 'off', 'to' => 'log'], 'stepup.export_bulk.mode' => ['from' => 'off', 'to' => 'enforce'], 'risk.mode' => ['from' => 'off', 'to' => 'log']], $e->detail['changes']);
    }

    public function test_only_what_is_sent_changes(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        $this->save($token, ['rules' => ['payroll_run' => 'log'], 'risk_mode' => 'log'])->assertOk();
        $this->save($token, ['rules' => ['export_bulk' => 'log']])->assertOk()->assertJsonPath('risk.mode', 'log');
        $this->save($token, ['risk_mode' => 'off'])->assertOk();
        $p = $this->page($token)->json();
        $this->assertSame('log', $this->rule($p, 'payroll_run')['mode']);
        $this->assertSame('log', $this->rule($p, 'export_bulk')['mode']);
        $this->assertSame('off', $p['risk']['mode']);
    }

    public function test_saving_twice_updates_the_same_row_and_a_change_that_changes_nothing_leaves_no_trace(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        $this->save($token, ['rules' => ['payroll_run' => 'log']])->assertOk();
        $this->save($token, ['rules' => ['payroll_run' => 'off']])->assertOk();
        $this->assertSame(1, DB::table('security_settings')->where('setting_key', 'stepup.payroll_run.mode')->count());
        $this->assertSame('off', app(SecuritySettings::class)->get('stepup.payroll_run.mode'));
        $before = SecurityEvent::where('event', 'stepup_rules_changed')->count();
        $r = $this->save($token, ['rules' => ['payroll_run' => 'off'], 'risk_mode' => 'off'])->assertOk();
        $this->assertStringContainsString('Nothing was different', $r->json('message'));
        $this->assertSame($before, SecurityEvent::where('event', 'stepup_rules_changed')->count());
    }

    public function test_the_values_are_checked_and_nothing_is_half_saved(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        $this->save($token, ['rules' => ['payroll_run' => 'maybe']])->assertStatus(422);
        $this->save($token, ['rules' => ['no_such_rule' => 'log']])->assertStatus(422);
        $this->save($token, ['rules' => ['payroll_run' => 'log', 'no_such_rule' => 'log']])->assertStatus(422);
        $this->save($token, ['risk_mode' => 'sometimes'])->assertStatus(422);
        $this->save($token, [])->assertStatus(422);
        $this->save($token, ['rules' => 'all'])->assertStatus(422);
        $this->assertSame(0, DB::table('security_settings')->count());
        $this->assertSame(0, SecurityEvent::where('event', 'stepup_rules_changed')->count());
    }

    // ------------------------------------------------------------ the safeguard

    public function test_without_a_passkey_the_owner_can_switch_on_a_rule_they_can_answer_with_their_password(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        $this->save($token, ['rules' => ['payment_keys' => 'enforce']])->assertOk()->assertJsonPath('rules.0.mode', 'enforce');
    }

    public function test_the_owner_can_not_switch_on_a_rule_they_could_not_answer_themselves(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        config(['security.stepup.password_fallback' => false]);                                   // a passkey is the only way, and the owner has none
        $r = $this->save($token, ['rules' => ['payment_keys' => 'enforce']])->assertStatus(422);
        $r->assertJsonPath('reason', 'you_could_not_answer')->assertJsonPath('rule', 'payment_keys');
        $this->assertStringContainsString('Change the payment keys', $r->json('message'));
        $this->assertSame(0, DB::table('security_settings')->count());
        $this->assertSame(0, SecurityEvent::where('event', 'stepup_rules_changed')->count());
        // one the password may answer is fine, and so is trying it out
        $this->save($token, ['rules' => ['export_bulk' => 'enforce', 'payment_keys' => 'log']])->assertOk();
    }

    public function test_one_refused_switch_stops_the_whole_change(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        config(['security.stepup.password_fallback' => false]);
        $this->save($token, ['rules' => ['export_bulk' => 'enforce', 'payment_keys' => 'enforce'], 'risk_mode' => 'log'])->assertStatus(422);
        $this->assertSame(0, DB::table('security_settings')->count());
    }

    public function test_a_passkey_added_today_can_not_answer_a_serious_action_so_the_switch_waits_a_day(): void
    {
        $owner = $this->person('super_admin');
        $token = $this->openSession($owner);
        $this->passkey($owner, 2);
        $this->save($token, ['rules' => ['payment_keys' => 'enforce']])->assertStatus(422)->assertJsonPath('reason', 'you_could_not_answer');
        $this->save($token, ['rules' => ['bank_details' => 'enforce']])->assertOk();            // an everyday one only needs the password
        $this->assertTrue($this->rule($this->page($token)->json(), 'bank_details')['you_could_answer']);
        $this->assertFalse($this->rule($this->page($token)->json(), 'payment_keys')['you_could_answer']);
        AuthCredential::where('user_id', $owner->id)->update(['created_at' => now()->subHours(30)]);
        $this->assertTrue($this->rule($this->page($token)->json(), 'payment_keys')['you_could_answer']);
        $this->save($token, ['rules' => ['payment_keys' => 'enforce']])->assertOk();
    }

    public function test_an_old_passkey_that_has_been_switched_off_does_not_count(): void
    {
        $owner = $this->person('super_admin');
        $token = $this->openSession($owner);
        $c = $this->passkey($owner, 100);
        AuthCredential::where('id', $c->id)->update(['disabled_at' => now(), 'disabled_reason' => 'clone']);
        $this->assertTrue(app(StepUp::class)->couldAnswer($owner, 'payment_keys'));              // no usable passkey, so the password may answer (until the server stops allowing it, below)
        config(['security.stepup.password_fallback' => false]);
        $this->save($token, ['rules' => ['payment_keys' => 'enforce']])->assertStatus(422);
    }

    public function test_trying_a_rule_out_is_never_refused(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        config(['security.stepup.password_fallback' => false]);
        $this->save($token, ['rules' => ['payment_keys' => 'log', 'payroll_run' => 'log', 'access_change' => 'log']])->assertOk();
    }

    public function test_the_check_does_not_apply_to_a_rule_already_on(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        $this->save($token, ['rules' => ['payment_keys' => 'enforce']])->assertOk();
        config(['security.stepup.password_fallback' => false]);                                   // later the server stops allowing passwords: switching it OFF must still work
        $this->save($token, ['rules' => ['payment_keys' => 'off']])->assertOk()->assertJsonPath('rules.0.mode', 'off');
    }

    // ------------------------------------------------------------ changing the rules is itself a sensitive action

    public function test_with_the_security_rule_on_the_change_asks_first_and_says_what_it_would_set(): void
    {
        $owner = $this->person('super_admin', 'Olive Owner');
        $token = $this->openSession($owner);
        config(['security.policy.stepup.security_settings.mode' => 'enforce']);
        SecuritySettings::forget();
        $r = $this->save($token, ['rules' => ['payroll_run' => 'enforce', 'export_bulk' => 'log'], 'risk_mode' => 'enforce'])->assertStatus(403);
        $r->assertJsonPath('step_up.rule', 'security_settings');
        $facts = collect($r->json('step_up.facts'))->pluck('value', 'label');
        $this->assertStringContainsString('On:', $facts['Run or pay payroll']);
        $this->assertStringContainsString('Test:', $facts['Export a large list (customers, payroll, ledgers)']);
        $this->assertStringContainsString('On:', $facts['Unusual sign-in check']);
        $this->assertArrayNotHasKey('The passkey rule', $facts->all());
        $this->assertSame(0, DB::table('security_settings')->count());                           // nothing is changed until the owner has answered
    }

    public function test_the_passkey_rule_screen_still_reads_as_before(): void
    {
        $owner = $this->person('super_admin');
        config(['security.policy.stepup.security_settings.mode' => 'enforce']);
        SecuritySettings::forget();
        $token = $this->openSession($owner);
        $r = $this->as($token)->putJson('/api/admin/security-policy', ['mode' => 'log'])->assertStatus(403);
        $facts = collect($r->json('step_up.facts'))->pluck('value', 'label');
        $this->assertArrayHasKey('The passkey rule', $facts->all());
    }

    public function test_a_passkey_user_answers_the_question_and_the_change_goes_through(): void
    {
        $owner = $this->person('super_admin');
        $token = $this->openSession($owner);
        $device = new FakeAuthenticator();
        $q = $this->as($token)->postJson('/api/auth/passkeys/register/options')->assertOk();
        $this->as($token)->postJson('/api/auth/passkeys/register/verify', ['challenge_id' => $q->json('challenge_id'), 'credential' => $device->register($q->json('options')), 'name' => 'Laptop'])->assertStatus(201);
        AuthCredential::where('user_id', $owner->id)->update(['created_at' => now()->subDays(3)]);
        config(['security.policy.stepup.security_settings.mode' => 'enforce']);
        SecuritySettings::forget();

        $held = $this->save($token, ['rules' => ['payroll_run' => 'enforce'], 'confirm' => true])->assertStatus(403);
        $id = $held->json('step_up.pending');
        $o = $this->as($token)->postJson("/api/auth/step-up/{$id}/options")->assertOk();
        $this->as($token)->postJson("/api/auth/step-up/{$id}/approve", ['challenge_id' => $o->json('challenge_id'), 'credential' => $device->assert($o->json('options')), 'reason' => 'Switching payroll on'])->assertOk();
        $this->as($token)->withHeader('X-Step-Up', $id)->putJson('/api/admin/security-policy/actions', ['rules' => ['payroll_run' => 'enforce'], 'confirm' => true])->assertOk()->assertJsonPath('rules.4.mode', 'enforce');
    }
}
