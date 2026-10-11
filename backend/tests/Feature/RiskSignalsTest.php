<?php

namespace Tests\Feature;

use App\Models\Security\AuthSession;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\RiskSignals;
use App\Services\Security\SecuritySettings;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/** "Does this sign-in look like the person?": the signals, read against that person's own last 90 days. */
class RiskSignalsTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    private const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
    private const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        config(['app.timezone' => 'Africa/Nairobi']);
    }

    private function person(): User
    {
        static $n = 0;

        return User::forceCreate(['name' => 'Amina', 'email' => 'amina'.(++$n).'@example.com', 'password' => Hash::make('x'), 'role' => 'customer']);
    }

    private function seen(User $u, string $ua = self::CHROME_WIN, string $ip = '41.80.1.10', ?Carbon $at = null): AuthSession
    {
        static $t = 0;
        $d = \App\Services\Security\DeviceInfo::describe($ua);
        $row = AuthSession::create(['token_id' => 1000 + (++$t), 'tokenable_type' => $u->getMorphClass(), 'tokenable_id' => $u->id, 'method' => 'password', 'ip' => $ip, 'user_agent' => $ua, 'device_key' => $d['key'], 'label' => $d['label']]);
        $row->forceFill(['created_at' => $at ?? now()->subDays(3)])->save();

        return $row;
    }

    private function request(string $ua = self::CHROME_WIN, string $ip = '41.80.1.99', array $headers = []): Request
    {
        $r = Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => $ua, 'REMOTE_ADDR' => $ip]);
        foreach ($headers as $k => $v) {
            $r->headers->set($k, $v);
        }

        return $r;
    }

    private function assess(User $u, ?Request $r = null, ?int $except = null): array
    {
        return app(RiskSignals::class)->assess($u, $r ?? $this->request(), $except);
    }

    private function failures(string $email, int $n, ?Carbon $at = null): void
    {
        for ($i = 0; $i < $n; $i++) {
            SecurityEvent::create(['subject_type' => null, 'subject_id' => null, 'event' => 'sign_in_failed', 'severity' => 'notice', 'email_tried' => $email, 'ip' => '1.1.1.1', 'created_at' => $at ?? now()->subMinutes(10)]);
        }
    }

    // ------------------------------------------------------------ the first time, and the usual

    public function test_a_first_sign_in_has_nothing_to_be_compared_with(): void
    {
        $this->assertSame(['signals' => [], 'score' => 0, 'action' => 'allow'], $this->assess($this->person()));
    }

    public function test_the_usual_browser_and_network_show_nothing(): void
    {
        $u = $this->person();
        $this->seen($u);
        $this->assertSame(['signals' => [], 'score' => 0, 'action' => 'allow'], $this->assess($u));
    }

    // ------------------------------------------------------------ device and network

    public function test_a_kind_of_browser_not_seen_lately_is_a_signal(): void
    {
        $u = $this->person();
        $this->seen($u);
        $r = $this->assess($u, $this->request(self::SAFARI_IPHONE));
        $this->assertSame(['new_device'], $r['signals']);
        $this->assertSame(1, $r['score']);
        $this->assertSame('notice', $r['action']);
    }

    public function test_a_network_not_seen_lately_is_a_signal_but_the_same_neighbourhood_is_not(): void
    {
        $u = $this->person();
        $this->seen($u, self::CHROME_WIN, '41.80.1.10');
        $this->assertSame([], $this->assess($u, $this->request(self::CHROME_WIN, '41.80.1.200'))['signals']);       // same three numbers
        $this->assertSame(['new_network'], $this->assess($u, $this->request(self::CHROME_WIN, '102.5.7.9'))['signals']);
        $this->assertSame(['new_network'], $this->assess($u, $this->request(self::CHROME_WIN, '41.80.2.10'))['signals']);
    }

    public function test_a_phone_on_a_new_network_is_both(): void
    {
        $u = $this->person();
        $this->seen($u);
        $r = $this->assess($u, $this->request(self::SAFARI_IPHONE, '102.5.7.9'));
        $this->assertSame(['new_device', 'new_network'], $r['signals']);
        $this->assertSame(2, $r['score']);
        $this->assertSame('stronger', $r['action']);
    }

    public function test_the_neighbourhood_of_an_address(): void
    {
        $this->assertSame('41.80.1', RiskSignals::neighbourhood('41.80.1.10'));
        $this->assertSame('2001:0db8:85a3:0000', RiskSignals::neighbourhood('2001:0db8:85a3:0000:0000:8a2e:0370:7334'));
        $this->assertSame('', RiskSignals::neighbourhood(null));
    }

    public function test_only_the_last_ninety_days_count_and_the_sign_in_just_made_does_not(): void
    {
        $u = $this->person();
        $this->seen($u, self::SAFARI_IPHONE, '102.5.7.9', now()->subDays(100));                  // too old
        $this->seen($u);
        $this->assertSame(['new_device', 'new_network'], $this->assess($u, $this->request(self::SAFARI_IPHONE, '102.5.7.9'))['signals']);
        $mine = $this->seen($u, self::SAFARI_IPHONE, '102.5.7.9', now());
        $this->assertSame(['new_device', 'new_network'], $this->assess($u, $this->request(self::SAFARI_IPHONE, '102.5.7.9'), $mine->token_id)['signals']);   // not compared with itself
        $this->assertSame([], $this->assess($u, $this->request(self::SAFARI_IPHONE, '102.5.7.9'))['signals']);   // but once it is history, it is usual
    }

    public function test_someone_elses_history_is_not_ours(): void
    {
        $a = $this->person();
        $b = $this->person();
        $this->seen($a, self::SAFARI_IPHONE, '102.5.7.9');
        $this->seen($b);
        $this->assertSame(['new_device', 'new_network'], $this->assess($b, $this->request(self::SAFARI_IPHONE, '102.5.7.9'))['signals']);
    }

    // ------------------------------------------------------------ the hour

    public function test_an_hour_the_person_almost_never_signs_in_at_is_a_signal(): void
    {
        $u = $this->person();
        for ($i = 0; $i < 12; $i++) {
            $this->seen($u, self::CHROME_WIN, '41.80.1.10', Carbon::parse('2026-09-0'.(1 + $i % 9).' 09:'.str_pad((string) ($i * 4), 2, '0', STR_PAD_LEFT), 'Africa/Nairobi'));
        }
        Carbon::setTestNow(Carbon::parse('2026-10-01 03:30', 'Africa/Nairobi'));
        $this->assertSame(['odd_hour'], $this->assess($u)['signals']);
        Carbon::setTestNow(Carbon::parse('2026-10-01 10:30', 'Africa/Nairobi'));
        $this->assertSame([], $this->assess($u)['signals']);                                      // an hour from the usual
        Carbon::setTestNow(Carbon::parse('2026-10-01 11:05', 'Africa/Nairobi'));
        $this->assertSame([], $this->assess($u)['signals']);                                      // two hours off is still near
        Carbon::setTestNow(Carbon::parse('2026-10-01 12:30', 'Africa/Nairobi'));
        $this->assertSame(['odd_hour'], $this->assess($u)['signals']);                            // three hours off is not
        Carbon::setTestNow();
    }

    public function test_an_hour_that_is_only_a_little_unusual_is_not_a_signal(): void
    {
        $u = $this->person();
        for ($i = 0; $i < 20; $i++) {                                                             // 14 in the morning, 6 in the evening
            $this->seen($u, self::CHROME_WIN, '41.80.1.10', Carbon::parse('2026-09-0'.(1 + $i % 9).' '.($i < 14 ? '09' : '19').':'.str_pad((string) ($i * 2), 2, '0', STR_PAD_LEFT), 'Africa/Nairobi'));
        }
        Carbon::setTestNow(Carbon::parse('2026-10-01 19:20', 'Africa/Nairobi'));
        $this->assertSame([], $this->assess($u)['signals']);                                      // 30% of their sign-ins are around this hour: ordinary enough
        Carbon::setTestNow(Carbon::parse('2026-10-01 03:20', 'Africa/Nairobi'));
        $this->assertSame(['odd_hour'], $this->assess($u)['signals']);
        Carbon::setTestNow();
    }

    public function test_the_hour_wraps_around_midnight(): void
    {
        $u = $this->person();
        for ($i = 0; $i < 12; $i++) {
            $this->seen($u, self::CHROME_WIN, '41.80.1.10', Carbon::parse('2026-09-0'.(1 + $i % 9).' 23:'.str_pad((string) ($i * 4), 2, '0', STR_PAD_LEFT), 'Africa/Nairobi'));
        }
        Carbon::setTestNow(Carbon::parse('2026-10-01 01:10', 'Africa/Nairobi'));
        $this->assertSame([], $this->assess($u)['signals']);                                      // just past midnight: near 23:00
        Carbon::setTestNow(Carbon::parse('2026-10-01 12:00', 'Africa/Nairobi'));
        $this->assertSame(['odd_hour'], $this->assess($u)['signals']);
        Carbon::setTestNow();
    }

    public function test_with_too_little_history_the_hour_says_nothing(): void
    {
        $u = $this->person();
        for ($i = 0; $i < 9; $i++) {
            $this->seen($u, self::CHROME_WIN, '41.80.1.10', Carbon::parse('2026-09-0'.(1 + $i).' 09:00', 'Africa/Nairobi'));
        }
        Carbon::setTestNow(Carbon::parse('2026-10-01 03:30', 'Africa/Nairobi'));
        $this->assertSame([], $this->assess($u)['signals']);
        Carbon::setTestNow();
    }

    // ------------------------------------------------------------ the country

    public function test_a_country_not_seen_lately_is_a_signal_when_the_host_says_it(): void
    {
        $u = $this->person();
        $this->seen($u);
        SecurityEvent::create(['subject_type' => 'user', 'subject_id' => $u->id, 'event' => 'sign_in', 'severity' => 'info', 'detail' => ['country' => 'KE'], 'created_at' => now()->subDay()]);
        $this->assertSame(['new_country'], $this->assess($u, $this->request(self::CHROME_WIN, '41.80.1.99', ['CF-IPCountry' => 'RU']))['signals']);
        $this->assertSame([], $this->assess($u, $this->request(self::CHROME_WIN, '41.80.1.99', ['CF-IPCountry' => 'ke']))['signals']);
        $this->assertSame(['new_country'], $this->assess($u, $this->request(self::CHROME_WIN, '41.80.1.99', ['X-Country' => 'DE']))['signals']);
        $this->assertSame([], $this->assess($u)['signals']);                                      // the host did not say
        foreach (['XX', 'T1', 'K', 'KEN', ''] as $odd) {
            $this->assertSame([], $this->assess($u, $this->request(self::CHROME_WIN, '41.80.1.99', ['CF-IPCountry' => $odd]))['signals'], $odd);
        }
    }

    public function test_with_no_country_on_record_a_country_is_not_a_signal(): void
    {
        $u = $this->person();
        $this->seen($u);
        $this->assertSame([], $this->assess($u, $this->request(self::CHROME_WIN, '41.80.1.99', ['CF-IPCountry' => 'RU']))['signals']);
    }

    public function test_countries_older_than_ninety_days_or_of_someone_else_do_not_count(): void
    {
        $u = $this->person();
        $other = $this->person();
        $this->seen($u);
        SecurityEvent::create(['subject_type' => 'user', 'subject_id' => $u->id, 'event' => 'sign_in', 'severity' => 'info', 'detail' => ['country' => 'KE'], 'created_at' => now()->subDay()]);
        SecurityEvent::create(['subject_type' => 'user', 'subject_id' => $u->id, 'event' => 'sign_in', 'severity' => 'info', 'detail' => ['country' => 'RU'], 'created_at' => now()->subDays(120)]);
        SecurityEvent::create(['subject_type' => 'user', 'subject_id' => $other->id, 'event' => 'sign_in', 'severity' => 'info', 'detail' => ['country' => 'DE'], 'created_at' => now()->subDay()]);
        $this->assertSame(['new_country'], $this->assess($u, $this->request(self::CHROME_WIN, '41.80.1.99', ['CF-IPCountry' => 'RU']))['signals']);
        $this->assertSame(['new_country'], $this->assess($u, $this->request(self::CHROME_WIN, '41.80.1.99', ['CF-IPCountry' => 'DE']))['signals']);
    }

    // ------------------------------------------------------------ wrong passwords just before

    public function test_three_wrong_passwords_in_the_last_hour_are_a_signal(): void
    {
        $u = $this->person();
        $this->failures($u->email, 2);
        $this->assertSame([], $this->assess($u)['signals']);
        $this->failures($u->email, 1);
        $r = $this->assess($u);
        $this->assertSame(['many_failures'], $r['signals']);
        $this->assertSame(2, $r['score']);
        $this->assertSame('stronger', $r['action']);
    }

    public function test_old_failures_and_other_peoples_do_not_count(): void
    {
        $u = $this->person();
        $this->failures($u->email, 5, now()->subHours(2));
        $this->failures('someone.else@example.com', 5);
        $this->assertSame([], $this->assess($u)['signals']);
        $this->failures(strtoupper($u->email), 3);                                                // typed in capitals is still them
        $this->assertSame([], $this->assess($u)['signals']);                                      // (the log keeps what was typed, lower-cased)
    }

    public function test_failures_count_even_on_a_first_sign_in(): void
    {
        $u = $this->person();
        $this->failures($u->email, 4);
        $this->assertSame(['many_failures'], $this->assess($u)['signals']);
    }

    // ------------------------------------------------------------ what is done about it

    public function test_the_thresholds_can_be_changed(): void
    {
        $u = $this->person();
        $this->seen($u);
        $r = $this->request(self::SAFARI_IPHONE);
        $this->assertSame('notice', $this->assess($u, $r)['action']);
        config(['security.risk.notice_at' => 2, 'security.risk.stronger_at' => 3]);
        $this->assertSame('allow', $this->assess($u, $r)['action']);
        config(['security.risk.notice_at' => 1, 'security.risk.stronger_at' => 1]);
        $this->assertSame('stronger', $this->assess($u, $r)['action']);
    }

    public function test_every_signal_has_a_weight_and_words(): void
    {
        foreach (RiskSignals::WEIGHTS as $signal => $weight) {
            $this->assertGreaterThan(0, $weight);
            $this->assertNotSame($signal, RiskSignals::words($signal));
        }
    }

    // ------------------------------------------------------------ the switch

    public function test_it_is_off_unless_the_owner_chooses(): void
    {
        $this->assertSame('off', app(RiskSignals::class)->mode());
        foreach (['log', 'enforce'] as $mode) {
            config(['security.policy.risk.mode' => $mode]);
            SecuritySettings::forget();
            $this->assertSame($mode, app(RiskSignals::class)->mode());
        }
        config(['security.policy.risk.mode' => 'banana']);
        SecuritySettings::forget();
        $this->assertSame('off', app(RiskSignals::class)->mode());
        config(['security.policy.risk.mode' => 'enforce', 'security.policy.kill_switch' => true]);
        SecuritySettings::forget();
        $this->assertSame('off', app(RiskSignals::class)->mode());
    }
}
