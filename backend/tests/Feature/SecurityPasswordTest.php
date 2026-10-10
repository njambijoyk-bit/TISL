<?php

namespace Tests\Feature;

use App\Models\User;
use App\Rules\StrongPassword;
use App\Services\Security\ImportedAccounts;
use App\Services\Security\PasswordPolicy;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

/** What counts as an acceptable password, and that every door that sets one asks. */
class SecurityPasswordTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Cache::flush();
    }

    private const PERSON = ['Amina Wanjiru', 'amina.w@example.com', '0712345678'];

    private function ok(string $pw, array $personal = self::PERSON): void
    {
        $this->assertNull(PasswordPolicy::problem($pw, $personal), "{$pw} should be fine");
    }

    private function refused(string $pw, string $why, array $personal = self::PERSON): void
    {
        $this->assertStringContainsString($why, (string) PasswordPolicy::problem($pw, $personal), "{$pw} should be refused");
    }

    // ------------------------------------------------------------ the rules

    public function test_ten_characters_is_the_least_and_the_most_is_128(): void
    {
        $this->refused('Wq7!zXp4k', 'at least 10');                       // 9
        $this->ok('Wq7!zXp4kL');                                          // 10
        $this->ok(str_repeat('Wq7!zXp4kL', 12));                           // 120
        $this->refused(str_repeat('Wq7!zXp4kL', 13), 'too long');          // 130
    }

    public function test_the_longest_is_exactly_the_limit_and_the_limit_can_be_changed(): void
    {
        $this->ok(str_repeat('Wq7!zXp4', 16));                                       // 128
        $this->refused(str_repeat('Wq7!zXp4', 16).'k', 'too long');                   // 129
        config(['security.password.max_length' => 20]);
        $this->ok('Wq7!zXp4kLmN2v9#bT5d');                                            // 20
        $this->refused('Wq7!zXp4kLmN2v9#bT5dX', 'too long');                          // 21
    }

    public function test_a_password_is_refused_for_a_pattern_at_the_edges_of_the_rule(): void
    {
        $this->refused('abcdabdcbadc', 'repeats', ['Zed Person']);                    // only four different characters
        $this->ok('xyzwvxzywvwxzy', ['Zed Person']);                                  // five different characters, no pattern
        $this->refused('xqzvwkxqzvwkxqzvwk', 'repeats', ['Zed Person']);              // one piece three times
        $this->ok('xqzvwkxqzvwkpy', ['Zed Person']);                                  // twice, then something else
    }

    public function test_letters_swapped_for_symbols_do_not_get_a_name_past_the_rule(): void
    {
        $this->refused('xx-50n1a-xx-zebra', 'not contain your name', ['Sonia Kamau']);       // 5 0 1 -> s o i
        $this->refused('xx-$onia-xx-zebra', 'not contain your name', ['Sonia Kamau']);       // $ -> s
        $this->refused('xx-p3t3r-xx-zebra', 'not contain your name', ['Peter Kamau']);       // 3 -> e
        $this->refused('xx-pe7er-xx-zebra', 'not contain your name', ['Peter Kamau']);       // 7 -> t
        $this->refused('xx-pe+er-xx-zebra', 'not contain your name', ['Peter Kamau']);       // + -> t
        $this->refused('xx-m4ry4nne-xx-zebra', 'not contain your name', ['Maryanne Kamau']); // 4 -> a
        $this->refused('xx-@m1na-xx-zebra', 'not contain your name', ['Amina Kamau']);       // @ 1 -> a i
        $this->refused('xx-Ju1ia-xx-zebra', 'not contain your name', ['Julia Kamau']);       // 1 -> i or l: here l
    }

    public function test_a_known_password_is_caught_when_broken_up_or_spelled_with_digits_for_letters(): void
    {
        $this->refused('Pass-Word-1!', 'first ones');                                  // pass-word -> password
        $this->refused('He11oW0r1d99', 'first ones');                                  // 1 -> l, 0 -> o
        $this->refused('H3ll0-W0rld!!', 'first ones');
    }

    public function test_a_phone_number_written_with_spaces_is_still_caught(): void
    {
        $this->refused('xx254712345678xx-zebra', 'not contain your name', ['+254 712 345 678']);
        $this->ok('xx254712-zebra-lantern', ['+254 712 345 678']);
        $this->refused('xx0712345678xx-zebra', 'not contain your name', ['Ph 07 12 345 678']);   // the digits count even when written among other things
    }

    public function test_the_first_passwords_anybody_tries_are_refused_even_dressed_up(): void
    {
        foreach (['Password123!', 'P@ssw0rd2024', 'qwertyuiop1', 'Nairobi2024!!', 'Welcome@2025', 'letmein-letmein', 'sunshine99999', 'ILOVEYOU2024', 'Tisl@2025!!', 'Mombasa#2023', 'monkey1234567'] as $pw) {
            $this->refused($pw, 'first ones anybody would try', ['Zed Person']);
        }
    }

    public function test_a_few_unrelated_words_or_random_characters_are_welcome(): void
    {
        foreach (['correct horse battery staple', 'purple-giraffe-lantern', 'xK9#mQ2$vL7!', 'monkey-purple-42-dishwasher', 'Tr0ub4dor&3x'] as $pw) {
            $this->ok($pw);
        }
    }

    public function test_the_persons_own_name_email_phone_and_tisl_are_not_allowed_in_it(): void
    {
        $this->refused('my-Amina-garden-xyz', 'not contain your name');
        $this->refused('xyz-wanjiru-xyz-qq', 'not contain your name');
        $this->refused('AminaWanjiru-purple-1', 'not contain your name');
        $this->refused('green-amina.w-giraffe', 'not contain your name');                // the part of the email before the @
        $this->refused('green-0712345678-giraffe', 'not contain your name');
        $this->refused('green-giraffe-TISL-xyz', 'word TISL');
        $this->refused('green-giraffe-T1SL-xyz', 'word TISL');                           // with a letter swapped for a digit
        $this->refused('gr33n-@m1na-giraffe', 'not contain your name');
    }

    public function test_short_pieces_of_a_name_do_not_block_everything(): void
    {
        $this->ok('green-giraffe-alexander-9', ['Al Li', 'al.li@x.co']);
    }

    public function test_one_character_a_straight_run_or_one_piece_over_and_over_are_refused(): void
    {
        foreach (['aaaaaaaaaaaa', 'abababababab', 'abcabcabcabc', 'abcdefghijkl', 'zyxwvutsrqpo', 'xqzxqzxqzxqz', '0123456789'] as $pw) {
            $this->assertNotNull(PasswordPolicy::problem($pw, ['Zed Person']), "{$pw} should be refused");
        }
        foreach (['abababababab', 'abcabcabcabc', 'abcdefghijkl', 'zyxwvutsrqpo', 'xqzxqzxqzxqz'] as $pw) {
            $this->refused($pw, 'repeats', ['Zed Person']);   // refused for the pattern, not for being a well-known password
        }
    }

    public function test_the_least_length_comes_from_the_settings(): void
    {
        config(['security.password.min_length' => 12]);
        $this->refused('Wq7!zXp4kLm', 'at least 12');
        $this->ok('Wq7!zXp4kLmN');
        config(['security.password.min_length' => 2]);
        $this->assertSame(8, PasswordPolicy::minLength(), 'never below 8 whatever the setting');
    }

    public function test_the_words_taken_from_a_persons_details(): void
    {
        $words = PasswordPolicy::wordsFrom(['Amina Wanjiru', 'amina.w@example.com', '+254 712 345 678', null, '', 'Jo']);
        sort($words);
        // each name part, the name run together, the email's name part (and run together), the phone digits; "Jo" is too short to be worth refusing
        $this->assertSame(['254712345678', 'amina', 'aminaw', 'aminawanjiru', 'wanjiru'], $words);
    }

    public function test_a_made_up_password_is_long_and_always_acceptable_and_never_the_same(): void
    {
        $a = PasswordPolicy::random();
        $b = PasswordPolicy::random();
        $this->assertGreaterThanOrEqual(24, strlen($a));
        $this->assertNotSame($a, $b);
        $this->assertNull(PasswordPolicy::problem($a));
    }

    // ------------------------------------------------------------ the validation rule

    private function failsWith(array $data, array $personal = []): ?string
    {
        $v = Validator::make($data, ['password' => ['required', 'string', new StrongPassword($personal)]]);

        return $v->fails() ? $v->errors()->first('password') : null;
    }

    public function test_the_rule_reads_the_persons_details_from_the_form_being_checked(): void
    {
        $this->assertStringContainsString('not contain your name', (string) $this->failsWith(['name' => 'Baraka Otieno', 'password' => 'nice-baraka-giraffe-77']));
        $this->assertStringContainsString('not contain your name', (string) $this->failsWith(['first_name' => 'Baraka', 'last_name' => 'Otieno', 'password' => 'nice-otieno-giraffe-77']));
        $this->assertStringContainsString('not contain your name', (string) $this->failsWith(['email' => 'baraka@example.com', 'password' => 'nice-baraka-giraffe-77']));
        $this->assertNull($this->failsWith(['name' => 'Baraka Otieno', 'password' => 'nice-purple-giraffe-77']));
    }

    public function test_the_rule_also_takes_details_passed_in_for_someone_signed_in(): void
    {
        $this->assertStringContainsString('not contain your name', (string) $this->failsWith(['password' => 'nice-baraka-giraffe-77'], ['Baraka Otieno']));
    }

    public function test_the_rule_says_no_to_something_that_is_not_text(): void
    {
        $v = Validator::make(['password' => ['a']], ['password' => [new StrongPassword]]);
        $this->assertTrue($v->fails());
    }

    // ------------------------------------------------------------ the doors

    private function errorsOn(string $key, $response): array
    {
        return $response->json("errors.{$key}") ?? [];
    }

    public function test_sign_up_refuses_a_weak_password_and_does_not_mind_a_good_one(): void
    {
        $weak = $this->postJson('/api/auth/register', ['name' => 'Amina Wanjiru', 'email' => 'amina@example.com', 'phone' => '0712345678', 'password' => 'Password123!', 'password_confirmation' => 'Password123!']);
        $weak->assertStatus(422);
        $this->assertNotEmpty($this->errorsOn('password', $weak));
        $good = $this->postJson('/api/auth/register', ['name' => 'Amina Wanjiru', 'email' => 'amina@example.com', 'phone' => '0712345678', 'password' => 'purple-giraffe-lantern', 'password_confirmation' => 'purple-giraffe-lantern']);
        $this->assertEmpty($this->errorsOn('password', $good), 'the password is not what stops this one (the policy answers are missing)');
    }

    public function test_the_reset_door_refuses_a_weak_password(): void
    {
        $weak = $this->postJson('/api/auth/reset-password', ['token' => 'x', 'email' => 'amina@example.com', 'password' => 'amina-amina-amina-1', 'password_confirmation' => 'amina-amina-amina-1']);
        $weak->assertStatus(422);
        $this->assertNotEmpty($this->errorsOn('password', $weak));
    }

    public function test_the_temporary_password_door_refuses_a_weak_new_password(): void
    {
        $r = $this->postJson('/api/auth/force-change-password', ['email' => 'amina@example.com', 'current_password' => 'x', 'new_password' => 'Welcome@2025', 'new_password_confirmation' => 'Welcome@2025']);
        $r->assertStatus(422);
        $this->assertNotEmpty($this->errorsOn('new_password', $r));
    }

    public function test_changing_a_password_while_signed_in_refuses_a_weak_one_and_one_with_your_own_name(): void
    {
        $u = User::forceCreate(['name' => 'Baraka Otieno', 'email' => 'bo@example.com', 'password' => Hash::make('Old-password-1'), 'role' => 'customer']);
        $token = app(Sessions::class)->issue($u, Request::create('/x', 'POST'));
        $change = function (string $new) use ($token) {
            $this->app['auth']->forgetGuards();
            $this->flushSession();

            return $this->withHeader('Authorization', 'Bearer '.$token)->postJson('/api/auth/change-password', ['current_password' => 'Old-password-1', 'new_password' => $new, 'new_password_confirmation' => $new]);
        };
        $this->assertNotEmpty($this->errorsOn('new_password', $change('Password123!')));
        $own = $change('nice-baraka-giraffe-77');
        $this->assertStringContainsString('not contain your name', $this->errorsOn('new_password', $own)[0] ?? '');
        $change('purple-giraffe-lantern-9')->assertOk();
    }

    public function test_every_door_that_sets_a_password_asks_the_rule(): void
    {
        $uses = [
            'app/Http/Controllers/Api/AuthController.php' => 4,                      // sign-up, reset by email, change, temporary-password door
            'app/Http/Controllers/Api/Careers/ApplicantAuthController.php' => 3,     // applicant sign-up, change, reset
            'app/Http/Controllers/Api/Careers/ApplicantPortalController.php' => 1,
            'app/Http/Controllers/Api/Careers/AdminApplicantController.php' => 1,
            'app/Http/Controllers/Api/UserController.php' => 2,                      // an administrator makes an account / resets a password
            'app/Http/Controllers/Api/EmployeeController.php' => 1,
        ];
        foreach ($uses as $file => $n) {
            $code = (string) file_get_contents(base_path($file));
            $this->assertSame($n, substr_count($code, 'new StrongPassword') + substr_count($code, 'new \\App\\Rules\\StrongPassword'), "{$file}: doors that set a password");
            foreach (explode("\n", $code) as $line) {
                if (preg_match("/'(new_|temporary_)?password'\s*=>.*min:8/", $line)) {
                    $this->fail("{$file} still has an 8-character rule on a password: {$line}");
                }
            }
        }
    }

    // ------------------------------------------------------------ accounts made by a spreadsheet

    public function test_a_file_never_changes_the_password_of_someone_who_already_has_an_account(): void
    {
        $u = User::forceCreate(['name' => 'Boss', 'email' => 'boss@example.com', 'password' => Hash::make('Boss-real-password-1'), 'role' => 'customer']);
        $hash = $u->password;
        ImportedAccounts::upsert('boss@example.com', ['name' => 'Boss Renamed'], 'EmpPass123!');
        $u = $u->fresh();
        $this->assertSame('Boss Renamed', $u->name, 'the rest of the row is applied');
        $this->assertSame($hash, $u->password, 'the password is untouched');
        $this->assertTrue(Hash::check('Boss-real-password-1', $u->password));
    }

    public function test_a_new_person_from_a_file_gets_the_acceptable_password_in_it_and_must_change_it(): void
    {
        $u = ImportedAccounts::upsert('new@example.com', ['name' => 'Newcomer'], 'purple-giraffe-lantern');
        $this->assertTrue(Hash::check('purple-giraffe-lantern', $u->fresh()->password));
        $this->assertTrue((bool) $u->fresh()->force_password_change);
    }

    public function test_a_weak_or_missing_password_in_a_file_is_replaced_by_one_nobody_knows(): void
    {
        foreach ([['a@example.com', 'EmpPass123!'], ['b@example.com', null], ['c@example.com', '   '], ['d@example.com', 'short']] as [$email, $given]) {
            $u = ImportedAccounts::upsert($email, ['name' => 'Someone Else'], $given);
            $this->assertFalse($given && Hash::check($given, $u->fresh()->password), "{$email}: the weak password was not used");
            $this->assertFalse(Hash::check('EmpPass123!', $u->fresh()->password));
            $this->assertFalse(Hash::check('TempPass123!', $u->fresh()->password));
            $this->assertTrue((bool) $u->fresh()->force_password_change);
        }
        $this->assertSame(4, User::count());
        $this->assertCount(4, array_unique(User::pluck('password')->all()), 'each got a different one');
    }

    public function test_the_import_does_not_leave_a_default_password_anywhere(): void
    {
        foreach (['app/Imports/EmployeesImport.php', 'app/Imports/CustomersImport.php', 'app/Http/Controllers/Api/EmployeeController.php'] as $file) {
            $code = (string) file_get_contents(base_path($file));
            foreach (['EmpPass123!', 'TempPass123!', 'password123'] as $default) {
                $this->assertStringNotContainsString($default, $code, "{$file} still has the default {$default}");
            }
        }
    }
}
