<?php

namespace App\Services\Campaigns;

use App\Models\CampaignBoard;
use App\Models\CampaignPin;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * What the public may see. A pin is public when it is visible and either sits on a public, approved, visible board, or was made by an admin,
 * super admin or manager and sits on no board at all. (A sales rep's or finance user's pin is public only through an approved board.)
 * A board is public when it is public, approved and visible.
 */
class Feed
{
    public const PAGE = 30;

    /** Boards the public can see. */
    public function publicBoards(): Builder
    {
        return CampaignBoard::where('visibility', 'public')->where('status', 'visible')->where('approval_status', 'approved');
    }

    private function onPublicBoard(): \Closure
    {
        return fn ($q) => $q->select(DB::raw(1))->from('campaign_board_pins as bp')->join('campaign_boards as b', 'b.id', '=', 'bp.board_id')
            ->whereColumn('bp.pin_id', 'campaign_pins.id')->whereNull('b.deleted_at')
            ->where('b.visibility', 'public')->where('b.status', 'visible')->where('b.approval_status', 'approved');
    }

    /** Pins the public can see. */
    public function publicPins(): Builder
    {
        return CampaignPin::where('campaign_pins.status', 'visible')->where(function ($w) {
            $w->whereExists($this->onPublicBoard())
                ->orWhere(fn ($x) => $x->where('campaign_pins.source', 'staff')
                    ->whereIn('campaign_pins.owner_user_id', fn ($u) => $u->select('id')->from('users')->whereIn('role', CampaignAccess::PUBLISHERS))
                    ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('campaign_board_pins as any_bp')->whereColumn('any_bp.pin_id', 'campaign_pins.id')));
        });
    }

    /** Public pins from the public boards this person follows. */
    public function followingPins(int $userId): Builder
    {
        return $this->publicPins()->whereExists(fn ($q) => $q->select(DB::raw(1))->from('campaign_board_pins as fp')
            ->join('campaign_board_follows as f', 'f.board_id', '=', 'fp.board_id')
            ->join('campaign_boards as fb', 'fb.id', '=', 'fp.board_id')
            ->whereColumn('fp.pin_id', 'campaign_pins.id')->where('f.user_id', $userId)->whereNull('fb.deleted_at')
            ->where('fb.visibility', 'public')->where('fb.status', 'visible')->where('fb.approval_status', 'approved'));
    }

    /** Newest first, `after` is the last id seen. Search looks in title, caption and credit; a tag is an exact word. */
    public function page(Builder $q, ?int $after, ?string $search, ?string $tag): array
    {
        $q->when($after, fn ($w) => $w->where('campaign_pins.id', '<', $after))
            ->when($search !== null && $search !== '', fn ($w) => $w->where(fn ($x) => $x->where('title', 'like', "%{$search}%")->orWhere('caption', 'like', "%{$search}%")->orWhere('credit', 'like', "%{$search}%")))
            ->when($tag !== null && $tag !== '', fn ($w) => $w->where('tags', 'like', '%' . json_encode(mb_strtolower($tag), JSON_UNESCAPED_UNICODE) . '%'));
        $rows = $q->orderByDesc('campaign_pins.id')->limit(self::PAGE + 1)->get();
        $more = $rows->count() > self::PAGE;
        $rows = $rows->take(self::PAGE);

        return [$rows, $more ? $rows->last()->id : null];
    }
}
