<?php

namespace App\Services\Campaigns;

use App\Models\CampaignMoodboard;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Calendar\CalendarService;

/**
 * Moodboards made by a sales rep or finance start as drafts and need approval, the same way boards and campaigns do: their manager (or the admins) gets a
 * calendar task, approving makes the moodboard public, rejecting returns it with a note, and nobody approves their own.
 * Changing an approved moodboard as one of these roles sends it back for approval.
 */
class MoodboardApproval
{
    public const TASK = 'moodboard_approval';
    public const RESULT = 'moodboard_decision';

    public function __construct(private CalendarService $calendar, private CampaignApproval $people) {}

    public function submit(CampaignMoodboard $b, User $by): void
    {
        if (CampaignAccess::canPublish($by)) {
            throw new BooksException('You can publish this yourself.');
        }
        if ((int) $b->owner_user_id !== (int) $by->id) {
            throw new BooksException('Only the person who made a moodboard can send it for approval.');
        }
        if (! array_filter($b->contents ?? [])) {
            throw new BooksException('Fill at least one spot first.');
        }
        $approvers = $this->people->approversFor((int) $b->owner_user_id);
        if (! $approvers) {
            throw new BooksException('There is nobody who can approve it yet. Ask an admin to set your manager.');
        }
        $this->clear($b);
        $b->update(['approval_status' => 'pending', 'rejected_note' => null]);
        foreach ($approvers as $a) {
            $this->calendar->put(['user_id' => $a->id, 'source_type' => self::TASK, 'source_id' => $b->id, 'kind' => 'approval', 'title' => "Approve or reject: {$by->name}'s moodboard \"{$b->title}\"",
                'starts_at' => now()->startOfDay(), 'ends_at' => null, 'all_day' => true, 'status' => 'pending', 'visibility' => 'staff', 'url' => "/admin/moodboards/{$b->id}/edit", 'meta' => ['moodboard_id' => $b->id, 'author' => $by->name]]);
        }
    }

    public function withdraw(CampaignMoodboard $b, User $by): void
    {
        if ($b->approval_status !== 'pending' || (int) $b->owner_user_id !== (int) $by->id) {
            throw new BooksException('Only the author can take back a moodboard that is waiting for approval.');
        }
        $this->clear($b);
        $b->update(['approval_status' => 'draft']);
    }

    public function approve(CampaignMoodboard $b, User $by): void
    {
        $this->decidable($b, $by);
        $b->update(['approval_status' => 'approved', 'approved_by' => $by->id, 'approved_at' => now(), 'rejected_note' => null]);
        $this->clear($b);
        $this->tell($b, $by, 'approved', "{$by->name} approved your moodboard \"{$b->title}\"." . (' It is public now.'));
    }

    public function reject(CampaignMoodboard $b, User $by, string $note): void
    {
        $this->decidable($b, $by);
        $note = trim($note);
        if ($note === '') {
            throw new BooksException('Say why it was not approved, so the author knows what to change.');
        }
        $b->update(['approval_status' => 'rejected', 'rejected_note' => mb_substr($note, 0, 500)]);
        $this->clear($b);
        $this->tell($b, $by, 'rejected', "{$by->name} did not approve your moodboard \"{$b->title}\": " . mb_substr($note, 0, 200));
    }

    private function decidable(CampaignMoodboard $b, User $by): void
    {
        if (! CampaignAccess::canPublish($by)) {
            throw new BooksException('Only an admin, super admin or manager can decide this.');
        }
        if ($b->approval_status !== 'pending') {
            throw new BooksException('That moodboard is not waiting for approval.');
        }
        if ((int) $b->owner_user_id === (int) $by->id) {
            throw new BooksException('You cannot approve your own moodboard.');
        }
    }

    public function clear(CampaignMoodboard $b): void
    {
        $this->calendar->remove(self::TASK, $b->id);
        $this->calendar->remove(self::RESULT, $b->id);
    }

    private function tell(CampaignMoodboard $b, User $by, string $result, string $title): void
    {
        $this->calendar->put(['user_id' => $b->owner_user_id, 'source_type' => self::RESULT, 'source_id' => $b->id, 'kind' => 'approval', 'title' => $title, 'starts_at' => now()->startOfDay(), 'ends_at' => null, 'all_day' => true,
            'status' => $result, 'visibility' => 'staff', 'url' => "/admin/moodboards/{$b->id}/edit", 'meta' => ['moodboard_id' => $b->id, 'decided_by' => $by->name]]);
    }
}
