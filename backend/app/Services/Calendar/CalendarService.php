<?php

namespace App\Services\Calendar;

use App\Models\CalendarEntry;
use App\Models\CalendarToken;
use App\Models\Project;
use App\Models\ProjectMilestone;
use App\Models\ProjectParticipant;
use App\Models\ProjectTask;
use App\Models\Ticket;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * The staff calendar. Every module puts what it schedules on it as an entry that points back to the thing (a booking, a task due, a
 * milestone…); the calendar page, the subscription link and the availability checks all read the same entries.
 * Who sees what: an entry is `staff` (only its owner), `team` (managers and the team) or `customer` (the customer sees it in their own portal too —
 * never on this calendar).
 */
class CalendarService
{
    /** Roles that may look at other people's calendars. */
    public const MANAGERS = ['super_admin', 'admin', 'manager'];

    public static function isManager(?User $u): bool
    {
        return $u && in_array($u->role, self::MANAGERS, true);
    }

    /** Add or update the entry for a source (one per source, owner and resource). */
    public function put(array $e): CalendarEntry
    {
        $key = ['source_type' => $e['source_type'], 'source_id' => (int) ($e['source_id'] ?? 0), 'user_id' => $e['user_id'] ?? null, 'resource_id' => $e['resource_id'] ?? null];

        return CalendarEntry::updateOrCreate($key, array_diff_key($e, $key) + ['visibility' => 'team']);
    }

    /**
     * Keep a support ticket on its assignee's calendar: an all-day entry on the day it was assigned, for as long as it is assigned to them and
     * not resolved or closed. Reassigning moves it to the new person; unassigning, resolving, closing or deleting takes it off.
     */
    public function syncTicket(Ticket $t, ?Carbon $day = null): void
    {
        $live = $t->assigned_to && ! $t->trashed() && ! in_array($t->status, ['resolved', 'closed'], true);
        if (! $live) {
            $this->remove('ticket', $t->id);

            return;
        }
        CalendarEntry::where('source_type', 'ticket')->where('source_id', $t->id)->where('user_id', '!=', $t->assigned_to)->delete();   // it moved to someone else
        $existing = CalendarEntry::where('source_type', 'ticket')->where('source_id', $t->id)->where('user_id', $t->assigned_to)->first();
        $fields = ['kind' => 'ticket', 'title' => "{$t->ticket_number} · {$t->subject}", 'status' => $t->status, 'visibility' => 'team', 'url' => "/admin/tickets/{$t->id}",
            'meta' => ['priority' => $t->priority, 'category' => $t->category]];
        if ($existing) {
            $existing->update($fields);   // the day it was assigned stays
        } else {
            $this->put($fields + ['user_id' => $t->assigned_to, 'source_type' => 'ticket', 'source_id' => $t->id, 'starts_at' => ($day ?? now())->copy()->startOfDay(), 'ends_at' => null, 'all_day' => true]);
        }
    }

    /** Take a source's entries off every calendar (it was cancelled or deleted). */
    public function remove(string $sourceType, int $sourceId): int
    {
        return CalendarEntry::where('source_type', $sourceType)->where('source_id', $sourceId)->delete();
    }

    /**
     * Bring one person's entries from the existing modules up to date for a window: tasks assigned to them, milestones and project end dates of
     * their projects. Idempotent: it rewrites what is there and removes what no longer applies.
     */
    public function refreshFromSources(User $user, Carbon $from, Carbon $to): void
    {
        $keep = [];
        $uid = $user->id;
        $myProjects = ProjectParticipant::where('admin_user_id', $uid)->where('participant_type', 'admin')->pluck('project_id')
            ->merge(Project::where('owner_admin_id', $uid)->pluck('id'))->unique()->values();

        $tasks = ProjectTask::with('project:id,title')->where('assigned_to', $uid)->whereNotNull('due_date')->whereBetween('due_date', [$from, $to])->whereNotIn('status', ['done'])->get();
        foreach ($tasks as $t) {
            $keep['task'][] = $t->id;
            $this->put(['user_id' => $uid, 'source_type' => 'task', 'source_id' => $t->id, 'kind' => 'task', 'title' => $t->title . ($t->project ? " — {$t->project->title}" : ''),
                'starts_at' => $t->due_date->copy()->startOfDay(), 'ends_at' => null, 'all_day' => true, 'status' => $t->status, 'visibility' => 'team', 'url' => "/admin/projects/{$t->project_id}"]);
        }
        $miles = ProjectMilestone::with('project:id,title')->whereIn('project_id', $myProjects)->whereNotNull('due_date')->whereBetween('due_date', [$from, $to])->whereNotIn('status', ['completed', 'approved'])->get();
        foreach ($miles as $m) {
            $keep['milestone'][] = $m->id;
            $this->put(['user_id' => $uid, 'source_type' => 'milestone', 'source_id' => $m->id, 'kind' => 'milestone', 'title' => $m->title . ($m->project ? " — {$m->project->title}" : ''),
                'starts_at' => Carbon::parse($m->due_date)->startOfDay(), 'all_day' => true, 'status' => $m->status, 'visibility' => 'team', 'url' => "/admin/projects/{$m->project_id}"]);
        }
        $projects = Project::whereIn('id', $myProjects)->whereNotNull('target_end_date')->whereBetween('target_end_date', [$from, $to])->whereNotIn('status', ['completed', 'cancelled'])->get();
        foreach ($projects as $p) {
            $keep['project'][] = $p->id;
            $this->put(['user_id' => $uid, 'source_type' => 'project', 'source_id' => $p->id, 'kind' => 'project', 'title' => "Project ends: {$p->title}",
                'starts_at' => Carbon::parse($p->target_end_date)->startOfDay(), 'all_day' => true, 'status' => $p->status, 'visibility' => 'team', 'url' => "/admin/projects/{$p->id}"]);
        }
        // tickets assigned to them that are still open: any assigned before the calendar existed get an entry too (dated when they were last touched)
        $openTickets = Ticket::where('assigned_to', $uid)->whereNotIn('status', ['resolved', 'closed'])->get();
        foreach ($openTickets as $t) {
            $this->syncTicket($t, $t->updated_at);
        }
        CalendarEntry::where('user_id', $uid)->where('source_type', 'ticket')->whereNotIn('source_id', $openTickets->pluck('id'))->delete();

        // entries in the window whose source is done, moved or gone
        foreach (['task', 'milestone', 'project'] as $type) {
            CalendarEntry::where('user_id', $uid)->where('source_type', $type)->whereBetween('starts_at', [$from, $to])
                ->when(! empty($keep[$type]), fn ($q) => $q->whereNotIn('source_id', $keep[$type]))->delete();
        }
    }

    /**
     * What a viewer may see on someone's calendar between two dates. The owner sees all of it; a manager sees `team` and `customer` entries of other people;
     * nobody else sees another person's calendar.
     */
    public function entriesFor(User $viewer, int $ownerId, Carbon $from, Carbon $to, array $kinds = []): Collection
    {
        $own = $viewer->id === $ownerId;
        if (! $own && ! self::isManager($viewer)) {
            return collect();
        }

        return CalendarEntry::where('user_id', $ownerId)
            ->where('starts_at', '<=', $to)->where(fn ($q) => $q->where('ends_at', '>=', $from)->orWhere(fn ($x) => $x->whereNull('ends_at')->where('starts_at', '>=', $from)))
            ->when(! $own, fn ($q) => $q->whereIn('visibility', ['team', 'customer']))
            ->when($kinds, fn ($q) => $q->whereIn('kind', $kinds))
            ->orderBy('starts_at')->get();
    }

    /** A staff member's secret subscription token (made on first use). */
    public function token(User $user): string
    {
        $t = CalendarToken::firstOrCreate(['user_id' => $user->id], ['token' => Str::random(48), 'created_at' => now()]);

        return $t->token;
    }

    /** A new token: the old link stops working. */
    public function rotateToken(User $user): string
    {
        CalendarToken::where('user_id', $user->id)->delete();

        return $this->token($user);
    }

    public function userByToken(string $token): ?User
    {
        $row = CalendarToken::where('token', $token)->first();

        return $row ? User::find($row->user_id) : null;
    }

    /** The person's calendar as an iCalendar feed that Google, Outlook and Apple Calendar can subscribe to. */
    public function ics(User $owner): string
    {
        $this->refreshFromSources($owner, now()->subDays(30), now()->addDays(180));
        $entries = $this->entriesFor($owner, $owner->id, now()->subDays(30), now()->addDays(180));
        $esc = fn (string $s) => str_replace(["\\", ';', ',', "\r\n", "\n"], ['\\\\', '\;', '\\,', '\\n', '\\n'], $s);
        $fold = function (string $line): string {
            $out = '';
            while (strlen($line) > 73) {
                $out .= substr($line, 0, 73) . "\r\n ";
                $line = substr($line, 73);
            }

            return $out . $line;
        };
        $lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TISL//Staff calendar//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' . $esc(config('app.name', 'TISL') . ' — ' . $owner->name)];
        foreach ($entries as $e) {
            $uid = "tisl-{$e->source_type}-{$e->source_id}-{$e->id}@" . (parse_url(config('app.url'), PHP_URL_HOST) ?: 'tisl');
            $lines[] = 'BEGIN:VEVENT';
            $lines[] = 'UID:' . $uid;
            $lines[] = 'DTSTAMP:' . now()->utc()->format('Ymd\THis\Z');
            if ($e->all_day) {
                $lines[] = 'DTSTART;VALUE=DATE:' . $e->starts_at->format('Ymd');
                $lines[] = 'DTEND;VALUE=DATE:' . $e->starts_at->copy()->addDay()->format('Ymd');
            } else {
                $lines[] = 'DTSTART:' . $e->starts_at->copy()->utc()->format('Ymd\THis\Z');
                $lines[] = 'DTEND:' . ($e->ends_at ?? $e->starts_at->copy()->addHour())->copy()->utc()->format('Ymd\THis\Z');
            }
            $lines[] = 'SUMMARY:' . $esc($e->title);
            if ($e->status) {
                $lines[] = 'DESCRIPTION:' . $esc(ucfirst(str_replace('_', ' ', $e->kind)) . ' · ' . $e->status);
            }
            if ($e->url) {
                $lines[] = 'URL:' . rtrim((string) config('app.frontend_url', config('app.url')), '/') . $e->url;
            }
            $lines[] = 'END:VEVENT';
        }
        $lines[] = 'END:VCALENDAR';

        return implode("\r\n", array_map($fold, $lines)) . "\r\n";
    }
}
