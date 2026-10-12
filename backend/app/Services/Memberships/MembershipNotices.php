<?php

namespace App\Services\Memberships;

use App\Models\Memberships\Membership;
use App\Models\Memberships\Period;
use App\Models\Memberships\Plan;
use App\Models\User;
use App\Services\Notify\Notifier;
use App\Services\Notify\Staff;

/** Tells members and payers about their membership: what is due, a payment received, a reminder, a lapse, a pause, an end. Never raises. */
class MembershipNotices
{
    public function __construct(private Notifier $notifier, private Staff $staff)
    {
    }

    private function tell(?int $userId, string $type, string $title, string $message, string $url = '/membership'): void
    {
        try {
            if ($u = $userId ? User::find($userId) : null) {
                $this->notifier->send($u, $type, $title, $message, ['action_url' => $url, 'action_text' => 'Open my membership']);
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** @return int[] */
    private function who(Membership $m): array
    {
        return array_values(array_unique(array_filter([$m->payer_user_id ?: $m->member_user_id, $m->member_user_id])));
    }

    private function plan(Membership $m): string
    {
        return (string) (Plan::whereKey($m->plan_id)->value('name') ?? 'your plan');
    }

    public function joined(Membership $m, float $due): void
    {
        foreach ($this->who($m) as $id) {
            $this->tell($id, 'membership_joined', 'Your membership: '.$this->plan($m), $due > 0 ? "Membership {$m->number} needs ".number_format($due, 2).' to start.' : "Membership {$m->number} is confirmed.");
        }
        try {
            foreach ($this->staff->holding('memberships.enrol') as $u) {
                $this->notifier->send($u, 'membership_new', 'New membership', "{$m->number}: ".$this->plan($m).'.', ['action_url' => '/admin/memberships/members', 'action_text' => 'Open the members']);
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }

    public function started(Membership $m): void
    {
        $this->tell($m->member_user_id, 'membership_started', 'Your membership has started', $this->plan($m).' is active until '.$m->paid_until?->copy()->subDay()->format('j M Y').'.');
    }

    public function paid(Membership $m, float $amount): void
    {
        foreach ($this->who($m) as $id) {
            $this->tell($id, 'membership_paid', 'Payment received', 'We received '.number_format($amount, 2).' for '.$this->plan($m)." ({$m->number}). Thank you.");
        }
    }

    public function renewalInvoiced(Membership $m, Period $p): void
    {
        foreach ($this->who($m) as $id) {
            $this->tell($id, 'membership_renewal', 'Your membership renews soon', $this->plan($m).' renews on '.$p->period_from->format('j M').'. Please pay '.number_format($p->owing(), 2).'.');
        }
    }

    public function reminder(Membership $m, Period $p, bool $late): void
    {
        foreach ($this->who($m) as $id) {
            $this->tell($id, 'membership_reminder', $late ? 'Your membership payment is late' : 'A membership payment is due', ($p->label).' of '.number_format($p->owing(), 2).' '.($late ? 'was due on ' : 'is due on ').$p->due_date->format('j M').'.');
        }
    }

    public function pastDue(Membership $m): void
    {
        foreach ($this->who($m) as $id) {
            $this->tell($id, 'membership_past_due', 'Your membership payment is late', 'Pay soon to keep your benefits: they stop if the payment is not made in time.');
        }
    }

    public function lapsed(Membership $m): void
    {
        foreach ($this->who($m) as $id) {
            $this->tell($id, 'membership_lapsed', 'Your membership has lapsed', 'The payment was not made, so your benefits have stopped. Pay the open invoice to start again.');
        }
    }

    public function paused(Membership $m): void
    {
        $this->tell($m->member_user_id, 'membership_paused', 'Your membership is paused', 'It resumes on '.$m->paused_until?->format('j M Y').'. Your paid time is extended by the days you pause.');
    }

    public function resumed(Membership $m): void
    {
        $this->tell($m->member_user_id, 'membership_resumed', 'Your membership is back', $this->plan($m).' is active again.');
    }

    public function ended(Membership $m, bool $refunded = false): void
    {
        foreach ($this->who($m) as $id) {
            $this->tell($id, 'membership_ended', 'Your membership has ended', $refunded ? 'It was refunded. Any money due back is settled by our accounts team.' : ($m->cancel_reason ?: $this->plan($m).' has ended.'));
        }
    }
}
