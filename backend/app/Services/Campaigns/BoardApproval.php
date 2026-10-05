<?php

namespace App\Services\Campaigns;

use App\Models\CampaignBoard;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Calendar\CalendarService;

/**
 * Official boards made by a sales rep or finance start as drafts and need approval, the same way campaigns do: their manager (or the admins) gets a
 * calendar task, approving makes the board public (if it is set public), rejecting returns it with a note, and nobody approves their own.
 * Changing an approved board as one of these roles sends it back for approval.
 */
class BoardApproval
{
    public const TASK = 'board_approval';
    public const RESULT = 'board_decision';

    public function __construct(private CalendarService $calendar, private CampaignApproval $people) {}

    public function submit(CampaignBoard $b, User $by): void
    {
        if (CampaignAccess::canPublish($by)) {
            throw new BooksException('You can publish this yourself.');
        }
        if ((int) $b->owner_user_id !== (int) $by->id) {
            throw new BooksException('Only the person who made a board can send it for approval.');
        }
        if ($b->pins()->count() === 0) {
            throw new BooksException('Add at least one pin first.');
        }
        $approvers = $this->people->approversFor((int) $b->owner_user_id);
        if (! $approvers) {
            throw new BooksException('There is nobody who can approve it yet. Ask an admin to set your manager.');
        }
        $this->clear($b);
        $b->update(['approval_status' => 'pending', 'rejected_note' => null]);
        foreach ($approvers as $a) {
            $this->calendar->put(['user_id' => $a->id, 'source_type' => self::TASK, 'source_id' => $b->id, 'kind' => 'approval', 'title' => "Approve or reject: {$by->name}'s board \"{$b->title}\"",
                'starts_at' => now()->startOfDay(), 'ends_at' => null, 'all_day' => true, 'status' => 'pending', 'visibility' => 'staff', 'url' => "/admin/boards/{$b->id}/edit", 'meta' => ['board_id' => $b->id, 'author' => $by->name]]);
        }
    }

    public function withdraw(CampaignBoard $b, User $by): void
    {
        if ($b->approval_status !== 'pending' || (int) $b->owner_user_id !== (int) $by->id) {
            throw new BooksException('Only the author can take back a board that is waiting for approval.');
        }
        $this->clear($b);
        $b->update(['approval_status' => 'draft']);
    }

    public function approve(CampaignBoard $b, User $by): void
    {
        $this->decidable($b, $by);
        $b->update(['approval_status' => 'approved', 'approved_by' => $by->id, 'approved_at' => now(), 'rejected_note' => null]);
        $this->clear($b);
        $this->tell($b, $by, 'approved', "{$by->name} approved your board \"{$b->title}\"." . ($b->visibility === 'public' ? ' It is public now.' : ' It is set to private, so only our team can see it.'));
    }

    public function reject(CampaignBoard $b, User $by, string $note): void
    {
        $this->decidable($b, $by);
        $note = trim($note);
        if ($note === '') {
            throw new BooksException('Say why it was not approved, so the author knows what to change.');
        }
        $b->update(['approval_status' => 'rejected', 'rejected_note' => mb_substr($note, 0, 500)]);
        $this->clear($b);
        $this->tell($b, $by, 'rejected', "{$by->name} did not approve your board \"{$b->title}\": " . mb_substr($note, 0, 200));
    }

    private function decidable(CampaignBoard $b, User $by): void
    {
        if (! CampaignAccess::canPublish($by)) {
            throw new BooksException('Only an admin, super admin or manager can decide this.');
        }
        if ($b->approval_status !== 'pending') {
            throw new BooksException('That board is not waiting for approval.');
        }
        if ((int) $b->owner_user_id === (int) $by->id) {
            throw new BooksException('You cannot approve your own board.');
        }
    }

    public function clear(CampaignBoard $b): void
    {
        $this->calendar->remove(self::TASK, $b->id);
        $this->calendar->remove(self::RESULT, $b->id);
    }

    private function tell(CampaignBoard $b, User $by, string $result, string $title): void
    {
        $this->calendar->put(['user_id' => $b->owner_user_id, 'source_type' => self::RESULT, 'source_id' => $b->id, 'kind' => 'approval', 'title' => $title, 'starts_at' => now()->startOfDay(), 'ends_at' => null, 'all_day' => true,
            'status' => $result, 'visibility' => 'staff', 'url' => "/admin/boards/{$b->id}/edit", 'meta' => ['board_id' => $b->id, 'decided_by' => $by->name]]);
    }
}
