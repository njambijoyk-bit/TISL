<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Notify\Staff;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Watching for people trying doors (docs/PROJECTS_STAGE2_SPEC.md, build 2.5). Every refusal is already in the log; this reads it for
 * patterns, and acts as the settings say: tell the people who watch security, make the person read-only for a while (cool off), or pause
 * their access to Projects until someone releases it. A pause covers Projects only.
 *
 * Someone who can release a pause (holds `projects.security.view`) is never paused or cooled off themselves, only reported: otherwise the
 * people who could unlock the company could be locked out of it.
 */
class ProjectSecurity
{
    /** signal => [what it is called, what is counted] */
    public const SIGNALS = [
        'refusals' => ['Many refusals', 'Refusals for things they may not do'],
        'lock_tries' => ['Wrong lock passwords', 'Wrong passwords for locked areas'],
        'outside_hours' => ['Tries outside hours', 'Tries to open a project outside its hours'],
        'opening_spree' => ['Opening spree', 'Different projects opened'],
    ];

    public const RESPONSES = ['alert' => 'Alert only', 'slow' => 'Cool off: read only for a while', 'pause' => 'Pause their access to Projects'];

    /** Check and tidy the settings as the screen sends them. @param array<string, mixed> $v */
    public static function tidy(array $v): array
    {
        $out = [];
        foreach (self::SIGNALS as $signal => [$label]) {
            $s = is_array($v[$signal] ?? null) ? $v[$signal] : [];
            $count = (int) ($s['count'] ?? 0);
            $minutes = (int) ($s['minutes'] ?? 0);
            $response = (string) ($s['response'] ?? 'alert');
            if ($count < 2 || $count > 1000 || $minutes < 1 || $minutes > 1440) {
                throw new ProjectException("\"{$label}\" needs a count from 2 to 1,000 and a time from 1 minute to 24 hours.");
            }
            if (! isset(self::RESPONSES[$response])) {
                throw new ProjectException("Choose what happens after \"{$label}\" from the list.");
            }
            $out[$signal] = ['on' => ! empty($s['on']), 'count' => $count, 'minutes' => $minutes, 'response' => $response];
        }
        $cool = (int) ($v['cool_off_minutes'] ?? 0);
        if ($cool < 1 || $cool > 1440) {
            throw new ProjectException('Cooling off lasts from 1 minute to 24 hours.');
        }

        return $out + ['cool_off_minutes' => $cool];
    }

    /** Called after every refusal is logged: has this person crossed a line? */
    public function afterRefusal(?User $user): void
    {
        if (! $user || ! ProjectsSetup::controlRoom()) {
            return;
        }
        $s = app(ProjectSettings::class)->get('security');
        $count = fn (string $signal, callable $which) => $s[$signal]['on']
            ? $which(DB::table('project_log')->where('actor_id', $user->id)->where('result', 'refused')->where('created_at', '>', now()->subMinutes($s[$signal]['minutes'])))
            : null;
        $projects = fn ($q) => (clone $q)->whereNotNull('project_id')->distinct()->count('project_id');
        foreach ([
            'lock_tries' => fn ($q) => $q->where('action', 'lock.try'),
            'outside_hours' => fn ($q) => $q->where('reason', 'Outside hours'),
            'refusals' => fn ($q) => $q->where('action', 'not like', 'lock.%')->where(fn ($w) => $w->whereNull('reason')->orWhere('reason', '!=', 'Outside hours')),
        ] as $signal => $which) {
            $q = $count($signal, $which);
            if ($q === null) {
                continue;
            }
            $n = (clone $q)->count();
            if ($n >= $s[$signal]['count']) {
                $across = $projects($q);
                $project = $across === 1 ? (int) (clone $q)->whereNotNull('project_id')->value('project_id') : null;
                $this->fire($signal, $user, $project, match ($signal) {
                    'lock_tries' => "{$n} wrong lock passwords in {$s[$signal]['minutes']} minutes",
                    'outside_hours' => "{$n} tries outside hours in {$s[$signal]['minutes']} minutes",
                    default => "{$n} refusals in {$s[$signal]['minutes']} minutes" . ($across > 1 ? " across {$across} projects" : ''),
                }, $s);
            }
        }
    }

    /** Called when a project is opened: someone opening an unusual number of different projects in a short time. */
    public function noteOpened(User $user, int $projectId): void
    {
        if (! ProjectsSetup::controlRoom()) {
            return;
        }
        $s = app(ProjectSettings::class)->get('security');
        if (! $s['opening_spree']['on']) {
            return;
        }
        $key = "projects:opened:{$user->id}";
        $seen = Cache::get($key, ['from' => now()->timestamp, 'ids' => []]);
        if ($seen['from'] < now()->subMinutes($s['opening_spree']['minutes'])->timestamp) {
            $seen = ['from' => now()->timestamp, 'ids' => []];
        }
        $seen['ids'][$projectId] = true;
        Cache::put($key, $seen, now()->addMinutes($s['opening_spree']['minutes']));
        if (count($seen['ids']) >= $s['opening_spree']['count']) {
            $this->fire('opening_spree', $user, null, 'Opened ' . count($seen['ids']) . " projects in {$s['opening_spree']['minutes']} minutes", $s);
            Cache::forget($key);
        }
    }

    /** What holds this person back in Projects right now, if anything. @return array{kind: string, until: ?string, event: int}|null */
    public function holdOn(int $userId): ?array
    {
        if (! ProjectsSetup::controlRoom()) {
            return null;
        }
        $e = DB::table('project_security_events')->where('user_id', $userId)->whereIn('response', ['pause', 'slow'])->whereNull('released_at')
            ->where(fn ($q) => $q->where('response', 'pause')->orWhere('hold_until', '>', now()))->orderByRaw("CASE WHEN response = 'pause' THEN 0 ELSE 1 END")->orderByDesc('id')->first();

        return $e ? ['kind' => $e->response, 'until' => $e->hold_until, 'event' => (int) $e->id] : null;
    }

    public function release(int $eventId, ?string $note, User $by): void
    {
        $note = trim((string) $note);
        if ($note === '') {
            throw new ProjectException('Say why you are releasing them.');
        }
        $e = $this->event($eventId);
        if ((int) $e->user_id === (int) $by->id) {
            throw new ProjectException('Someone else must release you.', 403);
        }
        if (! in_array($e->response, ['pause', 'slow'], true) || $e->released_at !== null) {
            throw new ProjectException('There is nothing to release.');
        }
        // one release lets the person back in: every hold on them ends, not only this one
        DB::table('project_security_events')->where('user_id', $e->user_id)->whereIn('response', ['pause', 'slow'])->whereNull('released_at')->update(['released_by' => $by->id, 'released_at' => now()]);
        DB::table('project_security_events')->where('id', $e->id)->update(['reviewed_by' => $by->id, 'reviewed_at' => now(), 'review_note' => mb_substr($note, 0, 300)]);
        ProjectLog::record(null, $by, 'security.released', 'user', (int) $e->user_id, null, ['who' => DB::table('users')->where('id', $e->user_id)->value('name'), 'note' => $note]);
        ProjectNotices::tell(User::find($e->user_id), ProjectNotices::SECURITY, 'Your access to Projects is back', "{$by->name} has released your access to Projects. You can carry on.", '/admin/projects');
    }

    public function review(int $eventId, ?string $note, User $by): void
    {
        $note = trim((string) $note);
        if ($note === '') {
            throw new ProjectException('Say what you found.');
        }
        $e = $this->event($eventId);
        if ((int) $e->user_id === (int) $by->id) {
            throw new ProjectException('Someone else must review this one.', 403);
        }
        DB::table('project_security_events')->where('id', $e->id)->update(['reviewed_by' => $by->id, 'reviewed_at' => now(), 'review_note' => mb_substr($note, 0, 300)]);
        ProjectLog::record(null, $by, 'security.reviewed', 'security_event', (int) $e->id, null, ['note' => $note]);
    }

    /** The Security screen. @return array<string, mixed> */
    public function page(User $viewer): array
    {
        $ready = ProjectsSetup::controlRoom();
        $rows = $ready ? DB::table('project_security_events as e')->join('users as u', 'u.id', '=', 'e.user_id')->leftJoin('projects as p', 'p.id', '=', 'e.project_id')
            ->leftJoin('users as r', 'r.id', '=', 'e.reviewed_by')->leftJoin('users as l', 'l.id', '=', 'e.released_by')->orderByDesc('e.id')->limit(200)
            ->get(['e.*', 'u.name as who', 'p.number as project', 'r.name as reviewed_by_name', 'l.name as released_by_name']) : collect();
        $now = now()->format('Y-m-d H:i:s');
        $events = $rows->map(function ($e) use ($now, $viewer) {
            $held = $e->released_at === null && ($e->response === 'pause' || ($e->response === 'slow' && $e->hold_until > $now));

            return ['id' => (int) $e->id, 'signal' => $e->signal, 'signal_label' => self::SIGNALS[$e->signal][0] ?? $e->signal, 'user_id' => (int) $e->user_id, 'who' => $e->who,
                'project_id' => $e->project_id ? (int) $e->project_id : null, 'project' => $e->project, 'detail' => $e->detail, 'response' => $e->response, 'held' => $held, 'hold_until' => $e->hold_until,
                'released_by' => $e->released_by_name, 'released_at' => $e->released_at, 'reviewed_by' => $e->reviewed_by_name, 'reviewed_at' => $e->reviewed_at, 'review_note' => $e->review_note,
                'at' => $e->created_at, 'mine' => (int) $e->user_id === (int) $viewer->id];
        })->all();

        return [
            'ready' => $ready, 'events' => $events,
            'summary' => ['paused' => collect($events)->where('held', true)->where('response', 'pause')->unique('user_id')->count(), 'open' => collect($events)->whereNull('reviewed_at')->count()],
            'settings' => app(ProjectSettings::class)->get('security'),
            'signals' => array_map(fn ($k) => ['key' => $k, 'label' => self::SIGNALS[$k][0], 'counts' => self::SIGNALS[$k][1]], array_keys(self::SIGNALS)),
            'responses' => self::RESPONSES,
            'watchers' => app(Staff::class)->holding('projects.security.view')->count(),
            'can' => ['settings' => $viewer->hasPermission('projects.config.actions')],
        ];
    }

    // ------------------------------------------------------------------ inside

    /** @param array<string, mixed> $s the security settings */
    private function fire(string $signal, User $user, ?int $projectId, string $detail, array $s): void
    {
        // once per window: the same signal does not fire again for the same person until its minutes have passed
        if (DB::table('project_security_events')->where('user_id', $user->id)->where('signal', $signal)->where('created_at', '>', now()->subMinutes($s[$signal]['minutes']))->exists()) {
            return;
        }
        $response = $s[$signal]['response'];
        $watcher = $user->hasPermission('projects.security.view');
        if ($watcher) {
            $response = 'alert';   // the people who can release a pause are never held themselves
        }
        $until = $response === 'slow' ? now()->addMinutes((int) $s['cool_off_minutes']) : null;
        $id = DB::table('project_security_events')->insertGetId(['signal' => $signal, 'user_id' => $user->id, 'project_id' => $projectId, 'detail' => mb_substr($detail, 0, 300), 'response' => $response, 'hold_until' => $until, 'created_at' => now()]);
        ProjectLog::record($projectId, null, 'security.signal', 'security_event', $id, null, ['who' => $user->name, 'signal' => self::SIGNALS[$signal][0], 'what' => $detail, 'response' => self::RESPONSES[$response]]);
        $did = ['alert' => 'Nothing was done to their access.', 'slow' => "They can read but not change anything in Projects for {$s['cool_off_minutes']} minutes.", 'pause' => 'Their access to Projects is paused until someone releases it.'][$response];
        ProjectNotices::tell(app(Staff::class)->holding('projects.security.view')->reject(fn ($u) => (int) $u->id === (int) $user->id), ProjectNotices::SECURITY,
            "Projects security: {$user->name}, " . mb_strtolower(self::SIGNALS[$signal][0]), "{$user->name}: {$detail}. {$did}\n\nOpen Projects security to review it.", '/admin/projects/security', 'Open Projects security');
    }

    private function event(int $id): object
    {
        $e = ProjectsSetup::controlRoom() ? DB::table('project_security_events')->where('id', $id)->first() : null;
        if (! $e) {
            throw new ProjectException('Not found.', 404);
        }

        return $e;
    }
}
