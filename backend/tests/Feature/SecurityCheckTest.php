<?php

namespace Tests\Feature;

use App\Models\Security\AuthSession;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\SecurityCheck;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** "Is this server set up safely?" and the accounts still on a password everybody knows. */
class SecurityCheckTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        $this->goodServer();
    }

    protected function tearDown(): void
    {
        putenv('TRUSTED_PROXIES');
        parent::tearDown();
    }

    /** Settings of a well-run live server. */
    private function goodServer(): void
    {
        config(['security.cookie.enabled' => true, 'security.cookie.secure' => null, 'app.env' => 'production', 'app.debug' => false, 'app.url' => 'https://api.targetisl.co.ke', 'app.frontend_url' => 'https://targetisl.co.ke', 'cors.allowed_origins' => ['https://example.co.ke'],
            'session.secure' => true, 'cache.default' => 'file', 'queue.default' => 'database', 'mail.default' => 'smtp', 'security.headers.enabled' => true, 'security.password.min_length' => 10]);
        putenv('TRUSTED_PROXIES=*');
        Schema::create('permissions', function ($t) { $t->id(); $t->string('key')->unique(); });
        DB::table('permissions')->insert([['key' => 'security.view'], ['key' => 'security.manage']]);
    }

    /** @return array<string, array{status: string, label: string, advice: ?string}> keyed by the first words of the label */
    private function results(bool $passwords = false): array
    {
        $out = [];
        foreach (app(SecurityCheck::class)->run($passwords) as $r) {
            $out[$r['label']] = $r;
        }

        return $out;
    }

    private function lineStatus(string $labelStart, bool $passwords = false): string
    {
        foreach ($this->results($passwords) as $label => $r) {
            if (str_starts_with($label, $labelStart)) {
                return $r['status'];
            }
        }
        $this->fail("No line starting \"{$labelStart}\"");
    }

    private function person(string $email, string $password): User
    {
        return User::forceCreate(['name' => 'Someone', 'email' => $email, 'password' => Hash::make($password), 'role' => 'customer']);
    }

    // ------------------------------------------------------------ the settings

    public function test_a_well_run_server_has_nothing_to_fix(): void
    {
        $bad = array_filter($this->results(), fn ($r) => in_array($r['status'], ['warn', 'fail'], true));
        $this->assertSame([], array_keys($bad));
    }

    public function test_debug_pages_on_a_live_server_are_a_failure_and_elsewhere_a_warning(): void
    {
        config(['app.debug' => true]);
        $this->assertSame('fail', $this->lineStatus('Debug pages'));
        config(['app.env' => 'local']);
        $this->assertSame('warn', $this->lineStatus('Debug pages'));
    }

    public function test_not_running_as_production_is_a_warning(): void
    {
        config(['app.env' => 'staging']);
        $this->assertSame('warn', $this->lineStatus('Running as production'));
    }

    public function test_a_missing_app_key_is_a_failure(): void
    {
        config(['app.key' => '']);
        $this->assertSame('fail', $this->lineStatus('The app key'));
    }

    public function test_plain_http_addresses_warn_on_a_live_server_and_only_note_elsewhere(): void
    {
        config(['app.url' => 'http://api.example.co.ke', 'app.frontend_url' => 'http://example.co.ke']);
        $r = $this->results();
        $this->assertSame(['warn', 'warn'], [$r['APP_URL (this server) uses https']['status'], $r['FRONTEND_URL (the website) uses https']['status']]);
        config(['app.env' => 'local']);
        $this->assertSame('note', $this->lineStatus('APP_URL'));
    }

    public function test_the_website_and_the_api_must_share_a_domain_for_the_sign_in_cookie_to_be_sent(): void
    {
        $this->assertSame('ok', $this->lineStatus('The website and the API are on one domain'));
        config(['app.url' => 'https://bluearc-api.up.railway.app']);
        $line = $this->results()['The website and the API are on one domain (the sign-in cookie needs it)'];
        $this->assertSame('fail', $line['status']);
        $this->assertStringContainsString('railway.app', $line['advice']);
        $this->assertStringContainsString('api.targetisl.co.ke', $line['advice']);
        config(['app.env' => 'local']);
        $this->assertSame('note', $this->lineStatus('The website and the API are on one domain'), 'only a note while developing');
        config(['app.env' => 'production', 'security.cookie.enabled' => false]);
        $this->assertNull(collect($this->results())->first(fn ($r, $label) => str_starts_with($label, 'The website and the API')), 'not asked when the cookie is not used');
    }

    public function test_addresses_that_are_not_set_do_not_count_as_the_same_domain(): void
    {
        config(['app.url' => '', 'app.frontend_url' => '']);
        $this->assertSame('fail', $this->lineStatus('The website and the API are on one domain'));
    }

    public function test_a_subdomain_of_the_website_is_the_same_site_and_a_look_alike_is_not(): void
    {
        $same = fn (string $api, string $site) => \App\Services\Security\SecurityCheck::registrableDomain($api) === \App\Services\Security\SecurityCheck::registrableDomain($site);
        $this->assertTrue($same('api.targetisl.co.ke', 'targetisl.co.ke'));
        $this->assertTrue($same('api.targetisl.co.ke', 'www.targetisl.co.ke'));
        $this->assertFalse($same('api.targetisl.co.ke', 'otherco.co.ke'), 'co.ke is an ending, not a site');
        $this->assertFalse($same('targetisl.co.ke.evil.com', 'targetisl.co.ke'));
        $this->assertTrue($same('localhost', 'localhost'));
        $this->assertFalse($same('localhost', '127.0.0.1'));
        $this->assertFalse($same('127.0.0.1', '10.0.0.1'), 'two numeric addresses sharing their last numbers are not one site');
        $this->assertTrue($same('127.0.0.1', '127.0.0.1'));
        $this->assertSame('example.com', \App\Services\Security\SecurityCheck::registrableDomain('A.B.Example.com.'));
        $this->assertSame('', \App\Services\Security\SecurityCheck::registrableDomain(''));
    }

    public function test_the_cookie_over_plain_http_is_a_warning_on_a_live_server(): void
    {
        config(['app.url' => 'http://api.targetisl.co.ke']);
        $this->assertSame('warn', $this->lineStatus('The sign-in cookie is marked Secure'));
        config(['security.cookie.secure' => true]);
        $this->assertSame('ok', $this->lineStatus('The sign-in cookie is marked Secure'));
    }

    public function test_localhost_in_the_allowed_websites_is_caught_and_named(): void
    {
        config(['cors.allowed_origins' => ['https://example.co.ke', 'http://localhost:5173', 'http://127.0.0.1:3000']]);
        $this->assertSame('warn', $this->lineStatus('Only real websites'));
        $advice = $this->results()['Only real websites may call the API (CORS)']['advice'];
        $this->assertStringContainsString('http://localhost:5173', $advice);
        $this->assertStringContainsString('http://127.0.0.1:3000', $advice);
        $this->assertStringNotContainsString('https://example.co.ke', $advice);
        config(['app.env' => 'local']);
        $this->assertSame('note', $this->lineStatus('Only real websites'));
    }

    public function test_cookies_that_may_travel_over_plain_http_warn_on_a_live_server(): void
    {
        config(['session.secure' => null]);
        $this->assertSame('warn', $this->lineStatus('Cookies are sent'));
    }

    public function test_the_trusted_proxy_line_is_a_note_until_it_is_set(): void
    {
        $this->assertSame('ok', $this->lineStatus('The real visitor address'));
        putenv('TRUSTED_PROXIES');
        $this->assertSame('note', $this->lineStatus('The real visitor address'));
    }

    public function test_a_cache_that_forgets_at_once_is_a_failure_because_the_waits_and_limits_need_to_remember(): void
    {
        config(['cache.default' => 'array']);
        $this->assertSame('fail', $this->lineStatus('The cache remembers'));
        config(['cache.stores.nothing' => ['driver' => 'null'], 'cache.default' => 'nothing']);
        $this->assertSame('fail', $this->lineStatus('The cache remembers'), 'a cache that keeps nothing is no better');
        config(['cache.default' => 'file']);
        $this->assertSame('ok', $this->lineStatus('The cache remembers'));
    }

    public function test_sending_mail_while_the_person_waits_or_writing_it_to_a_file_is_a_warning(): void
    {
        config(['queue.default' => 'sync']);
        $this->assertSame('warn', $this->lineStatus('Emails are sent in the background'));
        foreach (['log', 'array'] as $mailer) {
            config(['mail.default' => $mailer]);
            $this->assertSame('warn', $this->lineStatus('Email really goes out'), $mailer);
        }
        config(['mail.default' => 'smtp']);
        $this->assertSame('ok', $this->lineStatus('Email really goes out'));
    }

    public function test_missing_security_tables_are_a_failure_that_names_them_and_the_script(): void
    {
        Schema::drop('security_events');
        $line = $this->results()['The security tables exist'];
        $this->assertSame('fail', $line['status']);
        $this->assertStringContainsString('security_events', $line['advice']);
        $this->assertStringContainsString('123_security_core.sql', $line['advice']);
        $this->assertStringContainsString('124_passkeys.sql', $line['advice']);
    }

    public function test_missing_passkey_tables_or_columns_are_a_failure_too(): void
    {
        \Illuminate\Support\Facades\Schema::drop('auth_credentials');
        $this->assertStringContainsString('auth_credentials', $this->results()['The security tables exist']['advice']);
        \Illuminate\Support\Facades\Schema::create('auth_credentials', fn ($t) => $t->id());
        \Illuminate\Support\Facades\Schema::table('auth_sessions', fn ($t) => $t->dropColumn('strength'));
        $line = $this->results()['The security tables exist'];
        $this->assertSame('fail', $line['status']);
        $this->assertStringContainsString('auth_sessions.strength', $line['advice']);
    }

    public function test_passkeys_must_be_made_for_the_websites_own_domain(): void
    {
        $this->assertSame('ok', $this->lineStatus('Passkeys are made for'));
        config(['security.passkeys.rp_id' => 'localhost']);
        $this->assertSame('fail', $this->lineStatus('Passkeys are made for'));
        config(['security.passkeys.rp_id' => 'otherco.co.ke']);
        $line = collect($this->results())->first(fn ($r, $label) => str_starts_with($label, 'Passkeys are made for'));
        $this->assertSame('fail', $line['status']);
        $this->assertStringContainsString('BEFORE anyone adds a passkey', $line['advice']);
        config(['security.passkeys.rp_id' => 'co.ke']);
        $this->assertSame('fail', $this->lineStatus('Passkeys are made for'), 'a domain that is only the ending of the website address is not the website');
        config(['app.env' => 'local', 'security.passkeys.rp_id' => 'localhost', 'app.frontend_url' => 'http://localhost:5177']);
        $this->assertSame('note', $this->lineStatus('Passkeys are made for'), 'while developing');
        config(['security.passkeys.rp_id' => 'targetisl.co.ke', 'app.frontend_url' => 'https://www.targetisl.co.ke', 'app.env' => 'production']);
        $this->assertSame('ok', $this->lineStatus('Passkeys are made for'), 'the website may sit on a subdomain of the domain');
        config(['security.passkeys.rp_id' => 'shop.targetisl.co.ke']);
        $this->assertSame('fail', $this->lineStatus('Passkeys are made for'), 'a name under the domain that is not the website is not it');
        config(['security.passkeys.rp_id' => 'www.targetisl.co.ke']);
        $this->assertSame('ok', $this->lineStatus('Passkeys are made for'), 'the website\'s own full name works too');
    }

    public function test_passkey_origins_that_are_not_https_are_pointed_out(): void
    {
        $this->assertSame('ok', $this->lineStatus('Passkey origins'));
        $this->assertNull(collect($this->results())->first(fn ($r, $label) => str_starts_with($label, 'Passkey origins'))['advice']);
        config(['security.passkeys.origins' => ['https://targetisl.co.ke', 'http://targetisl.co.ke']]);
        $line = collect($this->results())->first(fn ($r, $label) => str_starts_with($label, 'Passkey origins'));
        $this->assertSame('warn', $line['status']);
        $this->assertStringContainsString('http://targetisl.co.ke', $line['advice']);
        config(['security.passkeys.origins' => ['http://targetisl.co.ke']]);
        $line = collect($this->results())->first(fn ($r, $label) => str_starts_with($label, 'Passkey origins'));
        $this->assertStringContainsString('nobody could', $line['advice']);
        config(['security.passkeys.origins' => []]);
        $this->assertSame('warn', $this->lineStatus('Passkey origins'));
    }

    public function test_the_permission_not_yet_installed_is_a_warning_that_says_how(): void
    {
        DB::table('permissions')->delete();
        $line = $this->results()['The security permissions are installed (see the sign-in log, change the sign-in rules)'];
        $this->assertSame('warn', $line['status']);
        $this->assertStringContainsString('access:seed', $line['advice']);
        // one of the two is not enough
        DB::table('permissions')->insert(['key' => 'security.view']);
        $this->assertSame('warn', $this->results()['The security permissions are installed (see the sign-in log, change the sign-in rules)']['status']);
    }

    // ------------------------------------------------------------ the passkey rule

    public function test_the_passkey_rule_being_off_is_a_note_that_says_where_to_switch_it_on(): void
    {
        $line = collect($this->results())->first(fn ($r, $label) => $label === 'The passkey rule is off');
        $this->assertSame('note', $line['status']);
        $this->assertStringContainsString('"log" mode', $line['advice']);
    }

    public function test_log_mode_is_a_note_and_counts_the_people_still_to_do_it(): void
    {
        config(['security.policy.passkeys.mode' => 'log']);
        \App\Services\Security\SecuritySettings::forget();
        User::forceCreate(['name' => 'A', 'email' => 'a@example.com', 'password' => Hash::make('x'), 'role' => 'admin']);
        $b = User::forceCreate(['name' => 'B', 'email' => 'b@example.com', 'password' => Hash::make('x'), 'role' => 'finance']);
        User::forceCreate(['name' => 'C', 'email' => 'c@example.com', 'password' => Hash::make('x'), 'role' => 'logistics']);   // staff, but the rule is not for them
        DB::table('auth_credentials')->insert(['user_id' => $b->id, 'credential_hash' => str_repeat('a', 64), 'credential_id' => 'x', 'public_key' => 'x', 'user_handle' => 'x', 'name' => 'Phone']);
        $line = collect($this->results())->first(fn ($r, $label) => str_starts_with($label, 'The passkey rule is on'));
        $this->assertSame('note', $line['status']);
        $this->assertStringContainsString('nobody is stopped', $line['label']);
        $this->assertStringContainsString('1 of 2 people', $line['advice']);
    }

    public function test_the_rule_in_force_is_fine_and_before_its_date_a_note(): void
    {
        config(['security.policy.passkeys.mode' => 'enforce', 'security.policy.passkeys.enforce_from' => now()->subDay()->toDateString()]);
        \App\Services\Security\SecuritySettings::forget();
        $this->assertSame('ok', $this->lineStatus('The passkey rule is on'));
        config(['security.policy.passkeys.enforce_from' => now()->addDays(5)->toDateString()]);
        $line = collect($this->results())->first(fn ($r, $label) => str_starts_with($label, 'The passkey rule is on'));
        $this->assertSame('note', $line['status']);
        $this->assertStringContainsString('not yet in force', $line['label']);
    }

    public function test_the_emergency_switch_being_left_on_is_a_warning(): void
    {
        config(['security.policy.kill_switch' => true]);
        $line = collect($this->results())->first(fn ($r, $label) => str_starts_with($label, 'The passkey rule is asleep'));
        $this->assertSame('warn', $line['status']);
        $this->assertStringContainsString('SECURITY_POLICY_OFF', $line['advice']);
    }

    public function test_sensitive_actions_not_switched_on_are_a_note_and_the_count_moves_as_they_are(): void
    {
        $line = fn () => collect($this->results())->first(fn ($r, $label) => str_starts_with($label, 'Sensitive actions ask for more proof'));
        $this->assertSame('note', $line()['status']);
        $this->assertStringContainsString('0 of 10 on', $line()['label']);
        config(['security.policy.stepup.payment_keys.mode' => 'enforce', 'security.policy.stepup.access_change.mode' => 'log']);
        \App\Services\Security\SecuritySettings::forget();
        $this->assertSame('ok', $line()['status']);
        $this->assertStringContainsString('1 of 10 on, 1 in test', $line()['label']);
    }

    public function test_the_unusual_sign_in_check_is_reported_by_its_mode(): void
    {
        $line = fn () => collect($this->results())->first(fn ($r, $label) => str_starts_with($label, 'Unusual sign-ins are'));
        $this->assertSame('note', $line()['status']);
        $this->assertStringContainsString('not checked', $line()['label']);
        foreach (['log' => 'checked in test mode', 'enforce' => 'checked'] as $mode => $words) {
            config(['security.policy.risk.mode' => $mode]);
            \App\Services\Security\SecuritySettings::forget();
            $this->assertSame('ok', $line()['status']);
            $this->assertSame("Unusual sign-ins are {$words}", $line()['label']);
        }
    }

    public function test_the_step_up_table_missing_is_a_warning_that_names_the_script(): void
    {
        Schema::drop('auth_pending_actions');
        \App\Services\Security\StepUp\StepUp::forget();
        $line = collect($this->results())->first(fn ($r, $label) => str_starts_with($label, '"One more step"'));
        $this->assertSame('warn', $line['status']);
        $this->assertStringContainsString('128_step_up.sql', $line['advice']);
        $this->assertNull(collect($this->results())->first(fn ($r, $label) => str_starts_with($label, 'Sensitive actions ask')));   // and there is no point counting rules that can not ask
    }

    public function test_the_emergency_switch_hides_the_rule_counts(): void
    {
        config(['security.policy.kill_switch' => true]);
        $this->assertNull(collect($this->results())->first(fn ($r, $label) => str_starts_with($label, 'Sensitive actions ask')));
    }

    public function test_the_policy_table_is_part_of_what_must_exist(): void
    {
        Schema::drop('security_settings');
        \App\Services\Security\SecuritySettings::forget();
        $line = $this->results()['The security tables exist'];
        $this->assertSame('fail', $line['status']);
        $this->assertStringContainsString('security_settings', $line['advice']);
        $this->assertStringContainsString('125_security_policy.sql', $line['advice']);
    }

    public function test_sign_in_with_no_speed_limit_registered_is_a_failure(): void
    {
        $limiter = app(\Illuminate\Cache\RateLimiter::class);
        $prop = new \ReflectionProperty($limiter, 'limiters');
        $kept = $prop->getValue($limiter);
        $prop->setValue($limiter, []);
        try {
            $this->assertSame('fail', $this->lineStatus('Sign-in has a speed limit'));
        } finally {
            $prop->setValue($limiter, $kept);
        }
        $this->assertSame('ok', $this->lineStatus('Sign-in has a speed limit'));
    }

    public function test_a_short_password_rule_or_switched_off_headers_are_warnings(): void
    {
        config(['security.password.min_length' => 8, 'security.headers.enabled' => false]);
        $this->assertSame('warn', $this->lineStatus('Passwords must be'));
        $this->assertSame('warn', $this->lineStatus('Security headers'));
    }

    public function test_sign_ins_without_an_end_date_are_counted_in_a_note(): void
    {
        $u = $this->person('a@example.com', 'Strong-passphrase-here-1');
        app(Sessions::class)->issue($u, Request::create('/x'));
        $this->assertContains('Every sign-in has an end date', array_keys($this->results()));
        DB::table('personal_access_tokens')->update(['expires_at' => null]);
        $r = $this->results();
        $this->assertContains('1 sign-in(s) from before expiry existed', array_keys($r));
        $this->assertSame('note', $r['1 sign-in(s) from before expiry existed']['status']);
    }

    // ------------------------------------------------------------ the accounts

    public function test_accounts_on_the_passwords_the_old_imports_gave_out_are_found_and_the_others_are_not(): void
    {
        foreach (['password123', 'EmpPass123!', 'TempPass123!', 'Password123', 'password'] as $i => $pw) {
            $this->person("old{$i}@example.com", $pw);
        }
        $this->person('fine@example.com', 'purple-giraffe-lantern-77');
        $found = app(SecurityCheck::class)->accountsOnDefaultPasswords();
        $this->assertSame(['old0@example.com', 'old1@example.com', 'old2@example.com', 'old3@example.com', 'old4@example.com'], array_column($found, 'email'));
        $this->assertSame('fail', $this->lineStatus('No account still uses', true));
        $this->assertStringContainsString('security:check --fix', $this->results(true)['No account still uses a password everybody knows']['advice']);
    }

    public function test_every_account_is_looked_at_not_only_the_first_batch(): void
    {
        for ($i = 0; $i < 205; $i++) {
            $this->person("u{$i}@example.com", 'purple-giraffe-lantern-77');
        }
        $last = $this->person('last@example.com', 'EmpPass123!');
        $found = app(SecurityCheck::class)->accountsOnDefaultPasswords();
        $this->assertSame([$last->id], array_column($found, 'id'));
    }

    public function test_with_no_such_account_the_line_is_ok_and_the_slow_look_can_be_skipped(): void
    {
        $this->person('fine@example.com', 'purple-giraffe-lantern-77');
        $this->assertSame('ok', $this->lineStatus('No account still uses', true));
        $this->person('old@example.com', 'password123');
        $this->assertNull(collect($this->results(false))->first(fn ($r, $label) => str_starts_with($label, 'No account still uses')));
    }

    public function test_fixing_makes_them_choose_a_new_password_ends_their_sessions_and_leaves_everyone_else_alone(): void
    {
        $bad = $this->person('old@example.com', 'EmpPass123!');
        $good = $this->person('fine@example.com', 'purple-giraffe-lantern-77');
        app(Sessions::class)->issue($bad, Request::create('/x'));
        app(Sessions::class)->issue($good, Request::create('/x'));
        $this->assertSame(1, app(SecurityCheck::class)->fix(app(SecurityCheck::class)->accountsOnDefaultPasswords()));
        $this->assertTrue((bool) $bad->fresh()->force_password_change);
        $this->assertFalse((bool) $good->fresh()->force_password_change);
        $this->assertSame(0, $bad->tokens()->count());
        $this->assertSame(1, $good->tokens()->count());
        $this->assertSame('default_password', AuthSession::where('tokenable_id', $bad->id)->first()->revoked_reason);
        $line = SecurityEvent::where('event', 'default_password_found')->first();
        $this->assertSame(['warning', $bad->id], [$line->severity, $line->subject_id]);
    }

    // ------------------------------------------------------------ the command

    public function test_the_command_prints_each_line_and_what_to_do_and_fails_while_something_must_be_fixed(): void
    {
        config(['app.debug' => true]);
        $code = Artisan::call('security:check', ['--no-passwords' => true]);
        $out = Artisan::output();
        $this->assertSame(1, $code);
        $this->assertStringContainsString('FAIL', $out);
        $this->assertStringContainsString('Debug pages are off', $out);
        $this->assertStringContainsString('APP_DEBUG=false', $out);
        $this->assertStringNotContainsString('No account still uses', $out, 'the slow look at every account was skipped');
    }

    public function test_the_command_passes_on_a_well_run_server(): void
    {
        $this->assertSame(0, Artisan::call('security:check'));
        $this->assertStringContainsString('OK', Artisan::output());
    }

    public function test_the_command_with_fix_acts_only_when_asked(): void
    {
        $bad = $this->person('old@example.com', 'password123');
        Artisan::call('security:check');
        $this->assertFalse((bool) $bad->fresh()->force_password_change, 'looking changes nothing');
        $code = Artisan::call('security:check', ['--fix' => true]);
        $this->assertTrue((bool) $bad->fresh()->force_password_change);
        $this->assertStringContainsString('1 account(s) must now choose a new password', Artisan::output());
        $this->assertSame(1, $code, 'the account still counts until its owner has chosen a new password');
    }
}
