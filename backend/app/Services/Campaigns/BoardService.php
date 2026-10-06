<?php

namespace App\Services\Campaigns;

use App\Models\CampaignBoard;
use App\Models\CampaignPin;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;

/**
 * Boards: make and change them, put pins on them and take pins off, order them, hide them. Staff boards are official; a sales rep's or finance user's
 * official board starts as a draft and needs approval (BoardApproval). Customers' personal boards use the same code later.
 */
class BoardService
{
    public function __construct(private BoardApproval $approval) {}

    /** Staff may change a board if they publish, or it is theirs and not waiting for a decision. */
    public function canEdit(?User $u, CampaignBoard $b): bool
    {
        if (! $b->is_official && (! $u || (int) $b->owner_user_id !== (int) $u->id)) {
            return false;   // a customer's board is theirs: staff can look (logged), hide or delete it, but not change it
        }
        if (CampaignAccess::canPublish($u)) {
            return true;
        }

        return CampaignAccess::canBuild($u) && (int) $b->owner_user_id === (int) $u->id && $b->approval_status !== 'pending';
    }

    private function clean(array $d): array
    {
        $c = [];
        if (array_key_exists('title', $d)) {
            $t = trim((string) $d['title']);
            if ($t === '') {
                throw new BooksException('Give the board a name.');
            }
            $c['title'] = mb_substr($t, 0, 160);
        }
        if (array_key_exists('description', $d)) {
            $c['description'] = ($d['description'] === null || trim((string) $d['description']) === '') ? null : mb_substr(trim((string) $d['description']), 0, 500);
        }
        if (array_key_exists('visibility', $d)) {
            $c['visibility'] = $d['visibility'] === 'public' ? 'public' : 'private';
        }
        if (array_key_exists('campaign_id', $d)) {
            $c['campaign_id'] = $d['campaign_id'] ?: null;
        }

        return $c;
    }

    public function create(array $d, User $by, bool $official = true): CampaignBoard
    {
        $c = $this->clean($d + ['title' => $d['title'] ?? '']);
        $publisher = CampaignAccess::canPublish($by);

        return CampaignBoard::create($c + ['visibility' => $c['visibility'] ?? 'public', 'owner_user_id' => $by->id, 'is_official' => $official, 'status' => 'visible',
            'approval_status' => $official && ! $publisher ? 'draft' : 'approved', 'approved_by' => $official && $publisher ? $by->id : null, 'approved_at' => $official && $publisher ? now() : null]);
    }

    public function update(CampaignBoard $b, array $d, User $by): CampaignBoard
    {
        $c = $this->clean($d);
        if (array_key_exists('cover_pin_id', $d)) {
            $cover = $d['cover_pin_id'] ? (int) $d['cover_pin_id'] : null;
            if ($cover && ! $b->pins()->where('campaign_pins.id', $cover)->exists()) {
                throw new BooksException('The cover must be a pin that is on the board.');
            }
            $c['cover_pin_id'] = $cover;
        }
        $b->update($c);
        $this->changed($b, $by);

        return $b->fresh();
    }

    /** @param int[] $pinIds */
    public function addPins(CampaignBoard $b, array $pinIds, User $by): CampaignBoard
    {
        $pinIds = array_values(array_unique(array_map('intval', $pinIds)));
        $found = CampaignPin::whereIn('id', $pinIds)->where('status', 'visible')->pluck('id')->all();
        if (count($found) !== count($pinIds)) {
            throw new BooksException('One of those pins is hidden or no longer exists.');
        }
        DB::transaction(function () use ($b, $found) {
            $pos = (int) DB::table('campaign_board_pins')->where('board_id', $b->id)->max('position');
            foreach ($found as $id) {
                if (! DB::table('campaign_board_pins')->where('board_id', $b->id)->where('pin_id', $id)->exists()) {
                    DB::table('campaign_board_pins')->insert(['board_id' => $b->id, 'pin_id' => $id, 'position' => ++$pos, 'added_by' => auth()->id(), 'created_at' => now()]);
                }
            }
            if (! $b->cover_pin_id && $found) {
                $b->update(['cover_pin_id' => $found[0]]);
            }
        });
        $this->changed($b, $by);

        return $b->fresh();
    }

    public function removePin(CampaignBoard $b, int $pinId, User $by): CampaignBoard
    {
        DB::table('campaign_board_pins')->where('board_id', $b->id)->where('pin_id', $pinId)->delete();
        if ((int) $b->cover_pin_id === $pinId) {
            $b->update(['cover_pin_id' => DB::table('campaign_board_pins')->where('board_id', $b->id)->orderBy('position')->value('pin_id')]);
        }
        $this->changed($b, $by);

        return $b->fresh();
    }

    /** @param int[] $ids the board's pin ids in the new order */
    public function reorder(CampaignBoard $b, array $ids, User $by): void
    {
        foreach (array_values($ids) as $i => $id) {
            DB::table('campaign_board_pins')->where('board_id', $b->id)->where('pin_id', (int) $id)->update(['position' => $i + 1]);
        }
        $this->changed($b, $by);
    }

    /** A sales rep or finance user changing an approved official board sends it back for approval. */
    private function changed(CampaignBoard $b, User $by): void
    {
        if ($b->is_official && ! CampaignAccess::canPublish($by) && $b->approval_status === 'approved') {
            try {
                $this->approval->submit($b->fresh(), $by);
            } catch (BooksException) {
                $b->update(['approval_status' => 'draft']);   // nobody can approve it right now: back to a draft rather than left public and changed
            }
        }
    }

    public function hide(CampaignBoard $b, ?string $reason): void
    {
        $b->update(['status' => 'hidden', 'hidden_reason' => $reason ? mb_substr(trim($reason), 0, 255) : null]);
    }

    public function unhide(CampaignBoard $b): void
    {
        $b->update(['status' => 'visible', 'hidden_reason' => null]);
    }

    /** Move a board to the recycle bin. Its pins stay in the library; its places on the board and its followers are kept so Restore brings it back whole. */
    public function destroy(CampaignBoard $b): void
    {
        $this->approval->clear($b);
        $b->delete();
    }

    public function restore(CampaignBoard $b): void
    {
        $b->restore();
        if ($b->approval_status === 'pending') {
            $b->update(['approval_status' => 'draft']);   // its approval task went when it was deleted, so it has to be sent again
        }
    }

    /** Delete a board for good: its places, followers, comments and likes. The pins themselves are never touched. */
    public function purge(CampaignBoard $b): void
    {
        $this->approval->clear($b);
        DB::table('campaign_board_pins')->where('board_id', $b->id)->delete();
        DB::table('campaign_board_follows')->where('board_id', $b->id)->delete();
        app(PinService::class)->forgetTarget('board', $b->id);
        $b->forceDelete();
    }
}
