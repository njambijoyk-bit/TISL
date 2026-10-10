<?php

namespace App\Services\Security;

/** What kind of browser this is, in words a person recognises ("Chrome on Windows"), and a key to tell whether it has been seen before. Not a fingerprint: it only says the kind. */
final class DeviceInfo
{
    /** @return array{label: string, key: string} */
    public static function describe(?string $userAgent): array
    {
        $ua = (string) $userAgent;
        // order matters: Edge and Opera also say Chrome, Chrome also says Safari, an iPhone also says Mac, an Android phone also says Linux
        $browser = match (true) {
            str_contains($ua, 'Edg/') || str_contains($ua, 'EdgA/') || str_contains($ua, 'EdgiOS/') => 'Edge',
            str_contains($ua, 'OPR/') || str_contains($ua, 'Opera') => 'Opera',
            str_contains($ua, 'Firefox/') || str_contains($ua, 'FxiOS/') => 'Firefox',
            str_contains($ua, 'SamsungBrowser/') => 'Samsung Internet',
            str_contains($ua, 'Chrome/') || str_contains($ua, 'CriOS/') => 'Chrome',
            str_contains($ua, 'Safari/') => 'Safari',
            default => 'A browser',
        };
        $os = match (true) {
            str_contains($ua, 'Windows') => 'Windows',
            str_contains($ua, 'Android') => 'Android',
            str_contains($ua, 'iPhone') => 'iPhone',
            str_contains($ua, 'iPad') => 'iPad',
            str_contains($ua, 'CrOS') => 'ChromeOS',
            str_contains($ua, 'Macintosh') || str_contains($ua, 'Mac OS X') => 'Mac',
            str_contains($ua, 'Linux') => 'Linux',
            default => 'an unknown device',
        };
        $label = "{$browser} on {$os}";

        return ['label' => $label, 'key' => sha1(strtolower($label))];
    }
}
