<?php

namespace App\Services\Engagement;

use App\Models\CalendarEntry;
use App\Models\EngagementPost;
use App\Models\Notification;
use App\Models\User;
use App\Services\Calendar\CalendarService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Telling people. Approvers (admin, super admin, manager) get calendar tasks when posts are held or something is reported: one a day while anything is waiting
 * (the default), one for each, or none, as the Engagement settings say. The person whose post (or pin, or board) was pulled down gets a notification, if that is switched on.
 */
class EngagementNotices
{
    public const DAILY = 'engagement_queue';
    public const EACH_POST = 'engagement_post';
    public const EACH_REPORT = 'engagement_report';
    private const SOURCES = [self::DAILY, self::EACH_POST, self::EACH_REPORT];

    public function __construct(private CalendarService $calendar, private EngagementRules $rules, private TargetResolver $targets) {}

    private function mode(): string
    {
        return $this->rules->settings()->notify_approvers;
    }

    /** @return User[] */
    private function approvers(): array
    {
        return User::whereIn('role', \App\Http\Controllers\Api\EngagementModerationController::DECIDERS)->get()->all();
    }

    private function task(User $u, string $source, int $id, string $title): void
    {
        $this->calendar->put(['user_id' => $u->id, 'source_type' => $source, 'source_id' => $id, 'kind' => 'approval', 'title' => $title, 'starts_at' => now()->startOfDay(), 'ends_at' => null, 'all_day' => true,
            'status' => 'pending', 'visibility' => 'staff', 'url' => '/admin/reviews', 'meta' => []]);
    }

    /** What is waiting: held posts, and things with open reports. @return array{held:int,reports:int} */
    public function waiting(): array
    {
        if (! Schema::hasTable('engagement_posts')) {
            return ['held' => 0, 'reports' => 0];
        }

        return ['held' => (int) DB::table('engagement_posts')->where('status', 'held')->whereNull('deleted_at')->count(),
            'reports' => (int) DB::table('engagement_reports')->where('status', 'open')->selectRaw('COUNT(DISTINCT CONCAT(target_type, \':\', target_id)) n')->value('n')];
    }

    /** Bring the daily task in line with what is waiting, and clear the others when the mode is not "each". Safe to call after anything. */
    public function sync(): void
    {
        $mode = $this->mode();
        if ($mode !== 'each') {
            CalendarEntry::whereIn('source_type', [self::EACH_POST, self::EACH_REPORT])->delete();
        }
        $w = $this->waiting();
        $total = $w['held'] + $w['reports'];
        if ($mode !== 'daily' || $total === 0) {
            CalendarEntry::where('source_type', self::DAILY)->delete();

            return;
        }
        $today = (int) now()->format('Ymd');
        CalendarEntry::where('source_type', self::DAILY)->where('source_id', '!=', $today)->delete();   // yesterday's task is replaced by today's
        $bits = array_filter([$w['held'] ? "{$w['held']} " . ($w['held'] === 1 ? 'post' : 'posts') . ' to approve' : null, $w['reports'] ? "{$w['reports']} " . ($w['reports'] === 1 ? 'report' : 'reports') . ' to decide' : null]);
        foreach ($this->approvers() as $u) {
            $this->task($u, self::DAILY, $today, 'Reviews and comments: ' . implode(', ', $bits));
        }
    }

    public function held(EngagementPost $p): void
    {
        if ($this->mode() === 'each') {
            $what = $p->kind === 'review' ? 'review' : ($p->parent_id ? 'reply' : 'comment');
            foreach ($this->approvers() as $u) {
                $this->task($u, self::EACH_POST, $p->id, "Approve or reject a {$what} on " . $this->targets->label($p->target_type, $p->target_id));
            }
        }
        $this->sync();
    }

    public function reported(string $type, int $id): void
    {
        if ($this->mode() === 'each') {
            $first = (int) DB::table('engagement_reports')->where('target_type', $type)->where('target_id', $id)->where('status', 'open')->min('id');
            foreach ($this->approvers() as $u) {
                $this->task($u, self::EACH_REPORT, $first, 'Decide on a report: ' . $this->targets->label($type, $id));
            }
        }
        $this->sync();
    }

    public function postDecided(int $postId): void
    {
        CalendarEntry::where('source_type', self::EACH_POST)->where('source_id', $postId)->delete();
        $this->sync();
    }

    /** @param int[] $reportIds the ids of the reports that were just decided */
    public function caseDecided(array $reportIds): void
    {
        CalendarEntry::where('source_type', self::EACH_REPORT)->whereIn('source_id', $reportIds)->delete();
        $this->sync();
    }

    /** "Your review was taken down", to the person who made it, when the settings say to tell them. */
    public function tellAuthor(?int $userId, string $what, string $where, ?string $policy = null): void
    {
        if (! $userId || ! $this->rules->settings()->notify_author || ! Schema::hasTable('notifications')) {
            return;
        }
        $user = User::find($userId);
        if (! $user) {
            return;
        }
        Notification::createFor($user, 'engagement_taken_down', "Your {$what} was taken down", "Our team took down your {$what} on {$where}" . ($policy ? ", because it went against our {$policy}" : '') . '.', null, null, null, ['database'], 'normal');
    }
}
