<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Notify\Staff;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The hours a project can be opened (docs/PROJECTS_STAGE2_SPEC.md, build 2.2). Three layers and the narrowest wins: the hours of the person's
 * TISL role (Core checks those before Projects is reached), the project's hours, and the person's own hours on that project.
 * A day with no row is closed; a project with no rows at all is open at any time. Times are the company's clock.
 *
 * The people who can set a project's hours are never held by them: otherwise one mistake could close a project to everyone for good.
 * A short pass, approved by one of those people, lets someone in outside hours and ends by itself.
 */
class ProjectHours
{
    private const DAYS = [1 => 'Mon', 2 => 'Tue', 3 => 'Wed', 4 => 'Thu', 5 => 'Fri', 6 => 'Sat', 7 => 'Sun'];
    private const LONG = [1 => 'Monday', 2 => 'Tuesday', 3 => 'Wednesday', 4 => 'Thursday', 5 => 'Friday', 6 => 'Saturday', 7 => 'Sunday'];

    /** @return array<int, array{opens: string, closes: string}> day (1 = Monday) => its hours */
    public function of(int $projectId, int $memberId = 0): array
    {
        if (! ProjectsSetup::controlRoom()) {
            return [];
        }

        return DB::table('project_hours')->where('project_id', $projectId)->where('member_id', $memberId)->orderBy('day')->get()
            ->mapWithKeys(fn ($r) => [(int) $r->day => ['opens' => $r->opens, 'closes' => $r->closes]])->all();
    }

    /** The hours of a project (member 0) or of one person's place on it, in words; null when none are set. */
    public function wordsFor(int $projectId, int $memberId): ?string
    {
        return self::words($this->of($projectId, $memberId));
    }

    /** "Mon to Fri, 07:00 to 19:00; Sat, 09:00 to 13:00". @param array<int, array{opens: string, closes: string}> $days */
    public static function words(array $days): ?string
    {
        if (! $days) {
            return null;
        }
        ksort($days);
        $runs = [];
        foreach ($days as $day => $h) {
            $last = $runs ? array_key_last($runs) : null;
            if ($last !== null && $runs[$last]['to'] === $day - 1 && $runs[$last]['h'] === $h) {
                $runs[$last]['to'] = $day;
            } else {
                $runs[] = ['from' => $day, 'to' => $day, 'h' => $h];
            }
        }

        return implode('; ', array_map(fn ($r) => ($r['from'] === $r['to'] ? self::DAYS[$r['from']] : self::DAYS[$r['from']] . ' to ' . self::DAYS[$r['to']]) . ", {$r['h']['opens']} to {$r['h']['closes']}", $runs));
    }

    /**
     * Check and tidy a set of hours as a screen sends them. @param mixed $days a list of {day, opens, closes}
     *
     * @return array<int, array{opens: string, closes: string}>
     */
    public static function tidy(mixed $days): array
    {
        $out = [];
        foreach (is_array($days) ? $days : [] as $key => $d) {
            $day = (int) (is_array($d) ? ($d['day'] ?? $key) : 0);
            $opens = is_array($d) ? (string) ($d['opens'] ?? '') : '';
            $closes = is_array($d) ? (string) ($d['closes'] ?? '') : '';
            if (! isset(self::DAYS[$day]) || ! preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $opens) || ! preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $closes)) {
                throw new ProjectException('Give each day a time it opens and a time it closes, like 07:00 and 19:00.');
            }
            if ($opens >= $closes) {
                throw new ProjectException(self::LONG[$day] . ' closes before it opens.');
            }
            $out[$day] = ['opens' => $opens, 'closes' => $closes];
        }
        ksort($out);

        return $out;
    }

    /** Set the hours of a project (member 0) or of one person's place on it. An empty list means any time. */
    public function set(object $project, int $memberId, mixed $days, User $by): void
    {
        $this->needControlRoom();
        app(ProjectAccess::class)->authorize($by, 'access', $project);
        $new = self::tidy($days);
        $who = null;
        if ($memberId) {
            $who = DB::table('project_members as m')->join('users as u', 'u.id', '=', 'm.user_id')->where('m.project_id', $project->id)->where('m.id', $memberId)->whereIn('m.status', ['active', 'invited'])->value('u.name');
            if ($who === null) {
                throw new ProjectException('That person is not on it.', 404);
            }
        }
        $old = $this->of((int) $project->id, $memberId);
        if ($old === $new) {
            return;
        }
        DB::transaction(function () use ($project, $memberId, $new) {
            DB::table('project_hours')->where('project_id', $project->id)->where('member_id', $memberId)->delete();
            foreach ($new as $day => $h) {
                DB::table('project_hours')->insert(['project_id' => $project->id, 'member_id' => $memberId, 'day' => $day, 'opens' => $h['opens'], 'closes' => $h['closes'], 'created_at' => now()]);
            }
        });
        ProjectLog::record((int) $project->id, $by, 'hours.set', $memberId ? 'member' : 'project', $memberId ?: (int) $project->id,
            ['hours' => self::words($old) ?? 'Any time'], ['hours' => self::words($new) ?? 'Any time'] + ($who ? ['for' => $who] : []));
    }

    public function readOutside(int $projectId): bool
    {
        return ProjectsSetup::controlRoom() ? (bool) DB::table('project_access')->where('project_id', $projectId)->value('read_outside_hours') : false;
    }

    public function setReadOutside(object $project, bool $on, User $by): void
    {
        $this->needControlRoom();
        app(ProjectAccess::class)->authorize($by, 'access', $project);
        if ($this->readOutside((int) $project->id) === $on) {
            return;
        }
        DB::table('project_access')->updateOrInsert(['project_id' => $project->id], ['read_outside_hours' => $on ? 1 : 0, 'updated_by' => $by->id, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'hours.reading', 'project', (int) $project->id, ['read_outside_hours' => ! $on], ['read_outside_hours' => $on]);
    }

    /** A new project starts with the company's default hours, when there are any. */
    public function applyDefault(int $projectId): void
    {
        if (! ProjectsSetup::controlRoom()) {
            return;
        }
        $s = app(ProjectSettings::class)->get('access');
        foreach (self::tidy($s['default_hours']) as $day => $h) {
            DB::table('project_hours')->insert(['project_id' => $projectId, 'member_id' => 0, 'day' => $day, 'opens' => $h['opens'], 'closes' => $h['closes'], 'created_at' => now()]);
        }
        if ($s['read_outside_hours']) {
            DB::table('project_access')->updateOrInsert(['project_id' => $projectId], ['read_outside_hours' => 1, 'updated_at' => now()]);
        }
    }

    /**
     * Is this project closed to this person right now? Null when it is not. Asked only of someone who would otherwise get in.
     *
     * @param bool $reading   the action only reads
     * @param bool $keyHolder they can set this project's hours, so the hours do not hold them
     * @return array{message: string, hours: string, opens_at: ?string, opens_words: ?string, can_ask: bool, asked: bool}|null
     */
    public function closed(object $project, User $user, bool $reading, bool $keyHolder): ?array
    {
        if ($keyHolder || ! ProjectsSetup::controlRoom()) {
            return null;
        }
        $pid = (int) $project->id;
        $memberId = (int) DB::table('project_members')->where('project_id', $pid)->where('user_id', $user->id)->where('status', 'active')->value('id');
        $layers = array_values(array_filter([$this->of($pid), $memberId ? $this->of($pid, $memberId) : []]));
        if (! $layers) {
            return null;
        }
        $now = Carbon::instance(now());
        $open = fn (array $days, Carbon $at) => isset($days[$at->dayOfWeekIso]) && $at->format('H:i') >= $days[$at->dayOfWeekIso]['opens'] && $at->format('H:i') < $days[$at->dayOfWeekIso]['closes'];
        if (! array_filter($layers, fn ($days) => ! $open($days, $now))) {
            return null;
        }
        if ($reading && $this->readOutside($pid)) {
            return null;
        }
        if (DB::table('project_passes')->where('project_id', $pid)->where('user_id', $user->id)->where('status', 'approved')->where('ends_at', '>', $now)->exists()) {
            return null;
        }
        $hours = implode(', and for you ', array_map(fn ($d) => (string) self::words($d), $layers));
        $next = $this->nextOpening($layers, $now);
        $nextWords = $next ? ($next->isSameDay($now) ? 'today' : ($next->isSameDay($now->copy()->addDay()) ? 'tomorrow' : 'on ' . self::LONG[$next->dayOfWeekIso])) . ' at ' . $next->format('H:i') : null;
        $asked = DB::table('project_passes')->where('project_id', $pid)->where('user_id', $user->id)->where('status', 'asked')->where('asked_at', '>', $now->copy()->subHours(12))->exists();

        return [
            'message' => "{$project->number} is closed for now. It can be opened {$hours}." . ($nextWords ? " It opens again {$nextWords}." : ''),
            'hours' => $hours, 'opens_at' => $next?->format('Y-m-d H:i:s'), 'opens_words' => $nextWords,
            'can_ask' => (bool) app(ProjectSettings::class)->get('access')['passes'] && ! $asked, 'asked' => $asked,
            'lead' => $project->lead_user_id ? DB::table('users')->where('id', $project->lead_user_id)->value('name') : null,
        ];
    }

    /** For the Access tab: is this person outside their hours right now? @return array{0: string, 1: string}|null */
    public function heldWords(object $project, object $member, User $user): ?array
    {
        $keyHolder = app(ProjectAccess::class)->base($user, 'access', $project)['allowed'];
        $closed = $this->closed($project, $user, false, $keyHolder);

        return $closed ? ['outside_hours', 'Outside hours' . ($closed['opens_words'] ? ', back ' . $closed['opens_words'] : '')] : null;
    }

    // ------------------------------------------------------------------ passes

    /** Ask to be let in outside hours for a short while. Goes to the people who can set the project's hours. */
    public function ask(object $project, User $user, ?string $reason): void
    {
        $this->needControlRoom();
        $access = app(ProjectAccess::class);
        $base = $access->base($user, 'open', $project);
        if (! $base['allowed']) {
            throw new ProjectException('Not found.', 404);   // someone who could not open it in hours either
        }
        $closed = $this->closed($project, $user, false, $access->base($user, 'access', $project)['allowed']);
        if (! $closed) {
            throw new ProjectException('It is open to you now.');
        }
        if (! app(ProjectSettings::class)->get('access')['passes']) {
            throw new ProjectException('Passes outside hours are switched off.', 403);
        }
        if ($closed['asked']) {
            throw new ProjectException('You have already asked. Wait for an answer.');
        }
        $reason = trim((string) $reason) ?: null;
        $id = DB::table('project_passes')->insertGetId(['project_id' => $project->id, 'user_id' => $user->id, 'status' => 'asked', 'reason' => $reason === null ? null : mb_substr($reason, 0, 200), 'asked_at' => now()]);
        ProjectLog::record((int) $project->id, $user, 'pass.asked', 'pass', $id, null, ['reason' => $reason]);
        $minutes = (int) app(ProjectSettings::class)->get('access')['pass_minutes'];
        ProjectNotices::tell($this->keyHolders($project)->reject(fn ($u) => (int) $u->id === (int) $user->id), ProjectNotices::ACCESS, "{$user->name} asks to open {$project->number} outside its hours",
            "{$user->name} is asking to get into {$project->number} ({$project->title}) for {$minutes} minutes, outside its hours." . ($reason ? "\n\nThey say: {$reason}" : '') . "\n\nApprove or decline on its Access tab.",
            "/admin/projects/{$project->id}?tab=access", 'Open its Access tab');
    }

    public function answer(object $project, int $passId, bool $approve, User $by): void
    {
        $this->needControlRoom();
        app(ProjectAccess::class)->authorize($by, 'access', $project);
        $pass = DB::table('project_passes')->where('project_id', $project->id)->where('id', $passId)->where('status', 'asked')->first();
        if (! $pass) {
            throw new ProjectException('That request has already been answered.', 404);
        }
        if ((int) $pass->user_id === (int) $by->id) {
            throw new ProjectException('Someone else must answer your own request.', 403);
        }
        $minutes = (int) app(ProjectSettings::class)->get('access')['pass_minutes'];
        $until = $approve ? now()->addMinutes($minutes) : null;
        DB::table('project_passes')->where('id', $pass->id)->update(['status' => $approve ? 'approved' : 'declined', 'answered_by' => $by->id, 'answered_at' => now(), 'ends_at' => $until]);
        ProjectLog::record((int) $project->id, $by, $approve ? 'pass.approved' : 'pass.declined', 'pass', (int) $pass->id, null, ['for' => DB::table('users')->where('id', $pass->user_id)->value('name'), 'until' => $until?->format('Y-m-d H:i:s')]);
        ProjectNotices::tell(User::find($pass->user_id), ProjectNotices::ACCESS, $approve ? "You can open {$project->number} until " . $until->format('H:i') : "Your request to open {$project->number} was declined",
            $approve ? "{$by->name} has let you into {$project->number} ({$project->title}) until " . $until->format('H:i') . '. After that it closes again by itself.' : "{$by->name} declined your request to open {$project->number} outside its hours.",
            $approve ? "/admin/projects/{$project->id}" : null);
    }

    /** @return array<int, array<string, mixed>> requests waiting, and passes still running */
    public function passes(int $projectId): array
    {
        if (! ProjectsSetup::controlRoom()) {
            return [];
        }

        return DB::table('project_passes as s')->join('users as u', 'u.id', '=', 's.user_id')->where('s.project_id', $projectId)
            ->where(fn ($q) => $q->where(fn ($a) => $a->where('s.status', 'asked')->where('s.asked_at', '>', now()->subHours(12)))->orWhere(fn ($a) => $a->where('s.status', 'approved')->where('s.ends_at', '>', now())))
            ->orderBy('s.asked_at')->get(['s.id', 's.user_id', 'u.name', 's.status', 's.reason', 's.asked_at', 's.ends_at'])
            ->map(fn ($s) => ['id' => (int) $s->id, 'user_id' => (int) $s->user_id, 'name' => $s->name, 'status' => $s->status, 'reason' => $s->reason, 'asked_at' => $s->asked_at, 'ends_at' => $s->ends_at])->all();
    }

    /** The people who can set this project's hours (and so answer a request). @return \Illuminate\Support\Collection<int, User> */
    public function keyHolders(object $project): \Illuminate\Support\Collection
    {
        $access = app(ProjectAccess::class);

        return app(Staff::class)->holding('projects.access.rules')->filter(fn ($u) => $access->base($u, 'access', $project)['allowed'])->values();
    }

    // ------------------------------------------------------------------ inside

    /** @param array<int, array<int, array{opens: string, closes: string}>> $layers */
    private function nextOpening(array $layers, Carbon $now): ?Carbon
    {
        for ($i = 0; $i <= 7; $i++) {
            $day = $now->copy()->addDays($i);
            $opens = '00:00';
            $closes = '24:00';
            foreach ($layers as $days) {
                if (! isset($days[$day->dayOfWeekIso])) {
                    continue 2;
                }
                $opens = max($opens, $days[$day->dayOfWeekIso]['opens']);
                $closes = min($closes, $days[$day->dayOfWeekIso]['closes']);
            }
            if ($opens >= $closes || ($i === 0 && $now->format('H:i') >= $opens)) {
                continue;   // the layers never overlap that day, or today's opening has passed
            }

            return $day->copy()->setTimeFromTimeString($opens);
        }

        return null;
    }

    private function needControlRoom(): void
    {
        if (! ProjectsSetup::controlRoom()) {
            throw new ProjectException('This needs database script 258. Run it first.', 409);
        }
    }
}
