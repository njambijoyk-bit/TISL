<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The settings of Projects, kept in parts. Every save is a new numbered version of that part, so any earlier state can be brought back
 * (a roll back is itself a new version, never a rewrite of history), and a line in the settings log says who did it and when.
 */
class ProjectSettings
{
    /** part => the values it holds when nothing is saved */
    public const DEFAULTS = [
        'general' => ['default_industry' => 'general', 'project_may_use_other_industry' => true, 'trash_days' => 30],
        // the company's shortcut keys (ProjectKeys says what each is for)
        'shortcuts' => ['go_list' => 'P', 'go_new' => 'N', 'go_log' => 'L', 'go_trash' => 'T', 'go_config' => 'C', 'act_edit' => 'E', 'act_hold' => 'H', 'act_next' => 'F', 'act_delete' => 'D',
            'tab_overview' => 'O', 'tab_phases' => 'P', 'tab_people' => 'I', 'tab_links' => 'K', 'tab_activity' => 'Y'],
        // stage 2, the control room: how long before an end date the lead is told
        // and the hours a new project starts with (a list of {day, opens, closes}; empty = any time), whether reading is allowed outside them, and short passes
        'access' => ['warn_days' => 7, 'default_hours' => [], 'read_outside_hours' => false, 'passes' => true, 'pass_minutes' => 60,
            // locked areas: minutes one stays open, wrong tries in a row before a wait, and the wait; hours a request for approval stays open
            'unlock_minutes' => 15, 'lock_tries' => 5, 'lock_wait_minutes' => 15, 'approval_hours' => 24],
        // security signals: how many of what, in how many minutes, and what happens then. Out of the box each only alerts.
        'security' => ['refusals' => ['on' => true, 'count' => 10, 'minutes' => 10, 'response' => 'alert'], 'lock_tries' => ['on' => true, 'count' => 5, 'minutes' => 15, 'response' => 'alert'],
            'outside_hours' => ['on' => true, 'count' => 4, 'minutes' => 30, 'response' => 'alert'], 'opening_spree' => ['on' => true, 'count' => 50, 'minutes' => 15, 'response' => 'alert'],
            'reveals' => ['on' => true, 'count' => 20, 'minutes' => 10, 'response' => 'alert'], 'cool_off_minutes' => 15],
        // money (stage 4): post bills or prepare drafts; where retention goes by default; whether a project shows on each kind of voucher (required | optional | none)
        'money' => ['bill_mode' => 'draft', 'retention_mode' => 'company', 'retention_ledger_id' => 0, 'voucher_project' => ['payment' => 'optional', 'receipt' => 'optional', 'sales' => 'optional', 'cash_sale' => 'optional', 'credit_note' => 'optional', 'purchase' => 'optional', 'debit_note' => 'optional', 'journal' => 'optional', 'contra' => 'optional', 'quotation' => 'optional', 'sales_order' => 'optional', 'purchase_order' => 'optional', 'delivery_note' => 'optional', 'receipt_note' => 'optional']],
        // work and time (stage 5): time rounded up to so many minutes (0 = exact); a forgotten timer stops after so many hours; time beyond what
        // Attendance says was worked: warn | refuse | off; who approves time: the work's leads | the person's manager; whether work is billable unless
        // a task says otherwise; key date warnings, days before; remind people of an unsubmitted week; split pay by timesheets; where billed-back costs go
        'work' => ['rounding' => 6, 'timer_cap_hours' => 10, 'attendance_check' => 'warn', 'approve_by' => 'lead', 'billable_default' => true, 'warn_days' => '14,7,1', 'week_reminder' => true, 'payroll_split' => false, 'disbursement_ledger_id' => 0],
        // the directory (stage 3): which visibility levels can be used beyond staff only
        'directory' => ['levels' => ['clients', 'public']],
        // client health (stage 3): days since the last contact, days a next action is late, nothing planned, days money is overdue in the books. 0 switches a rule off.
        'health' => ['contact_amber_days' => 30, 'contact_red_days' => 60, 'late_red_days' => 14, 'nothing_planned_amber' => true, 'overdue_amber_days' => 1, 'overdue_red_days' => 60],
        // what each serious action needs before it happens (ProjectSerious lists the actions): out of the box, nothing
        'serious' => [
            'project.purge' => ['needs' => 'none', 'on_project' => false, 'reason' => false],
            'project.open_up' => ['needs' => 'none', 'on_project' => false, 'reason' => false],
            'project.unfreeze' => ['needs' => 'none', 'on_project' => false, 'reason' => false],
            'project.transfer' => ['needs' => 'none', 'on_project' => false, 'reason' => false],
            'project.reopen' => ['needs' => 'none', 'on_project' => false, 'reason' => false],
            'project.delete' => ['needs' => 'none', 'on_project' => false, 'reason' => false],
            'member.remove' => ['needs' => 'none', 'on_project' => false, 'reason' => false],
            'role.change' => ['needs' => 'none', 'on_project' => false, 'reason' => false],
            'held.pay_out' => ['needs' => 'none', 'on_project' => false, 'reason' => false],
            'held.guard_off' => ['needs' => 'none', 'on_project' => false, 'reason' => false],
            'bill.post' => ['needs' => 'none', 'on_project' => false, 'reason' => false],
            'retention.release' => ['needs' => 'none', 'on_project' => false, 'reason' => false],
        ],
    ];

    /** @var array<string, array<string, mixed>> */
    private array $cache = [];

    /** @return array<string, mixed> */
    public function get(string $part): array
    {
        $this->assertPart($part);
        if (! isset($this->cache[$part])) {
            $saved = ProjectsSetup::ready() ? DB::table('project_settings')->where('part', $part)->value('value') : null;
            $saved = is_string($saved) ? json_decode($saved, true) : null;
            $value = array_merge(self::DEFAULTS[$part], is_array($saved) ? array_intersect_key($saved, self::DEFAULTS[$part]) : []);
            foreach (self::DEFAULTS[$part] as $k => $default) {
                settype($value[$k], gettype($default));   // a stored 1 is the same answer as true: each value reads back as the kind its default is
            }
            $this->cache[$part] = $value;
        }

        return $this->cache[$part];
    }

    public function defaultIndustry(): string
    {
        return (string) $this->get('general')['default_industry'];
    }

    /**
     * Save a part. Only the keys the part knows are kept; what is not given stays as it is.
     *
     * @param array<string, mixed> $input
     * @return array{version: int, value: array<string, mixed>, changed: string[]}
     */
    public function save(string $part, array $input, ?User $by, string $action = 'saved', ?string $note = null): array
    {
        $this->assertPart($part);
        if (! ProjectsSetup::ready()) {
            throw new ProjectException('Projects is not set up yet: run database script 257 first.', 409);
        }
        $old = $this->get($part);
        $new = $this->clean($part, array_merge($old, array_intersect_key($input, self::DEFAULTS[$part])));
        $changed = array_keys(array_filter($new, fn ($v, $k) => $v !== $old[$k], ARRAY_FILTER_USE_BOTH));
        if (! $changed && $action === 'saved') {
            return ['version' => $this->version($part), 'value' => $old, 'changed' => []];
        }

        $version = DB::transaction(function () use ($part, $new, $by, $action, $note) {
            $version = ((int) DB::table('project_setting_versions')->where('part', $part)->max('version')) + 1;
            $json = json_encode($new);
            DB::table('project_settings')->updateOrInsert(['part' => $part], ['value' => $json, 'version' => $version, 'updated_by' => $by?->id, 'updated_at' => now()]);
            DB::table('project_setting_versions')->insert(['part' => $part, 'version' => $version, 'value' => $json, 'note' => $note, 'saved_by' => $by?->id, 'saved_at' => now()]);
            DB::table('project_setting_logs')->insert(['part' => $part, 'action' => $action, 'version' => $version, 'user_id' => $by?->id, 'created_at' => now()]);

            return $version;
        });
        $this->cache[$part] = $new;
        ProjectLog::record(null, $by, 'settings.' . $action, 'settings', null, array_intersect_key($old, array_flip($changed)), array_intersect_key($new, array_flip($changed)));

        return ['version' => $version, 'value' => $new, 'changed' => $changed];
    }

    public function version(string $part): int
    {
        return ProjectsSetup::ready() ? (int) DB::table('project_settings')->where('part', $part)->value('version') : 0;
    }

    /** @return array<int, array<string, mixed>> newest first */
    public function versions(string $part): array
    {
        $this->assertPart($part);
        if (! ProjectsSetup::ready()) {
            return [];
        }
        $current = $this->version($part);

        return DB::table('project_setting_versions as v')->leftJoin('users as u', 'u.id', '=', 'v.saved_by')->where('v.part', $part)->orderByDesc('v.version')->limit(100)
            ->get(['v.version', 'v.value', 'v.note', 'v.saved_at', 'u.name as saved_by'])
            ->map(fn ($r) => ['version' => (int) $r->version, 'value' => json_decode((string) $r->value, true) ?: [], 'note' => $r->note, 'saved_at' => $r->saved_at, 'saved_by' => $r->saved_by, 'is_current' => (int) $r->version === $current])
            ->all();
    }

    /** What an earlier version held, or null when there is no such version. @return array<string, mixed>|null */
    public function versionValue(string $part, int $version): ?array
    {
        $this->assertPart($part);
        $value = ProjectsSetup::ready() ? DB::table('project_setting_versions')->where('part', $part)->where('version', $version)->value('value') : null;
        $value = is_string($value) ? json_decode($value, true) : null;

        return is_array($value) ? array_merge(self::DEFAULTS[$part], array_intersect_key($value, self::DEFAULTS[$part])) : null;
    }

    /** Bring an earlier version back, as a new version. @return array{version: int, value: array<string, mixed>, changed: string[]} */
    public function rollback(string $part, int $version, ?User $by): array
    {
        $value = $this->versionValue($part, $version);
        if ($value === null) {
            throw new ProjectException('That version does not exist.', 404);
        }

        return $this->save($part, $value, $by, 'rolled_back', "Brought back version {$version}");
    }

    /** @param array<string, mixed> $v */
    private function clean(string $part, array $v): array
    {
        if ($part === 'general') {
            $industry = (string) $v['default_industry'];
            if (! DB::table('project_industries')->where('key', $industry)->where('is_active', 1)->exists()) {
                throw new ProjectException('Choose an industry that is switched on.');
            }
            $days = (int) $v['trash_days'];
            if ($days < 1 || $days > 3650) {
                throw new ProjectException('Things can stay in the trash from 1 day to 10 years.');
            }

            return ['default_industry' => $industry, 'project_may_use_other_industry' => (bool) $v['project_may_use_other_industry'], 'trash_days' => $days];
        }

        if ($part === 'access') {
            $days = (int) $v['warn_days'];
            if ($days < 0 || $days > 90) {
                throw new ProjectException('Warn from 0 (never) to 90 days before an end date.');
            }

            $minutes = (int) $v['pass_minutes'];
            if ($minutes < 5 || $minutes > 1440) {
                throw new ProjectException('A pass lasts from 5 minutes to 24 hours.');
            }
            $hours = [];
            foreach (ProjectHours::tidy($v['default_hours']) as $day => $h) {
                $hours[] = ['day' => $day] + $h;
            }

            foreach (['unlock_minutes' => [1, 480, 'A locked area stays open from 1 minute to 8 hours.'], 'lock_tries' => [2, 20, 'Allow from 2 to 20 wrong tries.'],
                'lock_wait_minutes' => [1, 1440, 'The wait after too many wrong tries is from 1 minute to 24 hours.'], 'approval_hours' => [1, 168, 'A request for approval stays open from 1 hour to 7 days.']] as $k => [$min, $max, $why]) {
                if ((int) $v[$k] < $min || (int) $v[$k] > $max) {
                    throw new ProjectException($why);
                }
            }

            return ['warn_days' => $days, 'default_hours' => $hours, 'read_outside_hours' => (bool) $v['read_outside_hours'], 'passes' => (bool) $v['passes'], 'pass_minutes' => $minutes,
                'unlock_minutes' => (int) $v['unlock_minutes'], 'lock_tries' => (int) $v['lock_tries'], 'lock_wait_minutes' => (int) $v['lock_wait_minutes'], 'approval_hours' => (int) $v['approval_hours']];
        }

        if ($part === 'work') {
            if (! in_array((int) $v['rounding'], [0, 1, 6, 10, 15], true)) {
                throw new ProjectException('Round time to the minute, or up to 6, 10 or 15 minutes.');
            }
            if ((int) $v['timer_cap_hours'] < 1 || (int) $v['timer_cap_hours'] > 24) {
                throw new ProjectException('A forgotten timer stops after 1 to 24 hours.');
            }
            if (! in_array($v['attendance_check'], ['warn', 'refuse', 'off'], true)) {
                throw new ProjectException('Choose what happens when time is more than Attendance says was worked: warn, refuse or nothing.');
            }
            if (! in_array($v['approve_by'], ['lead', 'manager'], true)) {
                throw new ProjectException('Choose who approves time: the leads of the work, or the person\'s manager.');
            }
            $days = array_values(array_unique(array_filter(array_map('intval', explode(',', (string) $v['warn_days'])), fn ($d) => $d > 0 && $d <= 365)));
            rsort($days);
            $ledger = (int) $v['disbursement_ledger_id'];
            if ($ledger && \Illuminate\Support\Facades\Schema::hasTable('ledgers') && ! DB::table('ledgers')->where('id', $ledger)->exists()) {
                throw new ProjectException('Choose the ledger billed-back costs go to from the books.');
            }

            return ['rounding' => (int) $v['rounding'], 'timer_cap_hours' => (int) $v['timer_cap_hours'], 'attendance_check' => $v['attendance_check'], 'approve_by' => $v['approve_by'],
                'billable_default' => (bool) $v['billable_default'], 'warn_days' => implode(',', array_slice($days, 0, 6)), 'week_reminder' => (bool) $v['week_reminder'],
                'payroll_split' => (bool) $v['payroll_split'], 'disbursement_ledger_id' => $ledger];
        }

        if ($part === 'money') {
            if (! in_array($v['bill_mode'], ['post', 'draft'], true)) {
                throw new ProjectException('Choose whether bills are posted or prepared as drafts.');
            }
            if (! in_array($v['retention_mode'], ['company', 'client'], true)) {
                throw new ProjectException('Choose where retention goes: one company ledger, or a ledger per client.');
            }
            $rules = [];
            foreach (self::DEFAULTS['money']['voucher_project'] as $base => $default) {
                $rule = (string) ($v['voucher_project'][$base] ?? $default);
                if (! in_array($rule, ['required', 'optional', 'none'], true)) {
                    throw new ProjectException('Each kind of voucher takes a project as required, optional or not shown.');
                }
                $rules[$base] = $rule;
            }
            $ledger = (int) $v['retention_ledger_id'];
            if ($ledger && \Illuminate\Support\Facades\Schema::hasTable('ledgers') && ! DB::table('ledgers')->where('id', $ledger)->exists()) {
                throw new ProjectException('Choose a retention ledger from the books.');
            }

            return ['bill_mode' => $v['bill_mode'], 'retention_mode' => $v['retention_mode'], 'retention_ledger_id' => $ledger, 'voucher_project' => $rules];
        }

        if ($part === 'directory') {
            $levels = array_values(array_intersect(['clients', 'public'], array_map('strval', (array) $v['levels'])));

            return ['levels' => $levels];
        }

        if ($part === 'health') {
            $out = ['nothing_planned_amber' => (bool) $v['nothing_planned_amber']];
            foreach (['contact_amber_days', 'contact_red_days', 'late_red_days', 'overdue_amber_days', 'overdue_red_days'] as $k) {
                $n = (int) $v[$k];
                if ($n < 0 || $n > 3650) {
                    throw new ProjectException('Each number of days is from 0 (off) to 3,650.');
                }
                $out[$k] = $n;
            }
            foreach ([['contact_amber_days', 'contact_red_days', 'No contact'], ['overdue_amber_days', 'overdue_red_days', 'Money overdue']] as [$a, $r, $what]) {
                if ($out[$a] > 0 && $out[$r] > 0 && $out[$r] <= $out[$a]) {
                    throw new ProjectException("{$what}: red must come after amber.");
                }
            }

            return $out;
        }

        if ($part === 'security') {
            return ProjectSecurity::tidy($v);
        }

        if ($part === 'serious') {
            return ProjectSerious::tidy($v);
        }

        if ($part === 'shortcuts') {
            $keys = ProjectKeys::tidy($v);
            if ($why = ProjectKeys::problem($keys)) {
                throw new ProjectException($why);
            }

            return $keys;
        }

        return $v;
    }

    private function assertPart(string $part): void
    {
        if (! isset(self::DEFAULTS[$part])) {
            throw new ProjectException('There is no such part of the settings.', 404);
        }
    }
}
