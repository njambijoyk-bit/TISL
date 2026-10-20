<?php

namespace App\Services\Tenders;

use App\Models\Extras\Tender;
use App\Models\Extras\TenderMailing;
use App\Models\User;
use App\Models\Vendor;
use App\Services\Notify\Notifier;
use Illuminate\Support\Collection;

/**
 * Tells the vendors a tender is meant for, through the existing notification system (a bell item, and an email when the company has email switched on).
 * The message carries a link, never the files, so a restricted tender is not passed round by email: the link needs a sign-in.
 */
class TenderNotices
{
    public function __construct(private Notifier $notifier) {}

    /**
     * The vendors who should hear about this tender: active vendors with a login; for a pre-qualified-only tender those currently pre-qualified for its category;
     * for an invited tender those invited; and when the tender (or every lot of it) is reserved to a people category, only vendors in one of those categories.
     */
    public function eligibleVendors(Tender $tender): Collection
    {
        $q = Vendor::query()->where('status', 'active')->whereNotNull('user_id');

        if ($tender->visibility === 'invited') {
            $q->whereIn('id', $tender->invitations()->pluck('vendor_id'));
        } elseif ($tender->visibility === 'prequalified') {
            $q->whereHas('prequalifications', fn ($p) => $p->current()->where('category', $tender->category));
        }

        $lots = $tender->lots()->get();
        $groups = $tender->reservation_scheme ? [$tender->reservation_scheme] : [];
        // reserved only when nothing in it is open to everyone: the tender itself, or every one of its lots
        if (! $groups && $lots->isNotEmpty() && $lots->every(fn ($l) => $l->reservation_group)) {
            $groups = $lots->pluck('reservation_group')->unique()->all();
        }
        if ($groups) {
            $q->whereIn('special_group', $groups);
        }

        return $q->orderBy('company_name')->get(['id', 'user_id', 'company_name', 'special_group']);
    }

    /** @return int how many vendors were told */
    public function send(Tender $tender, string $kind, ?string $note, ?User $by): int
    {
        $isAddendum = $kind === 'addendum';
        $type = $isAddendum ? 'tender_addendum' : 'tender_notice';
        $title = ($isAddendum ? 'Addendum to tender: ' : 'New tender: ') . $tender->title;
        $closes = $tender->submission_deadline ? $tender->submission_deadline->format('j M Y, H:i') : null;
        $message = trim(($tender->tender_number ? $tender->tender_number . '. ' : '') . ($closes ? "Closes {$closes}. " : '') . ($note ? $note : ''));
        $path = $tender->visibility === 'public' ? "/tenders/{$tender->slug}" : "/vendor-portal/tenders/{$tender->slug}";

        $users = User::whereIn('id', $this->eligibleVendors($tender)->pluck('user_id'))->get();
        foreach ($users as $user) {
            $this->notifier->send($user, $type, $title, $message, ['action_url' => $path, 'action_text' => 'View the tender', 'subject' => $title]);
        }

        TenderMailing::create(['tender_id' => $tender->id, 'kind' => $isAddendum ? 'addendum' : 'notice', 'note' => $note ? mb_substr($note, 0, 255) : null, 'recipient_count' => $users->count(), 'sent_by' => $by?->id]);

        return $users->count();
    }
}
