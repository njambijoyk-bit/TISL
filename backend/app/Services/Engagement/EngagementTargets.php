<?php

namespace App\Services\Engagement;

use App\Services\Licensing\LicenseManager;

/**
 * What people can engage with, and which actions each kind of thing offers. The rules for each pair (who, whether they must have bought it, whether
 * posts are held) are settings (EngagementRules), not code. "post" is a review or a comment, so replies, helpful votes, likes and reports work on them too.
 */
class EngagementTargets
{
    public const WHO = ['everyone' => 'Everyone, including guests', 'signed_in' => 'Signed-in people', 'customers' => 'Customers only', 'staff' => 'Staff only'];
    public const HOLD = ['never' => 'Show straight away', 'always' => 'Hold every one for approval', 'first' => "Hold a person's first one", 'guests' => 'Hold guests only'];

    /** Which settings each action has (the page only shows these). */
    public const ACTIONS = [
        'review' => ['label' => 'Write a review', 'fields' => ['who', 'must_have_bought', 'hold', 'one_per_person', 'edit_minutes', 'min_words', 'photos', 'daily_limit']],
        'comment' => ['label' => 'Comment', 'fields' => ['who', 'hold', 'edit_minutes', 'min_words', 'daily_limit']],
        'reply' => ['label' => 'Reply', 'fields' => ['who', 'hold', 'edit_minutes', 'min_words', 'daily_limit']],
        'like' => ['label' => 'Like', 'fields' => ['who', 'daily_limit']],
        'helpful' => ['label' => 'Mark helpful', 'fields' => ['who', 'daily_limit']],
        'report' => ['label' => 'Report', 'fields' => ['who', 'daily_limit']],
    ];

    /** @return array<string,array{label:string,module:?string,commerce:bool,actions:string[]}> */
    public static function all(): array
    {
        $sell = fn (string $label) => ['label' => $label, 'module' => 'ecommerce', 'commerce' => true, 'actions' => ['review', 'comment', 'like', 'report']];
        $brand = fn (string $label) => ['label' => $label, 'module' => 'campaigns', 'commerce' => false, 'actions' => ['comment', 'like', 'report']];

        return [
            'product' => $sell('Products'), 'service' => $sell('Services'), 'hamper' => $sell('Hampers'),
            'pin' => $brand('Pins'), 'board' => $brand('Boards'), 'moodboard' => $brand('Moodboards'), 'campaign' => $brand('Campaigns'),
            'post' => ['label' => 'Reviews and comments', 'module' => null, 'commerce' => false, 'actions' => ['reply', 'helpful', 'like', 'report']],
        ];
    }

    public static function find(string $type): ?array
    {
        return self::all()[$type] ?? null;
    }

    public static function has(string $type, string $action): bool
    {
        return in_array($action, self::find($type)['actions'] ?? [], true);
    }

    /** Is the module that owns this kind of thing switched on? Extras itself is checked by the routes (module:extras). */
    public static function available(string $type): bool
    {
        $t = self::find($type);
        if (! $t) {
            return false;
        }
        if ($t['module'] === null) {
            return true;
        }

        return app(LicenseManager::class)->isActive($t['module']);
    }
}
