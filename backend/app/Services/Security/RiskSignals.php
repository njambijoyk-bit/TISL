<?php

namespace App\Services\Security;

use App\Models\Security\AuthSession;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * "Does this sign-in look like the person?": a handful of simple, explainable signals read against that person's own last 90 days. No score from a black box, no outside service:
 *
 *   new_device        a kind of browser (see DeviceInfo) this person has not signed in from lately              1
 *   new_network       an address in a part of the internet (the first three numbers) not seen lately            1
 *   odd_hour          a time of day they almost never sign in at                                                 1
 *   new_country       a country not seen lately (when the host passes it: CF-IPCountry or X-Country)             2
 *   many_failures     three or more wrong passwords for this email in the hour before this success               2
 *
 * A first sign-in has nothing to be compared with, so it shows no signals. The total decides what is done: nothing, a notice to the person, or "confirm with your passkey too".
 * Off by default; in "test" mode it only writes down what it WOULD have done, so the owner sees how often before switching it on.
 */
final class RiskSignals
{
    public const WEIGHTS = ['new_device' => 1, 'new_network' => 1, 'odd_hour' => 1, 'new_country' => 2, 'many_failures' => 2];

    public function __construct(private SecuritySettings $settings)
    {
    }

    /** off | log | enforce. */
    public function mode(): string
    {
        if (config('security.policy.kill_switch') || ! Sessions::tracked()) {
            return 'off';
        }
        $mode = (string) $this->settings->get('risk.mode', 'off');

        return in_array($mode, ['log', 'enforce'], true) ? $mode : 'off';
    }

    /** The first three numbers of an address ("41.80.1"), the first four groups of an IPv6 one: the neighbourhood, not the house. */
    public static function neighbourhood(?string $ip): string
    {
        $ip = (string) $ip;
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            return implode(':', str_split(substr(bin2hex((string) inet_pton($ip)), 0, 16), 4));   // the first 64 bits, written out in full
        }

        return implode('.', array_slice(explode('.', $ip), 0, 3));
    }

    /** The country the host says the request came from, if it says. */
    public static function country(?Request $request): ?string
    {
        $c = strtoupper(trim((string) ($request?->header('CF-IPCountry') ?: $request?->header('X-Country') ?: '')));

        return preg_match('/^[A-Z]{2}$/', $c) && $c !== 'XX' && $c !== 'T1' ? $c : null;
    }

    /**
     * @param ?int $exceptTokenId the sign-in that has just been made (it is not part of the history it is judged by)
     * @return array{signals: string[], score: int, action: string}  action: allow | notice | stronger
     */
    public function assess(User $user, ?Request $request, ?int $exceptTokenId = null, ?string $emailTried = null): array
    {
        $history = AuthSession::where('tokenable_type', $user->getMorphClass())->where('tokenable_id', $user->getKey())->where('created_at', '>=', now()->subDays(90))
            ->when($exceptTokenId, fn ($q) => $q->where('token_id', '!=', $exceptTokenId))->get(['ip', 'device_key', 'created_at']);
        $signals = [];
        if ($history->isNotEmpty()) {
            $device = DeviceInfo::describe($request?->userAgent())['key'];
            if (! $history->pluck('device_key')->contains($device)) {
                $signals[] = 'new_device';
            }
            if ($request?->ip() && ! $history->map(fn ($s) => self::neighbourhood($s->ip))->contains(self::neighbourhood($request->ip()))) {
                $signals[] = 'new_network';
            }
            if ($history->count() >= 10) {
                $tz = (string) config('app.timezone', 'Africa/Nairobi');
                $hour = (int) now()->timezone($tz)->format('G');
                $near = $history->filter(function ($s) use ($tz, $hour) {
                    $h = (int) $s->created_at->timezone($tz)->format('G');

                    return min(abs($h - $hour), 24 - abs($h - $hour)) <= 2;   // within two hours, either side of midnight too
                })->count();
                if ($near / $history->count() < 0.05) {
                    $signals[] = 'odd_hour';
                }
            }
            $country = self::country($request);
            if ($country && SecurityLog::ready()) {
                $seen = SecurityEvent::where('subject_type', 'user')->where('subject_id', $user->getKey())->where('event', 'sign_in')->where('created_at', '>=', now()->subDays(90))->latest('id')->limit(300)->get(['detail'])
                    ->map(fn ($e) => $e->detail['country'] ?? null)->filter()->unique();
                if ($seen->isNotEmpty() && ! $seen->contains($country)) {
                    $signals[] = 'new_country';
                }
            }
        }
        $email = mb_strtolower(trim((string) ($emailTried ?? $user->email)));
        if ($email !== '' && SecurityLog::ready() && SecurityEvent::where('event', 'sign_in_failed')->where('email_tried', $email)->where('created_at', '>=', now()->subHour())->count() >= 3) {
            $signals[] = 'many_failures';
        }

        $score = array_sum(array_map(fn ($s) => self::WEIGHTS[$s], $signals));
        $stronger = (int) config('security.risk.stronger_at', 2);
        $notice = (int) config('security.risk.notice_at', 1);

        return ['signals' => $signals, 'score' => $score, 'action' => $score >= $stronger ? 'stronger' : ($score >= $notice ? 'notice' : 'allow')];
    }

    /** Words for a signal, for the log and the emails. */
    public static function words(string $signal): string
    {
        return [
            'new_device' => 'a kind of browser you have not used lately',
            'new_network' => 'an internet connection you have not used lately',
            'odd_hour' => 'a time of day you do not usually sign in',
            'new_country' => 'a country you have not signed in from lately',
            'many_failures' => 'several wrong passwords just before',
        ][$signal] ?? $signal;
    }
}
