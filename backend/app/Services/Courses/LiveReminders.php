<?php

namespace App\Services\Courses;

use App\Models\Courses\Access;
use App\Models\Courses\LiveSession;
use App\Models\Courses\Offering;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

/** Reminds everyone with access to an offering about a live session: once the day before and once within the hour. The reminder says when and where to look; the join link itself only shows on the course page, shortly before the start. */
class LiveReminders
{
    public function __construct(private CourseNotices $notices)
    {
    }

    public static function installed(): bool
    {
        return Schema::hasTable('course_live') && Schema::hasColumn('course_live', 'reminded_hour_at');
    }

    /** @return int how many reminders (to people) were sent */
    public function run(?Carbon $now = null): int
    {
        if (! self::installed()) {
            return 0;
        }
        $now = ($now ?? now())->copy();
        $sent = 0;
        foreach (LiveSession::where('starts_at', '>', $now)->where('starts_at', '<=', $now->copy()->addHours(24))->orderBy('starts_at')->get() as $l) {
            $o = Offering::find($l->offering_id);
            if (! $o || $o->status !== 'published') {
                continue;
            }
            $soon = $l->starts_at->lte($now->copy()->addMinutes(65));
            if ($soon && ! $l->reminded_hour_at) {
                $sent += $this->tell($o, $l, 'hour', $now);
                $l->update(['reminded_hour_at' => $now, 'reminded_day_at' => $l->reminded_day_at ?? $now]);
            } elseif (! $soon && ! $l->reminded_day_at) {
                $sent += $this->tell($o, $l, 'day', $now);
                $l->update(['reminded_day_at' => $now]);
            }
        }

        return $sent;
    }

    private function tell(Offering $o, LiveSession $l, string $when, Carbon $now): int
    {
        $n = 0;
        $ids = Access::where('offering_id', $o->id)->whereNull('revoked_at')->where('starts_at', '<=', $now)->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', $now))->pluck('user_id')->unique();
        foreach ($ids as $id) {
            $this->notices->liveSoon((int) $id, $o, $l, $when);
            $n++;
        }

        return $n;
    }
}
