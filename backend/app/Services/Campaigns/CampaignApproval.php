<?php

namespace App\Services\Campaigns;

use App\Models\Campaign;
use App\Models\Employee;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Calendar\CalendarService;

/**
 * Sales rep and finance build campaigns as drafts and send them for approval. Their manager (from the employee record) gets a calendar task
 * "Approve or reject ...", or, with no manager, the admins do. Admin, super admin and manager can approve; nobody approves their own.
 * Approving publishes the campaign (it then follows its dates); rejecting returns it to the author with a note. The author sees the decision on their calendar.
 */
class CampaignApproval
{
    public const TASK = 'campaign_approval';
    public const RESULT = 'campaign_decision';

    public function __construct(private CalendarService $calendar) {}

    /** Who is asked: the author's manager if they have one who can approve, otherwise every admin and super admin. @return User[] */
    public function approvers(Campaign $c): array
    {
        $manager = Employee::where('user_id', $c->created_by)->first()?->manager?->user;
        if ($manager && CampaignAccess::canPublish($manager) && (int) $manager->id !== (int) $c->created_by) {
            return [$manager];
        }

        return User::whereIn('role', ['admin', 'super_admin'])->where('id', '!=', $c->created_by)->get()->all();
    }

    /** The author sends a draft (or a rejected campaign) for approval. */
    public function submit(Campaign $c, User $by): void
    {
        if (CampaignAccess::canPublish($by)) {
            throw new BooksException('You can publish this yourself.');
        }
        if (! CampaignAccess::canEdit($by, $c)) {
            throw new BooksException('Only the person who made a draft can send it for approval.');
        }
        if ($c->sections()->count() === 0) {
            throw new BooksException('Build the page first: add at least one section.');
        }
        $approvers = $this->approvers($c);
        if (! $approvers) {
            throw new BooksException('There is nobody who can approve it yet. Ask an admin to set your manager.');
        }
        $this->clear($c);
        $c->update(['approval_status' => 'pending', 'rejected_note' => null, 'updated_by' => $by->id]);
        foreach ($approvers as $a) {
            $this->calendar->put(['user_id' => $a->id, 'source_type' => self::TASK, 'source_id' => $c->id, 'kind' => 'approval', 'title' => "Approve or reject: {$by->name}'s campaign \"{$c->title}\"",
                'starts_at' => now()->startOfDay(), 'ends_at' => null, 'all_day' => true, 'status' => 'pending', 'visibility' => 'staff', 'url' => "/admin/campaigns/{$c->id}/edit", 'meta' => ['campaign_id' => $c->id, 'author' => $by->name]]);
        }
    }

    /** The author takes it back before anyone has decided. */
    public function withdraw(Campaign $c, User $by): void
    {
        if ($c->approval_status !== 'pending' || (int) $c->created_by !== (int) $by->id) {
            throw new BooksException('Only the author can take back a campaign that is waiting for approval.');
        }
        $this->clear($c);
        $c->update(['approval_status' => 'draft', 'updated_by' => $by->id]);
    }

    public function approve(Campaign $c, User $by): void
    {
        $this->decidable($c, $by);
        $c->update(['approval_status' => 'approved', 'approved_by' => $by->id, 'approved_at' => now(), 'rejected_note' => null, 'is_published' => true, 'published_at' => $c->published_at ?? now(), 'is_paused' => false, 'archived_at' => null, 'updated_by' => $by->id]);
        $this->clear($c);
        $this->tell($c, $by, 'approved', "{$by->name} approved \"{$c->title}\". It is published and follows its dates.");
    }

    public function reject(Campaign $c, User $by, string $note): void
    {
        $this->decidable($c, $by);
        $note = trim($note);
        if ($note === '') {
            throw new BooksException('Say why it was not approved, so the author knows what to change.');
        }
        $c->update(['approval_status' => 'rejected', 'rejected_note' => mb_substr($note, 0, 500), 'is_published' => false, 'updated_by' => $by->id]);
        $this->clear($c);
        $this->tell($c, $by, 'rejected', "{$by->name} did not approve \"{$c->title}\": " . mb_substr($note, 0, 200));
    }

    private function decidable(Campaign $c, User $by): void
    {
        if (! CampaignAccess::canPublish($by)) {
            throw new BooksException('Only an admin, super admin or manager can decide this.');
        }
        if ($c->approval_status !== 'pending') {
            throw new BooksException('That campaign is not waiting for approval.');
        }
        if ((int) $c->created_by === (int) $by->id) {
            throw new BooksException('You cannot approve your own campaign.');
        }
    }

    /** Take the approval tasks (and the last decision note) off the calendars. */
    public function clear(Campaign $c): void
    {
        $this->calendar->remove(self::TASK, $c->id);
        $this->calendar->remove(self::RESULT, $c->id);
    }

    /** Put the decision on the author's calendar for today. */
    private function tell(Campaign $c, User $by, string $result, string $title): void
    {
        if (! $c->created_by) {
            return;
        }
        $this->calendar->put(['user_id' => $c->created_by, 'source_type' => self::RESULT, 'source_id' => $c->id, 'kind' => 'approval', 'title' => $title, 'starts_at' => now()->startOfDay(), 'ends_at' => null, 'all_day' => true,
            'status' => $result, 'visibility' => 'staff', 'url' => "/admin/campaigns/{$c->id}/edit", 'meta' => ['campaign_id' => $c->id, 'decided_by' => $by->name]]);
    }
}
