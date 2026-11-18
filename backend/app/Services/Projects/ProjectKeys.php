<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The shortcut keys of Projects. They are settings, not code: the company sets its own (Projects configuration, `projects.shortcuts`) and each
 * person may set theirs on top. Two groups, and a letter is used once in each:
 *   go    press G, then the letter: jump to a part of Projects
 *   on    hold Shift and press the letter on an open project: do something to it, or open one of its tabs
 * A key only ever presses what is on the screen, so it can do nothing the person could not do with the mouse.
 */
class ProjectKeys
{
    /** key => [group, what it does, the letter it ships with] */
    public const KEYS = [
        'go_list' => ['go', 'The list of work', 'P'],
        'go_new' => ['go', 'Start a new one', 'N'],
        'go_log' => ['go', 'The activity log', 'L'],
        'go_trash' => ['go', 'The trash', 'T'],
        'go_config' => ['go', 'Configuration', 'C'],
        'go_mywork' => ['go', 'My Work', 'M'],
        'go_inbox' => ['go', 'The inbox', 'I'],
        'act_edit' => ['on', 'Edit it', 'E'],
        'act_hold' => ['on', 'Put it on hold, or resume it', 'H'],
        'act_next' => ['on', 'Move it to the next stage', 'F'],
        'act_delete' => ['on', 'Delete it (asks first)', 'D'],
        'tab_overview' => ['on', 'Open its Overview', 'O'],
        'tab_phases' => ['on', 'Open its phases', 'P'],
        'tab_people' => ['on', 'Open its People', 'I'],
        'tab_links' => ['on', 'Open its Links', 'K'],
        'tab_activity' => ['on', 'Open its Activity', 'Y'],
    ];

    /** Shift with these letters already means something everywhere in TISL (the key list, the account menu, Mimi, the memo, refresh, light and dark, a new voucher). */
    public const TAKEN_WITH_SHIFT = ['A', 'U', 'M', 'N', 'R', 'T', 'V'];

    /** @return array<string, string> */
    public static function defaults(): array
    {
        return array_map(fn ($k) => $k[2], self::KEYS);
    }

    /** The company's keys. @return array<string, string> */
    public function company(): array
    {
        return app(ProjectSettings::class)->get('shortcuts');
    }

    /** What this person changed for themselves (only the ones that differ). @return array<string, string> */
    public function personal(User $user): array
    {
        $saved = ProjectsSetup::ready() ? DB::table('project_user_prefs')->where('user_id', $user->id)->value('shortcuts') : null;
        $saved = is_string($saved) ? json_decode($saved, true) : null;

        return is_array($saved) ? array_filter(array_intersect_key($saved, self::KEYS), fn ($v) => is_string($v) && preg_match('/^[A-Z]$/', $v)) : [];
    }

    /** The keys this person's screen uses: their own over the company's. If their own no longer fit (the company took a letter), the company's win. @return array<string, string> */
    public function for(User $user): array
    {
        $company = $this->company();
        $mine = array_merge($company, $this->personal($user));

        return self::problem($mine) === null ? $mine : $company;
    }

    /** A person sets their own keys; null goes back to the company's. @param array<string, mixed>|null $keys */
    public function setPersonal(User $user, ?array $keys): void
    {
        if ($keys === null) {
            DB::table('project_user_prefs')->updateOrInsert(['user_id' => $user->id], ['shortcuts' => null, 'updated_at' => now()]);

            return;
        }
        $company = $this->company();
        $all = self::tidy(array_merge($company, array_intersect_key($keys, self::KEYS)));
        if ($why = self::problem($all)) {
            throw new ProjectException($why);
        }
        $own = array_filter($all, fn ($v, $k) => $v !== $company[$k], ARRAY_FILTER_USE_BOTH);
        DB::table('project_user_prefs')->updateOrInsert(['user_id' => $user->id], ['shortcuts' => $own ? json_encode($own) : null, 'updated_at' => now()]);
    }

    /** @param array<string, mixed> $keys @return array<string, string> upper-cased, in the order of KEYS */
    public static function tidy(array $keys): array
    {
        $out = [];
        foreach (self::KEYS as $k => $_) {
            $out[$k] = strtoupper(trim((string) ($keys[$k] ?? '')));
        }

        return $out;
    }

    /** Why a full set of keys cannot be used, in words, or null when it can. @param array<string, string> $keys */
    public static function problem(array $keys): ?string
    {
        $seen = ['go' => [], 'on' => []];
        foreach (self::KEYS as $k => [$group, $what]) {
            $letter = $keys[$k] ?? '';
            if (! preg_match('/^[A-Z]$/', $letter)) {
                return "\"{$what}\" needs one letter, A to Z.";
            }
            if ($group === 'go' && $letter === 'G') {
                return 'G starts every "go to" key, so it cannot be the letter that follows.';
            }
            if ($group === 'on' && in_array($letter, self::TAKEN_WITH_SHIFT, true)) {
                return "Shift+{$letter} already does something everywhere in TISL. Choose another letter for \"{$what}\".";
            }
            if (isset($seen[$group][$letter])) {
                return "{$letter} is used twice: for \"{$seen[$group][$letter]}\" and \"{$what}\".";
            }
            $seen[$group][$letter] = $what;
        }

        return null;
    }
}
