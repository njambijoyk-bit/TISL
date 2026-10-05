<?php

namespace App\Services\Engagement;

use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;

/** Likes and helpful votes: one per person per thing per kind, switched on and off by pressing the same button again. */
class ReactionService
{
    public const KINDS = ['like', 'helpful'];

    public function __construct(private EngagementAccess $access, private EngagementRules $rules, private TargetResolver $targets) {}

    private function mine($q, ?User $u, ?string $guestKey)
    {
        return $q->when($u, fn ($w) => $w->where('user_id', $u->id), fn ($w) => $w->where('guest_key', $guestKey ?? 'none'));
    }

    /** @return array{on:bool,count:int} */
    public function toggle(?User $u, string $type, int $id, string $kind, ?string $guestKey): array
    {
        if (! in_array($kind, self::KINDS, true) || ! EngagementTargets::has($type, $kind)) {
            throw new BooksException('That is not available.');
        }
        if (! $this->targets->exists($type, $id)) {
            throw new BooksException('That is not available.');
        }
        $dec = $this->access->decide($u, $type, $kind, $id);
        if (! $dec['allowed']) {
            throw new BooksException($dec['reason'] ?? 'You cannot do this.');
        }
        $base = fn () => DB::table('engagement_reactions')->where('target_type', $type)->where('target_id', $id)->where('kind', $kind);
        $existing = $this->mine($base(), $u, $guestKey)->first();
        if ($existing) {
            DB::table('engagement_reactions')->where('id', $existing->id)->delete();   // taking it back is always allowed
        } else {
            $limit = $dec['rule']['daily_limit'];
            if ($limit > 0 && $this->mine(DB::table('engagement_reactions')->where('kind', $kind)->where('created_at', '>=', now()->startOfDay()), $u, $guestKey)->count() >= $limit) {
                throw new BooksException('You have reached the most you can do today. Please try again tomorrow.');
            }
            DB::table('engagement_reactions')->insert(['target_type' => $type, 'target_id' => $id, 'kind' => $kind, 'user_id' => $u?->id, 'guest_key' => $u ? null : $guestKey, 'created_at' => now()]);
        }

        return ['on' => ! $existing, 'count' => (int) $base()->count()];
    }

    /**
     * Counts and "did I" for many things at once.
     *
     * @param int[] $ids
     * @return array<int,array{like:array{count:int,mine:bool},helpful:array{count:int,mine:bool}}>
     */
    public function batch(string $type, array $ids, ?User $u, ?string $guestKey): array
    {
        $out = [];
        foreach ($ids as $id) {
            $out[$id] = ['like' => ['count' => 0, 'mine' => false], 'helpful' => ['count' => 0, 'mine' => false]];
        }
        if (! $ids || ! \Illuminate\Support\Facades\Schema::hasTable('engagement_reactions')) {
            return $out;
        }
        foreach (DB::table('engagement_reactions')->where('target_type', $type)->whereIn('target_id', $ids)->selectRaw('target_id, kind, COUNT(*) n')->groupBy('target_id', 'kind')->get() as $r) {
            $out[(int) $r->target_id][$r->kind]['count'] = (int) $r->n;
        }
        foreach ($this->mine(DB::table('engagement_reactions')->where('target_type', $type)->whereIn('target_id', $ids), $u, $guestKey)->get(['target_id', 'kind']) as $r) {
            $out[(int) $r->target_id][$r->kind]['mine'] = true;
        }

        return $out;
    }
}
