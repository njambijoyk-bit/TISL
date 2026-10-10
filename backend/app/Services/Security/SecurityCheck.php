<?php

namespace App\Services\Security;

use App\Models\User;
use App\Services\Security\Passkeys\PasskeyConfig;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Schema;

/**
 * "Is this server set up safely?": the list `php artisan security:check` prints. Each line is ok, a warning (worth fixing), a failure (the protections do not work as built) or a note.
 * It looks only; the one thing it can mend (accounts still on a password the old imports used) needs --fix.
 */
final class SecurityCheck
{
    /** Passwords the old imports and employee form gave to new accounts, and the first few anyone tries. */
    public const DEFAULT_PASSWORDS = ['password123', 'EmpPass123!', 'TempPass123!', 'Password123', 'password'];

    public const OK = 'ok';
    public const WARN = 'warn';
    public const FAIL = 'fail';
    public const NOTE = 'note';

    /** @return array<int, array{status: string, label: string, advice: ?string}> */
    public function run(bool $scanPasswords = true): array
    {
        $production = config('app.env') === 'production';
        $out = [];
        $add = function (string $status, string $label, ?string $advice = null) use (&$out) {
            $out[] = ['status' => $status, 'label' => $label, 'advice' => $advice];
        };

        // how the app is run
        $add(config('app.env') === 'production' ? self::OK : self::WARN, 'Running as production (APP_ENV)', config('app.env') === 'production' ? null : 'APP_ENV is "'.config('app.env').'". Set APP_ENV=production on the live server.');
        $add(! config('app.debug') ? self::OK : ($production ? self::FAIL : self::WARN), 'Debug pages are off (APP_DEBUG)', ! config('app.debug') ? null : 'APP_DEBUG=true shows passwords, keys and code to anyone who triggers an error. Set APP_DEBUG=false on the live server.');
        $add(config('app.key') ? self::OK : self::FAIL, 'The app key is set (APP_KEY)', config('app.key') ? null : 'Run php artisan key:generate. Without it nothing is encrypted or signed.');
        foreach (['app.url' => 'APP_URL (this server)', 'app.frontend_url' => 'FRONTEND_URL (the website)'] as $key => $name) {
            $https = str_starts_with((string) config($key), 'https://');
            $add($https ? self::OK : ($production ? self::WARN : self::NOTE), "{$name} uses https", $https ? null : "{$name} is ".(config($key) ?: 'not set').'. Use the https address on the live server: links in emails and signed links depend on it.');
        }
        // the sign-in cookie: a browser sends it only to the API's own address, and only from a website on the same domain
        if (SessionCookie::enabled()) {
            $api = self::registrableDomain((string) parse_url((string) config('app.url'), PHP_URL_HOST));
            $site = self::registrableDomain((string) parse_url((string) config('app.frontend_url'), PHP_URL_HOST));
            $same = $api !== '' && $api === $site;
            $add($same ? self::OK : ($production ? self::FAIL : self::NOTE), 'The website and the API are on one domain (the sign-in cookie needs it)',
                $same ? null : "The website is on \"{$site}\" and the API on \"{$api}\". A browser will not send the sign-in cookie between them, so nobody could stay signed in. Put the API on a subdomain of the website's domain (for example api.targetisl.co.ke), or set SECURITY_COOKIE_SESSIONS=false to hand the sign-in code to the page instead (less safe).");
            $add(config('security.cookie.secure') || str_starts_with((string) config('app.url'), 'https://') ? self::OK : ($production ? self::WARN : self::NOTE), 'The sign-in cookie is marked Secure',
                config('security.cookie.secure') || str_starts_with((string) config('app.url'), 'https://') ? null : 'APP_URL is not https and SECURITY_COOKIE_SECURE is not set, so the cookie is sent over plain http too.');
        }
        $local = array_values(array_filter((array) config('cors.allowed_origins', []), fn ($o) => preg_match('#//(localhost|127\.0\.0\.1)#', (string) $o)));
        $add(! $local ? self::OK : ($production ? self::WARN : self::NOTE), 'Only real websites may call the API (CORS)', ! $local ? null : 'config/cors.php still lists '.implode(', ', $local).'. Remove them on the live server.');
        $add(config('session.secure') ? self::OK : ($production ? self::WARN : self::NOTE), 'Cookies are sent over https only (SESSION_SECURE_COOKIE)', config('session.secure') ? null : 'Set SESSION_SECURE_COOKIE=true once the site is on https.');
        $add(env('TRUSTED_PROXIES') ? self::OK : self::NOTE, 'The real visitor address is read behind a load balancer (TRUSTED_PROXIES)',
            env('TRUSTED_PROXIES') ? null : 'Not set. If the API sits behind a load balancer, CDN or host proxy (Railway, Cloudflare, nginx in front), every visitor looks like one address and the sign-in limits count them all together: set TRUSTED_PROXIES to its address, or * if you cannot know it.');

        // the protections need a place to remember
        $store = (string) config('cache.default');
        $add(in_array(config("cache.stores.{$store}.driver"), ['array', 'null'], true) ? self::FAIL : self::OK, 'The cache remembers between requests (CACHE_STORE)',
            in_array(config("cache.stores.{$store}.driver"), ['array', 'null'], true) ? 'CACHE_STORE is "'.$store.'": the waits after wrong passwords and the speed limits forget everything at once. Use database, file or redis.' : null);
        $add(config('queue.default') !== 'sync' ? self::OK : self::WARN, 'Emails are sent in the background (QUEUE_CONNECTION)', config('queue.default') !== 'sync' ? null : 'QUEUE_CONNECTION=sync sends every email while the person waits, including the new sign-in notice. Use database and run a queue worker.');
        $add(! in_array(config('mail.default'), ['log', 'array'], true) ? self::OK : self::WARN, 'Email really goes out (MAIL_MAILER)', ! in_array(config('mail.default'), ['log', 'array'], true) ? null : 'MAIL_MAILER is "'.config('mail.default').'": password reset links and security notices are written to a file, not sent.');

        // what the code needs in the database
        $missing = array_values(array_filter(['auth_sessions', 'security_events', 'auth_credentials', 'auth_challenges', 'security_settings'], fn ($t) => ! Schema::hasTable($t)));
        if (! $missing && ! Schema::hasColumn('auth_sessions', 'strength')) {
            $missing[] = 'auth_sessions.strength';
        }
        $add(! $missing ? self::OK : self::FAIL, 'The security tables exist', ! $missing ? null : 'Missing: '.implode(', ', $missing).'. Run database scripts 123_security_core.sql, 124_passkeys.sql and 125_security_policy.sql in Workbench.');

        // recovery codes (the way back from a lost passkey device) and the seal phrase
        $codes = Schema::hasTable('auth_recovery_codes') && Schema::hasColumn('auth_sessions', 'recovery_at');
        $add($codes ? self::OK : self::WARN, 'Recovery codes are set up', $codes ? null : 'Run database script 126_recovery_codes.sql in Workbench. Without it, someone who loses the phone their passkey is on has no way back in but an administrator.');
        $add(Schema::hasTable('auth_seals') ? self::OK : self::NOTE, 'The seal phrase is set up', Schema::hasTable('auth_seals') ? null : 'Optional: run database script 127_seal_phrase.sql to let people choose a few words the sign-in page shows them.');

        // passkeys are made for one domain and can never move: it must be the website's
        $rp = PasskeyConfig::rpId();
        $siteHost = (string) parse_url((string) config('app.frontend_url'), PHP_URL_HOST);
        $site = self::registrableDomain($siteHost);
        $okRp = $rp !== '' && $rp !== 'localhost' && ($siteHost === $rp || str_ends_with($siteHost, '.'.$rp)) && ($rp === $site || str_ends_with($rp, '.'.$site));   // the website's domain or a name under it, never a bare ending like co.ke
        $add($okRp ? self::OK : ($production ? self::FAIL : self::NOTE), 'Passkeys are made for the website\'s own domain (PASSKEY_RP_ID)',
            $okRp ? null : "PASSKEY_RP_ID is \"{$rp}\" and the website is on \"{$siteHost}\". A passkey belongs to the domain it was made for for ever: set PASSKEY_RP_ID to the website's domain (targetisl.co.ke) BEFORE anyone adds a passkey.");
        $listed = (array) config('security.passkeys.origins', []);
        $usable = PasskeyConfig::origins();
        $add(count($usable) === count($listed) && $usable ? self::OK : self::WARN, 'Passkey origins are exact https addresses of the website (PASSKEY_ORIGINS)',
            count($usable) === count($listed) && $usable ? null : (! $usable ? 'No usable address is listed: nobody could add or use a passkey.' : 'Ignored (not https, or not an address): '.implode(', ', array_diff($listed, $usable)).'.'));
        if (Schema::hasTable('permissions')) {
            $has = DB::table('permissions')->where('key', 'security.view')->exists() && DB::table('permissions')->where('key', 'security.manage')->exists();
            $add($has ? self::OK : self::WARN, 'The security permissions are installed (see the sign-in log, change the sign-in rules)', $has ? null : 'Run php artisan access:seed.');
        }

        // the passkey rule (who must sign in with a passkey)
        if (config('security.policy.kill_switch')) {
            $add(self::WARN, 'The passkey rule is asleep (SECURITY_POLICY_OFF)', 'The emergency switch is on, so nobody is held to the rule whatever the Security screen says. Take SECURITY_POLICY_OFF out of the server settings once everyone is back in.');
        } elseif (! $missing) {
            $policy = app(PasskeyPolicy::class);
            $mode = $policy->mode();
            if ($mode === 'off') {
                $add(self::NOTE, 'The passkey rule is off', 'Staff who handle money or access can still sign in with a password alone. Try it in "log" mode first (Admin → Security), then switch it on.');
            } else {
                $roster = $policy->roster()['summary'];
                $due = $policy->enforceFrom()?->lte(now()) ?? false;
                $add($mode === 'enforce' && $due ? self::OK : self::NOTE, 'The passkey rule is on ('.$mode.($mode === 'enforce' ? ($due ? '' : ', not yet in force') : ': nobody is stopped').')',
                    $roster['missing'] ? "{$roster['missing']} of {$roster['applies']} people it is for still have to add the passkeys it asks for." : null);
            }
        }
        $add(RateLimiter::limiter('sign-in') ? self::OK : self::FAIL, 'Sign-in has a speed limit', RateLimiter::limiter('sign-in') ? null : 'The speed limits are not registered.');
        $add(PasswordPolicy::minLength() >= 10 ? self::OK : self::WARN, 'Passwords must be at least 10 characters', PasswordPolicy::minLength() >= 10 ? null : 'SECURITY_PASSWORD_MIN is '.PasswordPolicy::minLength().'.');
        $add(config('security.headers.enabled') ? self::OK : self::WARN, 'Security headers are sent (SECURITY_HEADERS)', config('security.headers.enabled') ? null : 'Switched off.');
        if (Schema::hasTable('personal_access_tokens')) {
            $old = DB::table('personal_access_tokens')->whereNull('expires_at')->count();
            $add(self::NOTE, $old ? "{$old} sign-in(s) from before expiry existed" : 'Every sign-in has an end date', $old ? 'Each gets an end date the next time it is used.' : null);
        }

        // people
        if ($scanPasswords && Schema::hasTable('users')) {
            $found = $this->accountsOnDefaultPasswords();
            $add(! $found ? self::OK : self::FAIL, 'No account still uses a password everybody knows',
                ! $found ? null : count($found).' account(s) can be signed in to with a password the old imports gave out or the first anyone tries: '.implode(', ', array_slice(array_column($found, 'email'), 0, 10)).(count($found) > 10 ? ', …' : '').'. Run php artisan security:check --fix to make each choose a new one at the next sign-in.');
        }

        return $out;
    }

    /** "api.targetisl.co.ke" -> "targetisl.co.ke": the part of an address a browser treats as one site. (A short list of the two-part endings used in East Africa and the usual others.) */
    public static function registrableDomain(string $host): string
    {
        $host = strtolower(trim($host, '.'));
        if ($host === '' || filter_var($host, FILTER_VALIDATE_IP)) {
            return $host;   // a numeric address stands for itself
        }
        $labels = explode('.', $host);
        $keep = in_array(implode('.', array_slice($labels, -2)), ['co.ke', 'or.ke', 'ac.ke', 'go.ke', 'ne.ke', 'sc.ke', 'me.ke', 'co.tz', 'co.ug', 'co.rw', 'co.za', 'co.uk', 'com.au', 'com.ng', 'com.gh', 'co.in'], true) ? 3 : 2;

        return implode('.', array_slice($labels, -$keep));
    }

    /**
     * Every account whose password is one of DEFAULT_PASSWORDS. Slow on purpose (a real password check for each guess): run it when asked, not on every page.
     *
     * @return array<int, array{id: int, email: string, name: ?string}>
     */
    public function accountsOnDefaultPasswords(): array
    {
        $found = [];
        User::query()->whereNotNull('password')->orderBy('id')->chunkById(200, function ($users) use (&$found) {
            foreach ($users as $u) {
                foreach (self::DEFAULT_PASSWORDS as $guess) {
                    if (rescue(fn () => Hash::check($guess, $u->password), false, false)) {
                        $found[] = ['id' => $u->id, 'email' => (string) $u->email, 'name' => $u->name];
                        break;
                    }
                }
            }
        });

        return $found;
    }

    /** Make each of these accounts choose a new password at the next sign-in, and end their sessions. @param array<int, array{id: int}> $accounts */
    public function fix(array $accounts): int
    {
        $n = 0;
        foreach ($accounts as $a) {
            if ($u = User::find($a['id'])) {
                $u->forceFill(['force_password_change' => true])->save();
                $ended = app(Sessions::class)->revokeAll($u, null, 'default_password');
                SecurityLog::record('default_password_found', $u, null, ['sessions_ended' => $ended], SecurityLog::WARNING);
                $n++;
            }
        }

        return $n;
    }
}
