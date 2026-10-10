<?php

namespace Tests\Feature;

use App\Models\Security\AuthChallenge;
use App\Models\Security\AuthCredential;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\Passkeys\Challenges;
use App\Services\Security\Passkeys\CredentialStore;
use App\Services\Security\Passkeys\PasskeyConfig;
use App\Services\Security\Passkeys\PasskeyException;
use App\Services\Security\Passkeys\Passkeys;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Tests\Support\FakeAuthenticator;
use Tests\TestCase;

/** Passkeys: our use of the vetted library. A pretend device (made with OpenSSL, writing its own bytes) plays the part of a phone or a security key, and misbehaves in every way a stranger could. */
class PasskeysTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    private Passkeys $svc;
    private Request $req;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Cache::flush();
        $this->svc = app(Passkeys::class);
        $this->req = Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', 'REMOTE_ADDR' => '41.80.1.1']);
    }

    private function person(string $email = 'amina@example.com', string $name = 'Amina Wanjiru'): User
    {
        return User::forceCreate(['name' => $name, 'email' => $email, 'password' => Hash::make('Right-password-1'), 'role' => 'customer']);
    }

    private function device(array $set = []): FakeAuthenticator
    {
        $d = new FakeAuthenticator();
        foreach ($set as $k => $v) {
            $d->$k = $v;
        }

        return $d;
    }

    /** Add a passkey the way the website does: ask, let the device answer, check and keep. */
    private function enrol(User $user, FakeAuthenticator $d, ?string $name = null, array $overrides = []): AuthCredential
    {
        $o = $this->svc->registrationOptions($user, $this->req);

        return $this->svc->register($user, $o['id'], $d->register($o['options'], $overrides), $name, $this->req);
    }

    /** Sign in with a passkey the way the website does. */
    private function signIn(FakeAuthenticator $d, array $overrides = []): array
    {
        $o = $this->svc->loginOptions($this->req);

        return $this->svc->login($o['id'], $d->assert($o['options'], $overrides), $this->req);
    }

    private function refusedAny(callable $fn): PasskeyException
    {
        try {
            $fn();
        } catch (PasskeyException $e) {
            return $e;
        }
        $this->fail('should have been refused');
    }

    private function refused(callable $fn, string $reason): PasskeyException
    {
        try {
            $fn();
        } catch (PasskeyException $e) {
            $this->assertSame($reason, $e->reason, 'refused for the wrong reason: '.$e->reason.' / '.$e->getMessage());

            return $e;
        }
        $this->fail('should have been refused ('.$reason.')');
    }

    // ------------------------------------------------------------ the question for adding one

    public function test_the_options_name_the_website_demand_the_fingerprint_and_ask_for_a_passkey_that_lives_on_the_device(): void
    {
        $u = $this->person();
        $o = $this->svc->registrationOptions($u, $this->req);
        $opts = $o['options'];
        $this->assertSame(['id' => 'targetisl.co.ke', 'name' => 'TISL'], $opts['rp']);
        $this->assertSame('required', $opts['authenticatorSelection']['userVerification']);
        $this->assertSame('required', $opts['authenticatorSelection']['residentKey']);
        $this->assertSame('none', $opts['attestation']);
        $this->assertSame([-7, -257], array_column($opts['pubKeyCredParams'], 'alg'));
        $this->assertSame(120000, $opts['timeout']);
        $this->assertSame('amina@example.com', $opts['user']['name']);
        $this->assertSame(32, strlen(FakeAuthenticator::unb64($opts['user']['id'])), 'a handle with nothing personal in it');
        $this->assertNotEmpty($opts['challenge']);
        $this->assertSame(32, strlen(FakeAuthenticator::unb64($opts['challenge'])));
        $row = AuthChallenge::find($o['id']);
        $this->assertSame(['register', $u->id, $opts['challenge']], [$row->purpose, $row->user_id, $row->challenge]);
        $this->assertEqualsWithDelta(120, now()->diffInSeconds($row->expires_at, false), 2);
    }

    public function test_every_question_is_different(): void
    {
        $u = $this->person();
        $a = $this->svc->registrationOptions($u, $this->req);
        $b = $this->svc->registrationOptions($u, $this->req);
        $this->assertNotSame($a['options']['challenge'], $b['options']['challenge']);
        $this->assertNotSame($a['id'], $b['id']);
    }

    public function test_the_same_handle_goes_with_every_passkey_of_one_person_and_a_different_one_with_another_person(): void
    {
        $a = $this->person();
        $b = $this->person('baraka@example.com', 'Baraka Otieno');
        $first = $this->svc->registrationOptions($a, $this->req)['options']['user']['id'];
        $this->enrol($a, $this->device());
        $second = $this->svc->registrationOptions($a, $this->req)['options']['user']['id'];
        $other = $this->svc->registrationOptions($b, $this->req)['options']['user']['id'];
        $stored = AuthCredential::first()->user_handle;
        $this->assertSame($stored, $second);
        $this->assertNotSame($first, $second, 'before the first passkey, a handle is made new each time');
        $this->assertNotSame($second, $other);
    }

    public function test_a_passkey_already_added_is_listed_so_the_same_device_is_not_asked_twice(): void
    {
        $u = $this->person();
        $d = $this->device();
        $c = $this->enrol($u, $d);
        $opts = $this->svc->registrationOptions($u, $this->req)['options'];
        $this->assertSame([FakeAuthenticator::b64($d->credentialId)], array_column($opts['excludeCredentials'], 'id'));
        $c->forceFill(['revoked_at' => now()])->save();
        $this->assertSame([], $this->svc->registrationOptions($u, $this->req)['options']['excludeCredentials'] ?? [], 'a removed one may be added again');
    }

    // ------------------------------------------------------------ adding one

    public function test_a_passkey_from_a_real_device_is_checked_and_kept(): void
    {
        $u = $this->person();
        $d = $this->device(['backupEligible' => true, 'backedUp' => true]);
        $c = $this->enrol($u, $d, 'Amina\'s phone');
        $this->assertSame([$u->id, "Amina's phone", 'passkey', 'first', 0], [$c->user_id, $c->name, $c->kind, $c->added_method, $c->counter]);
        $this->assertSame(CredentialStore::hash($d->credentialId), $c->credential_hash);
        $this->assertSame(FakeAuthenticator::b64($d->credentialId), $c->credential_id);
        $this->assertSame(FakeAuthenticator::b64($d->userHandle), $c->user_handle);
        $this->assertSame([true, true, true], [$c->backup_eligible, $c->backup_status, $c->uv_initialized]);
        $this->assertSame(['internal'], $c->transports);
        $this->assertSame(strtolower(bin2hex($d->aaguid)), str_replace('-', '', $c->aaguid));
        $this->assertNotEmpty($c->public_key);
        $this->assertNull($c->revoked_at);
    }

    public function test_a_passkey_with_no_name_is_called_after_the_browser_it_was_added_on(): void
    {
        $this->assertSame('Passkey on Chrome on Windows', $this->enrol($this->person(), $this->device())->name);
    }

    public function test_a_security_key_is_told_apart_from_a_phone_or_laptop(): void
    {
        $u = $this->person();
        $this->assertSame('security_key', $this->enrol($u, $this->device(['attachment' => 'cross-platform', 'transports' => ['usb', 'nfc']]))->kind);
        $this->assertSame('passkey', $this->enrol($u, $this->device(['attachment' => 'cross-platform', 'transports' => ['hybrid', 'internal']]))->kind, 'a phone used from a computer is still a phone');
        $this->assertSame('passkey', $this->enrol($u, $this->device())->kind);
    }

    public function test_what_the_device_reports_is_kept_as_it_was_and_the_name_is_cut_to_fit(): void
    {
        $u = $this->person();
        $d = $this->device(['counter' => 7]);
        $c = $this->enrol($u, $d, str_repeat('Amina ', 40));
        $this->assertSame(7, $c->counter);
        $this->assertSame(80, mb_strlen($c->name));
        $o = $this->svc->registrationOptions($u, $this->req);
        $c2 = $this->svc->register($u, $o['id'], $this->device()->register($o['options']), 'Second phone', $this->req, 'approved', $c->id);
        $this->assertSame(['approved', $c->id], [$c2->added_method, $c2->added_by_id]);
    }

    public function test_a_key_that_reports_both_usb_and_built_in_is_a_passkey_and_a_platform_key_that_reports_usb_is_too(): void
    {
        $u = $this->person();
        $this->assertSame('passkey', $this->enrol($u, $this->device(['attachment' => 'cross-platform', 'transports' => ['usb', 'internal']]))->kind);
        $this->assertSame('passkey', $this->enrol($u, $this->device(['attachment' => 'platform', 'transports' => ['usb']]))->kind);
        $this->assertSame('security_key', $this->enrol($u, $this->device(['attachment' => null, 'transports' => ['nfc']]))->kind);
    }

    public function test_even_if_a_question_did_not_demand_the_fingerprint_an_unverified_sign_in_is_not_accepted(): void
    {
        $u = $this->person();
        $d = $this->device();
        $this->enrol($u, $d);
        $options = \Webauthn\PublicKeyCredentialRequestOptions::create(random_bytes(32), PasskeyConfig::rpId(), [], \Webauthn\PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED, 120000);
        $q = app(Challenges::class)->issue(Challenges::SIGN_IN, null, $options, $this->req);
        $d->userVerified = false;
        $this->refused(fn () => $this->svc->login($q['id'], $d->assert($q['options']), $this->req), 'not_verified');
        $this->assertSame(0, AuthCredential::first()->counter);
    }

    public function test_a_device_that_signs_with_rsa_works_too(): void
    {
        $u = $this->person();
        $d = new FakeAuthenticator(alg: -257);
        $this->enrol($u, $d);
        $this->assertSame($u->id, $this->signIn($d)['user']->id);
    }

    public function test_the_website_without_www_and_with_www_are_both_ours(): void
    {
        $u = $this->person();
        $this->enrol($u, new FakeAuthenticator(origin: 'https://targetisl.co.ke'));
        $this->enrol($u, new FakeAuthenticator(origin: 'https://www.targetisl.co.ke'));
        $this->assertSame(2, AuthCredential::count());
    }

    /** @return array<string, array{0: array<string, mixed>, 1: array<string, mixed>}> a device set up wrongly, and what it does wrong */
    public static function badRegistrations(): array
    {
        return [
            'another website entirely' => [['origin' => 'https://evil.example'], []],
            'a look-alike' => [['origin' => 'https://targetisl.co.ke.evil.example'], []],
            'a subdomain that is not ours' => [['origin' => 'https://evil.targetisl.co.ke'], []],
            'plain http' => [['origin' => 'http://targetisl.co.ke'], []],
            'a different port' => [['origin' => 'https://targetisl.co.ke:8443'], []],
            'a device that thought it was another site' => [[], ['rpId' => 'evil.example']],
            'the wrong question answered' => [[], ['challenge' => 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA']],
            'the wrong kind of answer (a sign-in for an add)' => [[], ['type' => 'webauthn.get']],
            'no fingerprint, face or PIN' => [['userVerified' => false], []],
            'nobody touched it' => [['userPresent' => false], []],
        ];
    }

    /** @dataProvider badRegistrations */
    #[\PHPUnit\Framework\Attributes\DataProvider('badRegistrations')]
    public function test_a_passkey_that_is_not_for_this_website_or_not_properly_asked_is_refused(array $device, array $overrides): void
    {
        $u = $this->person();
        $e = $this->refusedAny(fn () => $this->enrol($u, $this->device($device), null, $overrides));
        $this->assertContains($e->reason, ['verification_failed', 'wrong_kind_of_answer']);
        $this->assertSame(0, AuthCredential::count());
        $line = SecurityEvent::where('event', 'passkey_rejected')->latest('id')->first();
        $this->assertNotNull($line, 'a refusal is written to the security log');
        $this->assertSame([$u->id, 'register'], [$line->subject_id, $line->detail['step']]);
    }

    public function test_an_add_answered_as_a_sign_in_and_the_reverse_is_refused_for_that_reason(): void
    {
        $u = $this->person();
        $this->assertSame('wrong_kind_of_answer', $this->refusedAny(fn () => $this->enrol($u, $this->device(), null, ['type' => 'webauthn.get']))->reason);
        $d = $this->device();
        $this->enrol($u, $d);
        $this->assertSame('wrong_kind_of_answer', $this->refusedAny(fn () => $this->signIn($d, ['type' => 'webauthn.create']))->reason);
    }

    public function test_only_https_addresses_count_as_ours_and_http_only_for_localhost(): void
    {
        config(['security.passkeys.origins' => ['https://targetisl.co.ke', 'http://targetisl.co.ke', 'http://localhost:5173', 'http://127.0.0.1:5173', 'targetisl.co.ke', '', 'ftp://targetisl.co.ke']]);
        $this->assertSame(['https://targetisl.co.ke', 'http://localhost:5173'], PasskeyConfig::origins());
    }

    public function test_the_same_answer_can_not_be_used_twice(): void
    {
        $u = $this->person();
        $d = $this->device();
        $o = $this->svc->registrationOptions($u, $this->req);
        $answer = $d->register($o['options']);
        $this->svc->register($u, $o['id'], $answer, null, $this->req);
        $this->refused(fn () => $this->svc->register($u, $o['id'], $answer, null, $this->req), 'challenge_used');
        $this->assertSame(1, AuthCredential::count());
    }

    public function test_a_question_left_unanswered_runs_out_after_two_minutes(): void
    {
        $u = $this->person();
        $d = $this->device();
        $o = $this->svc->registrationOptions($u, $this->req);
        $this->travel(3)->minutes();
        $this->refused(fn () => $this->svc->register($u, $o['id'], $d->register($o['options']), null, $this->req), 'challenge_expired');
    }

    public function test_a_question_for_one_person_can_not_be_answered_for_another(): void
    {
        $a = $this->person();
        $b = $this->person('baraka@example.com', 'Baraka Otieno');
        $d = $this->device();
        $o = $this->svc->registrationOptions($a, $this->req);
        $this->refused(fn () => $this->svc->register($b, $o['id'], $d->register($o['options']), null, $this->req), 'challenge_wrong_person');
        $this->assertSame(0, AuthCredential::count());
    }

    public function test_a_sign_in_question_can_not_be_used_to_add_a_passkey_nor_the_reverse(): void
    {
        $u = $this->person();
        $d = $this->device();
        $login = $this->svc->loginOptions($this->req);
        $this->refused(fn () => $this->svc->register($u, $login['id'], $d->register($this->svc->registrationOptions($u, $this->req)['options']), null, $this->req), 'challenge_unknown');
        $add = $this->svc->registrationOptions($u, $this->req);
        $this->enrol($u, $this->device());
        $this->refused(fn () => $this->svc->login($add['id'], $d->assert($login['options']), $this->req), 'challenge_unknown');
    }

    public function test_a_question_that_never_existed_is_refused(): void
    {
        $u = $this->person();
        $this->refused(fn () => $this->svc->register($u, str_repeat('x', 40), [], null, $this->req), 'challenge_unknown');
        $this->refused(fn () => $this->svc->login('', [], $this->req), 'challenge_unknown');
    }

    public function test_the_same_passkey_can_not_be_added_twice_nor_to_two_people(): void
    {
        $a = $this->person();
        $b = $this->person('baraka@example.com', 'Baraka Otieno');
        $d = $this->device();
        $this->enrol($a, $d);
        $this->refused(fn () => $this->enrol($a, $d), 'duplicate');
        $this->refused(fn () => $this->enrol($b, $d), 'duplicate');
        $this->assertSame(1, AuthCredential::count());
    }

    public function test_there_is_a_limit_to_how_many_a_person_can_have(): void
    {
        config(['security.passkeys.max_per_person' => 2]);
        $u = $this->person();
        $this->enrol($u, $this->device());
        $this->enrol($u, $this->device());
        $this->refused(fn () => $this->svc->registrationOptions($u, $this->req), 'too_many');
    }

    public function test_nonsense_instead_of_a_passkey_is_refused_politely(): void
    {
        $u = $this->person();
        foreach ([[], ['id' => 'x'], ['id' => 'x', 'rawId' => 'x', 'type' => 'public-key', 'response' => 'nope'], ['response' => ['clientDataJSON' => '!!!', 'attestationObject' => '???']]] as $junk) {
            $o = $this->svc->registrationOptions($u, $this->req);
            $e = $this->refusedAny(fn () => $this->svc->register($u, $o['id'], $junk, null, $this->req));
            $this->assertContains($e->reason, ['verification_failed', 'not_a_credential']);
        }
        $this->assertSame(0, AuthCredential::count());
    }

    public function test_an_answer_for_signing_in_handed_in_as_an_add_is_refused(): void
    {
        $u = $this->person();
        $d = $this->device();
        $this->enrol($u, $d);
        $o = $this->svc->registrationOptions($u, $this->req);
        $login = $this->svc->loginOptions($this->req);
        $this->refused(fn () => $this->svc->register($u, $o['id'], $d->assert($login['options']), null, $this->req), 'not_an_attestation');
    }

    // ------------------------------------------------------------ signing in

    public function test_the_sign_in_question_names_no_one_and_lists_no_passkeys(): void
    {
        $o = $this->svc->loginOptions($this->req);
        $this->assertSame('targetisl.co.ke', $o['options']['rpId']);
        $this->assertSame('required', $o['options']['userVerification']);
        $this->assertSame([], $o['options']['allowCredentials'] ?? []);
        $row = AuthChallenge::find($o['id']);
        $this->assertSame(['sign_in', null], [$row->purpose, $row->user_id]);
    }

    public function test_a_passkey_signs_its_owner_in_and_the_device_is_remembered(): void
    {
        $u = $this->person();
        $this->person('baraka@example.com', 'Baraka Otieno');
        $d = $this->device();
        $stored = $this->enrol($u, $d);
        $r = $this->signIn($d);
        $this->assertSame([$u->id, $stored->id], [$r['user']->id, $r['credential']->id]);
        $c = $stored->fresh();
        $this->assertSame([1, '41.80.1.1', 'Chrome on Windows'], [$c->counter, $c->last_used_ip, $c->last_used_device]);
        $this->assertNotNull($c->last_used_at);
    }

    public function test_passkeys_that_never_count_are_accepted_every_time(): void
    {
        $u = $this->person();
        $d = $this->device();
        $this->enrol($u, $d);
        foreach ([0, 0, 0] as $zero) {
            $this->assertSame($u->id, $this->signIn($d, ['counter' => $zero])['user']->id);
        }
        $this->assertSame(0, AuthCredential::first()->counter);
    }

    public function test_each_of_two_peoples_passkeys_finds_its_own_owner(): void
    {
        $a = $this->person();
        $b = $this->person('baraka@example.com', 'Baraka Otieno');
        $da = $this->device();
        $db = $this->device();
        $this->enrol($a, $da);
        $this->enrol($b, $db);
        $this->assertSame($b->id, $this->signIn($db)['user']->id);
        $this->assertSame($a->id, $this->signIn($da)['user']->id);
    }

    /** @return array<string, array{0: array<string, mixed>, 1: array<string, mixed>}> */
    public static function badSignIns(): array
    {
        return [
            'a copy of the site on another address' => [['origin' => 'https://evil.example'], []],
            'a subdomain that is not ours' => [['origin' => 'https://evil.targetisl.co.ke'], []],
            'the device thought it was another site' => [[], ['rpId' => 'evil.example']],
            'the wrong question answered' => [[], ['challenge' => 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA']],
            'the wrong kind of answer' => [[], ['type' => 'webauthn.create']],
            'a forged signature' => [[], ['badSignature' => true]],
            'no fingerprint, face or PIN' => [['userVerified' => false], []],
            'nobody touched it' => [['userPresent' => false], []],
            'it does not say whose passkey it is' => [[], ['userHandle' => null]],
            'it names someone else' => [[], ['userHandle' => 'another-persons-handle-0123456789']],
        ];
    }

    /** @dataProvider badSignIns */
    #[\PHPUnit\Framework\Attributes\DataProvider('badSignIns')]
    public function test_a_sign_in_that_is_not_genuine_is_refused_and_the_owner_is_none_the_wiser(array $device, array $overrides): void
    {
        $u = $this->person();
        $d = $this->device();
        $this->enrol($u, $d);
        foreach ($device as $k => $v) {
            $d->$k = $v;
        }
        $e = $this->refusedAny(fn () => $this->signIn($d, $overrides));
        $this->assertContains($e->reason, ['verification_failed', 'wrong_kind_of_answer']);
        $this->assertSame(0, AuthCredential::first()->counter, 'nothing was learned from a refused answer');
    }

    public function test_an_unknown_passkey_is_refused_without_saying_who_has_one(): void
    {
        $this->person();
        $this->refused(fn () => $this->signIn($this->device()), 'unknown_credential');
    }

    public function test_a_removed_passkey_no_longer_signs_anyone_in(): void
    {
        $u = $this->person();
        $d = $this->device();
        $c = $this->enrol($u, $d);
        $c->forceFill(['revoked_at' => now(), 'revoked_reason' => 'lost'])->save();
        $this->refused(fn () => $this->signIn($d), 'revoked');
    }

    public function test_the_answer_to_a_question_can_not_be_given_again(): void
    {
        $u = $this->person();
        $d = $this->device();
        $this->enrol($u, $d);
        $o = $this->svc->loginOptions($this->req);
        $answer = $d->assert($o['options']);
        $this->svc->login($o['id'], $answer, $this->req);
        $this->refused(fn () => $this->svc->login($o['id'], $answer, $this->req), 'challenge_used');
    }

    public function test_a_sign_in_question_runs_out(): void
    {
        $u = $this->person();
        $d = $this->device();
        $this->enrol($u, $d);
        $o = $this->svc->loginOptions($this->req);
        $this->travel(121)->seconds();
        $this->refused(fn () => $this->svc->login($o['id'], $d->assert($o['options']), $this->req), 'challenge_expired');
    }

    public function test_a_sign_in_answer_made_for_one_question_does_not_fit_another(): void
    {
        $u = $this->person();
        $d = $this->device();
        $this->enrol($u, $d);
        $one = $this->svc->loginOptions($this->req);
        $two = $this->svc->loginOptions($this->req);
        $this->refused(fn () => $this->svc->login($two['id'], $d->assert($one['options']), $this->req), 'verification_failed');
    }

    public function test_an_answer_that_is_not_a_sign_in_answer_is_refused(): void
    {
        $u = $this->person();
        $d = $this->device();
        $this->enrol($u, $d);
        $o = $this->svc->loginOptions($this->req);
        $reg = $d->register($this->svc->registrationOptions($u, $this->req)['options']);
        $this->refused(fn () => $this->svc->login($o['id'], $reg, $this->req), 'not_an_assertion');
    }

    // ------------------------------------------------------------ a copied passkey

    public function test_a_passkey_whose_counter_goes_backwards_has_been_copied_and_is_switched_off_with_an_alert(): void
    {
        $u = $this->person();
        $d = $this->device();
        $c = $this->enrol($u, $d);
        $thief = $d->cloneDevice();
        $this->signIn($d);
        $this->signIn($d);
        $this->assertSame(2, $c->fresh()->counter);
        $e = $this->refused(fn () => $this->signIn($thief, ['counter' => 1]), 'clone_suspected');
        $this->assertSame(403, $e->httpStatus);
        $c = $c->fresh();
        $this->assertSame('clone_suspected', $c->disabled_reason);
        $this->assertNotNull($c->disabled_at);
        $line = SecurityEvent::where('event', 'passkey_clone_suspected')->first();
        $this->assertSame(['alert', $u->id, $c->id], [$line->severity, $line->subject_id, $line->detail['credential']]);
        // the real device is shut out too until the owner has dealt with it
        $this->refused(fn () => $this->signIn($d), 'disabled');
    }

    public function test_the_same_counter_twice_counts_as_copied_when_the_device_does_count(): void
    {
        $u = $this->person();
        $d = $this->device();
        $this->enrol($u, $d);
        $this->signIn($d);                                    // counter 1
        $this->refused(fn () => $this->signIn($d, ['counter' => 1]), 'clone_suspected');
    }

    public function test_a_disabled_passkey_is_still_listed_for_its_owner_but_can_not_sign_in(): void
    {
        $u = $this->person();
        $d = $this->device();
        $c = $this->enrol($u, $d);
        $c->forceFill(['disabled_at' => now(), 'disabled_reason' => 'clone_suspected'])->save();
        $store = app(CredentialStore::class);
        $this->assertCount(1, $store->forUser($u));
        $this->assertCount(0, $store->usableFor($u));
    }

    // ------------------------------------------------------------ a known person

    public function test_a_step_up_answer_must_come_from_that_persons_own_passkey(): void
    {
        $a = $this->person();
        $b = $this->person('baraka@example.com', 'Baraka Otieno');
        $da = $this->device();
        $db = $this->device();
        $this->enrol($a, $da);
        $this->enrol($b, $db);
        $make = function (User $who) {
            $o = $this->svc->loginOptions($this->req);

            return [$o, AuthChallenge::find($o['id'])];
        };
        [$o, $row] = $make($a);
        $row->forceFill(['used_at' => now()])->save();
        $this->assertSame($a->id, $this->svc->answerFor($a, $row, $da->assert($o['options']), $this->req)['user']->id);
        [$o, $row] = $make($a);
        $this->refused(fn () => $this->svc->answerFor($a, $row, $db->assert($o['options']), $this->req), 'credential_of_someone_else');
    }

    // ------------------------------------------------------------ the settings

    public function test_the_website_addresses_come_from_the_settings_and_are_exact(): void
    {
        $this->assertSame(['https://targetisl.co.ke', 'https://www.targetisl.co.ke'], PasskeyConfig::origins());
        $this->assertSame('targetisl.co.ke', PasskeyConfig::rpId());
        config(['security.passkeys.origins' => ['https://other.example'], 'security.passkeys.rp_id' => 'other.example']);
        $u = $this->person();
        $this->refused(fn () => $this->enrol($u, new FakeAuthenticator(origin: 'https://targetisl.co.ke')), 'verification_failed');
        $this->enrol($u, new FakeAuthenticator(rpId: 'other.example', origin: 'https://other.example'));
        $this->assertSame(1, AuthCredential::count());
    }

    public function test_development_on_localhost_works_and_only_there(): void
    {
        config(['security.passkeys.rp_id' => 'localhost', 'security.passkeys.origins' => ['http://localhost:5177']]);
        $u = $this->person();
        $d = new FakeAuthenticator(rpId: 'localhost', origin: 'http://localhost:5177');
        $this->enrol($u, $d);
        $this->assertSame($u->id, $this->signIn($d)['user']->id);
        $this->refused(fn () => $this->enrol($u, new FakeAuthenticator(rpId: 'localhost', origin: 'http://localhost:9999')), 'verification_failed');
        config(['security.passkeys.rp_id' => 'targetisl.co.ke', 'security.passkeys.origins' => ['http://targetisl.co.ke']]);
        $this->refused(fn () => $this->enrol($u, new FakeAuthenticator(origin: 'http://targetisl.co.ke')), 'verification_failed');   // plain http is never accepted for a real domain
    }
}
