<?php

namespace App\Services\Campaigns;

use Illuminate\Validation\ValidationException;

/**
 * Turns a pasted video link into a safe embed address. Only YouTube, Vimeo, TikTok and Facebook are accepted; anything else is refused,
 * so a campaign page can never embed an arbitrary site. The embed address is worked out here, on the server, and stored.
 */
class VideoEmbed
{
    /** @return array{provider:string,url:string,embed_url:string,thumb:?string} */
    public static function parse(string $url): array
    {
        $url = trim($url);
        $p = parse_url($url);
        $host = strtolower(preg_replace('/^(www\.|m\.)/', '', $p['host'] ?? ''));
        $path = $p['path'] ?? '';
        parse_str($p['query'] ?? '', $q);
        if (! in_array($p['scheme'] ?? '', ['http', 'https'], true) || $host === '') {
            self::fail('That is not a web link.');
        }

        if (in_array($host, ['youtube.com', 'youtu.be', 'youtube-nocookie.com'], true)) {
            $id = $host === 'youtu.be' ? ltrim($path, '/') : ($q['v'] ?? (preg_match('#^/(?:shorts|embed|live)/([^/?]+)#', $path, $m) ? $m[1] : ''));
            if (! preg_match('/^[A-Za-z0-9_-]{11}$/', $id)) {
                self::fail('That YouTube link has no video in it.');
            }

            return ['provider' => 'youtube', 'url' => $url, 'embed_url' => "https://www.youtube-nocookie.com/embed/{$id}", 'thumb' => "https://i.ytimg.com/vi/{$id}/hqdefault.jpg"];
        }
        if (in_array($host, ['vimeo.com', 'player.vimeo.com'], true)) {
            if (! preg_match('#/(?:video/)?(\d{5,})#', $path, $m)) {
                self::fail('That Vimeo link has no video in it.');
            }

            return ['provider' => 'vimeo', 'url' => $url, 'embed_url' => "https://player.vimeo.com/video/{$m[1]}", 'thumb' => null];
        }
        if ($host === 'tiktok.com' || str_ends_with($host, '.tiktok.com')) {
            if (! preg_match('#/video/(\d{8,})#', $path, $m)) {
                self::fail('Use the full TikTok link (open the video in TikTok and copy its link, which has /video/ and a number).');
            }

            return ['provider' => 'tiktok', 'url' => $url, 'embed_url' => "https://www.tiktok.com/embed/v2/{$m[1]}", 'thumb' => null];
        }
        if (in_array($host, ['facebook.com', 'fb.watch'], true)) {
            if ($host === 'facebook.com' && ! preg_match('#/(videos|reel|watch)#', $path)) {
                self::fail('That Facebook link is not a video.');
            }

            return ['provider' => 'facebook', 'url' => $url, 'embed_url' => 'https://www.facebook.com/plugins/video.php?show_text=false&href=' . urlencode($url), 'thumb' => null];
        }
        self::fail('Only YouTube, Vimeo, TikTok and Facebook video links can be used, or upload a video file.');
    }

    private static function fail(string $message): never
    {
        throw ValidationException::withMessages(['url' => [$message]]);
    }
}
