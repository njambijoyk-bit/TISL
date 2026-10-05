<?php

namespace App\Services\Engagement;

use App\Services\Licensing\LicenseManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Review numbers (average, count, how many of each star) read from published reviews. Everything returns nothing when the engine is off, Extras is off,
 * or reviews are switched off for that kind of thing, so ratings vanish from the storefront with the controls. Products and services also keep a copy
 * of the average and count on their own row (so lists need no extra query); `refresh` rewrites it.
 */
class ReviewSummary
{
    public function __construct(private EngagementRules $rules) {}

    /** Are reviews showing for this kind of thing right now? */
    public function on(string $type): bool
    {
        if (! Schema::hasTable('engagement_posts') || ! app(LicenseManager::class)->isActive('extras') || ! EngagementTargets::available($type)) {
            return false;
        }

        return $this->rules->settings()->enabled && ($this->rules->rule($type, 'review')['enabled'] ?? false);
    }

    /** @return array{count:int,average:?float,breakdown:array<int,int>} */
    public function of(string $type, int $id): array
    {
        $empty = ['count' => 0, 'average' => null, 'breakdown' => [5 => 0, 4 => 0, 3 => 0, 2 => 0, 1 => 0]];
        if (! $this->on($type)) {
            return $empty;
        }
        $rows = DB::table('engagement_posts')->where('target_type', $type)->where('target_id', $id)->where('kind', 'review')->where('status', 'published')->whereNull('deleted_at')
            ->selectRaw('rating, COUNT(*) as n')->groupBy('rating')->pluck('n', 'rating');
        $count = (int) $rows->sum();
        $sum = $rows->reduce(fn ($c, $n, $r) => $c + $r * $n, 0);

        return ['count' => $count, 'average' => $count ? round($sum / $count, 1) : null, 'breakdown' => [5 => (int) ($rows[5] ?? 0), 4 => (int) ($rows[4] ?? 0), 3 => (int) ($rows[3] ?? 0), 2 => (int) ($rows[2] ?? 0), 1 => (int) ($rows[1] ?? 0)]];
    }

    /** Count and average for many at once. @param int[] $ids @return array<int,array{count:int,average:?float}> */
    public function many(string $type, array $ids): array
    {
        $out = [];
        if (! $this->on($type) || ! $ids) {
            return $out;
        }
        foreach (DB::table('engagement_posts')->where('target_type', $type)->whereIn('target_id', $ids)->where('kind', 'review')->where('status', 'published')->whereNull('deleted_at')
            ->selectRaw('target_id, COUNT(*) as n, AVG(rating) as a')->groupBy('target_id')->get() as $r) {
            $out[(int) $r->target_id] = ['count' => (int) $r->n, 'average' => round((float) $r->a, 1)];
        }

        return $out;
    }

    /** Rewrite the copy kept on the product or service row, whatever the switches say (they only decide what is shown). */
    public function refresh(string $type, int $id): void
    {
        if (! Schema::hasTable('engagement_posts') || ! in_array($type, ['product', 'service'], true)) {
            return;
        }
        $r = DB::table('engagement_posts')->where('target_type', $type)->where('target_id', $id)->where('kind', 'review')->where('status', 'published')->whereNull('deleted_at')
            ->selectRaw('COUNT(*) as n, AVG(rating) as a')->first();
        $n = (int) ($r->n ?? 0);
        $a = $n ? round((float) $r->a, 2) : 0;
        if ($type === 'product') {
            DB::table('products')->where('id', $id)->update(['rating' => $a, 'reviews' => $n]);   // straight to the table: a review is not an edit of the product
        } else {
            DB::table('services')->where('id', $id)->update(['rating' => $a, 'review_count' => $n]);
        }
    }
}
