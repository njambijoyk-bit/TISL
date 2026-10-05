<?php

namespace App\Services\Engagement;

/** Starting points for the rules. Applying one fills every rule; each can then be changed. */
class EngagementPresets
{
    public const BASE = ['enabled' => false, 'who' => 'signed_in', 'must_have_bought' => false, 'hold' => 'never', 'one_per_person' => true, 'edit_minutes' => 30, 'min_words' => 0, 'photos' => false, 'daily_limit' => 0];

    public const ALL = [
        'verified_buyers' => ['label' => 'Verified buyers', 'about' => 'Only people who bought a product, service or hamper can review it, and every review waits for approval. Signed-in people can like, mark helpful and report. Guests only read.'],
        'open_community' => ['label' => 'Open community', 'about' => 'Any signed-in person can review, comment, reply, like and report without buying. A person\'s first post waits for approval.'],
        'brand_wall' => ['label' => 'Brand wall', 'about' => 'As Verified buyers, and signed-in people can also comment on pins, boards, moodboards and campaigns (held for approval).'],
        'read_only' => ['label' => 'Read only', 'about' => 'Nothing can be posted or liked. Signed-in people can still report.'],
    ];

    /** The rule for one target and action under a preset. @return array<string,mixed> */
    public static function rule(string $preset, string $type, string $action): array
    {
        $r = self::BASE;
        $t = EngagementTargets::find($type);
        if (! $t || ! EngagementTargets::has($type, $action)) {
            return $r;
        }
        $commerce = $t['commerce'];
        if ($preset === 'read_only') {
            return ['enabled' => $action === 'report'] + $r;
        }
        if ($action === 'report' || $action === 'like' || $action === 'helpful') {
            return ['enabled' => true] + $r;
        }
        if ($action === 'review') {
            return $preset === 'open_community'
                ? ['enabled' => true, 'hold' => 'first', 'min_words' => 3, 'photos' => $type === 'product'] + $r
                : ['enabled' => true, 'who' => 'customers', 'must_have_bought' => true, 'hold' => 'always', 'min_words' => 3, 'photos' => $type === 'product', 'daily_limit' => 5] + $r;
        }
        if ($action === 'comment') {
            $on = $preset === 'open_community' || ($preset === 'brand_wall' && ! $commerce);

            return ['enabled' => $on, 'hold' => $preset === 'open_community' ? 'first' : 'always', 'min_words' => 1] + $r;
        }
        if ($action === 'reply') {
            return ['enabled' => $preset === 'open_community', 'hold' => 'first', 'min_words' => 1] + $r;
        }

        return $r;
    }

    /** @return array<string,array<string,array>> every rule under a preset, by target then action */
    public static function rules(string $preset): array
    {
        $out = [];
        foreach (EngagementTargets::all() as $type => $t) {
            foreach ($t['actions'] as $a) {
                $out[$type][$a] = self::rule($preset, $type, $a);
            }
        }

        return $out;
    }
}
