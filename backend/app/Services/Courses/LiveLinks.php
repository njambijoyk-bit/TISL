<?php

namespace App\Services\Courses;

use App\Models\Courses\LiveSession;
use Illuminate\Support\Carbon;

/** What a person is allowed to see of a live session. The join link, meeting id and passcode appear only to people with access, from a little before the start until a little after the end. */
class LiveLinks
{
    /** Which provider a link belongs to, from its address. */
    public function providerOf(?string $url): string
    {
        $host = strtolower((string) parse_url((string) $url, PHP_URL_HOST));
        foreach (['zoom' => ['zoom.us', 'zoom.com'], 'meet' => ['meet.google.com'], 'teams' => ['teams.microsoft.com', 'teams.live.com']] as $p => $hosts) {
            foreach ($hosts as $h) {
                if ($host === $h || str_ends_with($host, '.'.$h)) {
                    return $p;
                }
            }
        }

        return 'other';
    }

    /** @return array<string, mixed> what everybody may see */
    public function publicView(LiveSession $l): array
    {
        return ['id' => $l->id, 'starts_at' => $l->starts_at->toIso8601String(), 'ends_at' => $l->ends_at->toIso8601String(), 'timezone' => $l->timezone, 'provider' => $l->provider,
            'provider_label' => LiveSession::PROVIDERS[$l->provider] ?? $l->provider, 'capacity' => $l->capacity];
    }

    /**
     * What a person with access sees: the state (upcoming, open, over), and the link when it is open; the replay after it ends.
     *
     * @return array<string, mixed>
     */
    public function memberView(LiveSession $l, ?Carbon $at = null): array
    {
        $at ??= now();
        $s = CourseSettings::all();
        $opens = $l->starts_at->copy()->subMinutes((int) $s['live_open_minutes']);
        $closes = $l->ends_at->copy()->addMinutes((int) $s['live_grace_minutes']);
        $state = $at->lt($opens) ? 'upcoming' : ($at->lte($closes) ? 'open' : 'over');
        $out = $this->publicView($l) + ['state' => $state, 'opens_at' => $opens->toIso8601String(), 'join_url' => null, 'meeting_id' => null, 'passcode' => null, 'replay_url' => null];
        if ($state === 'open') {
            $out['join_url'] = $l->join_url;
            $out['meeting_id'] = $l->meeting_id;
            $out['passcode'] = $l->passcode;
        }
        if ($state === 'over') {
            $out['replay_url'] = $l->replay_url;
        }

        return $out;
    }

    /** What staff see when they prepare it: everything. @return array<string, mixed> */
    public function staffView(LiveSession $l): array
    {
        return $this->publicView($l) + ['join_url' => $l->join_url, 'meeting_id' => $l->meeting_id, 'passcode' => $l->passcode, 'replay_url' => $l->replay_url, 'lesson_id' => $l->lesson_id];
    }
}
