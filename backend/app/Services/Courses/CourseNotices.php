<?php

namespace App\Services\Courses;

use App\Models\Courses\Enrolment;
use App\Models\Courses\Instalment;
use App\Models\Courses\Offering;
use App\Models\User;
use App\Services\Notify\Notifier;
use App\Services\Notify\Staff;

/** Tells students and payers about an enrolment: what is due, the payment received, a reminder, access held back, a cancellation; tells the managers of a new one. Never raises. */
class CourseNotices
{
    public function __construct(private Notifier $notifier, private Staff $staff)
    {
    }

    private function tell(?int $userId, string $type, string $title, string $message, string $url = '/learn'): void
    {
        $this->safely(function () use ($userId, $type, $title, $message, $url) {
            if ($u = $userId ? User::find($userId) : null) {
                $this->notifier->send($u, $type, $title, $message, ['action_url' => $url, 'action_text' => 'Open my courses']);
            }
        });
    }

    private function who(Enrolment $e): array
    {
        return array_values(array_unique(array_filter([$e->payer_user_id ?: $e->student_user_id, $e->student_user_id])));
    }

    public function enrolled(Enrolment $e, Offering $o, float $due): void
    {
        foreach ($this->who($e) as $id) {
            $this->tell($id, 'course_enrolled', "You are enrolling in {$o->title}", $due > 0 ? 'Your enrolment '.$e->number.' needs '.number_format($due, 2).' to hold your place.' : 'Your enrolment '.$e->number.' is confirmed.');
        }
        $this->staffTell('course_enrolment_new', 'New enrolment', "{$e->number} for {$o->title}.");
    }

    public function paid(Enrolment $e, Offering $o, float $amount): void
    {
        foreach ($this->who($e) as $id) {
            $this->tell($id, 'course_paid', 'Payment received', 'We received '.number_format($amount, 2)." for {$o->title} ({$e->number}). Thank you.");
        }
    }

    public function opened(Enrolment $e, Offering $o): void
    {
        $this->tell($e->student_user_id, 'course_open', "You can start {$o->title}", 'Your place is confirmed: open it from My courses.');
    }

    public function reminder(Enrolment $e, Offering $o, Instalment $i): void
    {
        foreach ($this->who($e) as $id) {
            $this->tell($id, 'course_reminder', "A payment for {$o->title} is due", $i->label.' of '.number_format($i->owing(), 2).' is due on '.$i->due_date->format('j M').'.');
        }
    }

    public function lapsed(Enrolment $e, Offering $o, Instalment $i): void
    {
        foreach ($this->who($e) as $id) {
            $this->tell($id, 'course_lapsed', "Your access to {$o->title} is on hold", $i->label.' of '.number_format($i->owing(), 2).' was due on '.$i->due_date->format('j M').'. Pay it and your access comes back.');
        }
    }

    public function cancelled(Enrolment $e, Offering $o, bool $refunded): void
    {
        foreach ($this->who($e) as $id) {
            $this->tell($id, 'course_cancelled', "Your enrolment in {$o->title} ended", $refunded ? 'It was refunded. Any money due back is settled by our accounts team.' : ($e->cancel_reason ?: 'It was cancelled.'));
        }
    }

    public function liveSoon(int $userId, Offering $o, \App\Models\Courses\LiveSession $l, string $when): void
    {
        $tz = $l->timezone ?: config('app.timezone', 'Africa/Nairobi');
        $at = $l->starts_at->copy()->timezone($tz)->format('D j M, H:i');
        $this->tell($userId, 'course_live_soon', $when === 'hour' ? "{$o->title} starts within the hour" : "{$o->title} is tomorrow", ($when === 'hour' ? 'Your live class starts at ' : 'Your live class is on ').$at." ({$tz}). The join link appears on your course page shortly before it starts.", '/learn/my/'.$o->slug);
    }

    private function staffTell(string $type, string $title, string $message): void
    {
        $this->safely(function () use ($type, $title, $message) {
            foreach ($this->staff->holding('courses.enrol') as $u) {
                $this->notifier->send($u, $type, $title, $message, ['action_url' => '/admin/courses/enrolments', 'action_text' => 'Open the enrolments']);
            }
        });
    }

    private function safely(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
