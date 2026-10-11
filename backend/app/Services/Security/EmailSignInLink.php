<?php

namespace App\Services\Security;

use App\Models\CompanyProfile;
use App\Models\Security\AuthEmailLink;
use App\Models\User;
use App\Services\Notify\Notifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * Phase 4.1: a customer asks for a one-time sign-in link by email instead of typing a password.
 *
 *  - Customers only. Staff, vendors and anyone with admin access never get one: it would be a weaker door beside their passkey.
 *  - The answer to "send me a link" is the same whoever the email belongs to, so it tells a stranger nothing about who has an account.
 *  - The link holds a random code; the asking browser is given a second one in a cookie scripts cannot read. Using the link needs both, so a forwarded or stolen link on another device does nothing.
 *  - Only hashes are kept. The link works once, runs out after a few minutes, and a new request makes the earlier link useless.
 *  - Opening the link only shows a page with a button: mail programs that "click" every link to check it for viruses can not use it up.
 */
final class EmailSignInLink
{
    private const MAX_TRIES = 5;

    public function __construct(private Notifier $notifier)
    {
    }

    public static function enabled(): bool
    {
        return (bool) config('security.email_link.enabled', true) && Schema::hasTable('auth_email_links');
    }

    public static function minutes(): int
    {
        return max(2, (int) config('security.email_link.minutes', 15));
    }

    /** Only a customer, and only one who is not also staff. */
    public static function eligible(User $user): bool
    {
        return $user->isCustomer() && ! $user->isStaff() && $user->canLogin() && ! $user->trashed();
    }

    public static function cookieName(Request $request): string
    {
        return (SessionCookie::secure($request) ? '__Host-' : '').'tisl_link';
    }

    private static function hash(string $code): string
    {
        return hash('sha256', $code);
    }

    /** The cookie that ties the link to the browser that asked. Made for every request, whether or not the email belongs to anyone. */
    public static function binderCookie(Request $request, string $binder): Cookie
    {
        $secure = SessionCookie::secure($request);

        return Cookie::create(self::cookieName($request), $binder, now()->addMinutes(self::minutes() + 5)->getTimestamp(), '/', null, $secure, true, false, (string) config('security.cookie.same_site', 'lax'));
    }

    public static function forgetCookie(Request $request): Cookie
    {
        $secure = SessionCookie::secure($request);

        return Cookie::create(self::cookieName($request), '', 1, '/', null, $secure, true, false, (string) config('security.cookie.same_site', 'lax'));
    }

    /**
     * Email the link if this is a customer who may have one. Returns nothing the caller could use to tell the two apart.
     *
     * @param string $binder the random code that is also set in the asking browser's cookie
     */
    public function ask(string $email, string $binder, Request $request): void
    {
        if (! self::enabled()) {
            return;
        }
        $user = User::where('email', $email)->first();
        if (! $user || ! self::eligible($user)) {
            SecurityLog::record('email_link_refused', null, $request, ['reason' => $user ? 'not_a_customer' : 'unknown_email'], SecurityLog::NOTICE, $email);

            return;
        }
        // one a minute is enough for anyone, and stops the inbox of a real customer being flooded (the request limiter counts the typed email AND the address)
        $recent = AuthEmailLink::where('user_id', $user->getKey())->where('created_at', '>', now()->subSeconds(max(0, (int) config('security.email_link.resend_seconds', 60))))->exists();
        if ($recent) {
            return;
        }
        AuthEmailLink::where('user_id', $user->getKey())->whereNull('used_at')->update(['used_at' => now()]);   // the earlier link is dead the moment a newer one exists
        $code = Str::random(48);
        AuthEmailLink::create(['id' => self::hash($code), 'user_id' => $user->getKey(), 'binder_hash' => self::hash($binder), 'ip' => $request->ip(), 'user_agent' => $request->userAgent() ? mb_substr($request->userAgent(), 0, 255) : null,
            'expires_at' => now()->addMinutes(self::minutes())]);
        SecurityLog::record('email_link_sent', $user, $request, [], SecurityLog::INFO);

        $company = CompanyProfile::name();
        $device = DeviceInfo::describe($request->userAgent())['label'];
        $this->notifier->send($user, 'email_sign_in_link', "Your {$company} sign-in link",
            "Someone (hopefully you) asked to sign in to {$company} without a password.\n\nPress the button on the same phone or computer you asked from. It works once and runs out in ".self::minutes()." minutes.\n\nAsked from: {$device}".($request->ip() ? " ({$request->ip()})" : '')."\n\nIf this was not you, do nothing: nobody can use the link without the browser that asked for it.",
            ['subject' => "Your {$company} sign-in link", 'action_url' => '/sign-in/email?k='.$code, 'action_text' => 'Sign me in', 'only' => ['email'], 'no_bell' => true]);
    }

    /** The link to look at: null when it is wrong, used or old; 'other_browser' when it is real but this is not the browser that asked. @return AuthEmailLink|string|null */
    public function find(string $code, ?string $binder): AuthEmailLink|string|null
    {
        if (! self::enabled() || ! preg_match('/^[A-Za-z0-9]{48}$/', $code)) {
            return null;
        }
        $link = AuthEmailLink::find(self::hash($code));
        if (! $link || $link->used_at !== null || $link->expires_at->isPast() || $link->tries >= self::MAX_TRIES) {
            return null;
        }
        if ($binder === null || $binder === '' || ! hash_equals($link->binder_hash, self::hash($binder))) {
            $link->increment('tries');   // a few wrong-browser tries burn the link, so a stolen one can not be guessed against

            return 'other_browser';
        }

        return $link;
    }

    /** Use it: once. Returns the customer, or null if someone got there first. */
    public function use(AuthEmailLink $link): ?User
    {
        $won = AuthEmailLink::where('id', $link->id)->whereNull('used_at')->update(['used_at' => now()]);
        if (! $won) {
            return null;
        }
        $user = User::find($link->user_id);

        return $user && self::eligible($user) ? $user : null;
    }

    /** Housekeeping for the schedule: links that ran out long ago are only noise. */
    public static function prune(): int
    {
        return Schema::hasTable('auth_email_links') ? AuthEmailLink::where('expires_at', '<', now()->subDay())->delete() : 0;
    }
}
