<?php

namespace App\Services\Hr;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Who may see and change which employee records (docs/HR_STAGE1_SPEC.md). `hr.view` sees everyone; `hr.team` sees the people below them in the
 * HR line (their reports, and their reports' reports); everyone sees their own record. Changing needs `hr.manage`, or `hr.team` for one's line.
 */
class EmployeeAccess
{
    /** The three tiers of the record: who may see and change them is decided per tier (docs/HR_STAGE1_SPEC.md, "Fields sorted by who may see them"). */
    public const TIERS = [
        'work' => ['employee_number', 'employee_id', 'job_title', 'department', 'department_id', 'location_id', 'manager_id', 'employment_type', 'hire_date', 'termination_date',
            'work_location', 'work_phone', 'work_email', 'status', 'skills', 'certifications', 'notes', 'annual_leave_days', 'leave_balance'],
        'personal' => ['date_of_birth', 'gender', 'marital_status', 'education_level', 'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship'],
        'sensitive' => ['salary_grade', 'base_salary', 'currency', 'bank_name', 'bank_account_name', 'bank_account_number', 'id_number', 'kra_pin', 'nssf_number', 'nhif_number'],
    ];

    /** Shown masked to their last four until Show is pressed. */
    public const MASKED = ['bank_account_number', 'id_number', 'kra_pin', 'nssf_number', 'nhif_number'];

    /** What identity numbers a change of asks the person to confirm who they are (with the bank details). */
    public const ASSURED = ['bank_name', 'bank_account_number', 'bank_account_name', 'id_number', 'kra_pin', 'nssf_number', 'nhif_number'];

    /** @var array<int, int[]> */
    private array $lines = [];

    public function canList(User $u): bool
    {
        return $u->hasPermission('hr.view') || $u->hasPermission('hr.manage') || $u->hasPermission('hr.team') || $this->leads()->ledBy($u) !== [];
    }

    public function canSee(User $u, Employee $e): bool
    {
        return $u->hasPermission('hr.view') || $u->hasPermission('hr.manage') || (int) $e->user_id === (int) $u->id
            || ($u->hasPermission('hr.team') && $this->isAbove($u, $e)) || $this->leadOf($u, $e) !== null;
    }

    public function canChange(User $u, Employee $e): bool
    {
        return $u->hasPermission('hr.manage') || ($u->hasPermission('hr.team') && $this->isAbove($u, $e)) || $this->leadChanges($u, $e);
    }

    /** The user's lead role and sensitivity over this person's department, if they lead it (HR stage 1b). @return array{role: string, sensitivity: string}|null */
    public function leadOf(User $u, Employee $e): ?array
    {
        return $e->department_id ? ($this->leads()->ledBy($u)[(int) $e->department_id] ?? null) : null;
    }

    /** A head, or an assistant seeing personal or full, changes the work details of their department's people. */
    public function leadChanges(User $u, Employee $e): bool
    {
        $l = $this->leadOf($u, $e);

        return $l !== null && ($l['role'] === 'head' || $l['sensitivity'] !== 'work');
    }

    /** The tiers a lead sees of this person, by their sensitivity. @return string[] */
    public function leadTiers(User $u, Employee $e): array
    {
        $l = $this->leadOf($u, $e);

        return $l ? DepartmentLeads::TIERS[$l['sensitivity']] : [];
    }

    private function leads(): DepartmentLeads
    {
        return app(DepartmentLeads::class);
    }

    /** Only the records the person may see. */
    public function scope(Builder $q, User $u): Builder
    {
        if ($u->hasPermission('hr.view') || $u->hasPermission('hr.manage')) {
            return $q;
        }

        $depts = array_keys($this->leads()->ledBy($u));

        return $q->where(fn ($w) => $w->where('user_id', $u->id)->orWhereIn('id', $u->hasPermission('hr.team') ? ($this->lineOf($u) ?: [0]) : [0])->orWhereIn('department_id', $depts ?: [0]));
    }

    /** Is this person somewhere below the user in the HR line? */
    public function isAbove(User $u, Employee $e): bool
    {
        return in_array((int) $e->id, $this->lineOf($u), true);
    }

    /** The employee ids below the user (reports, and their reports), however deep. @return int[] */
    public function lineOf(User $u): array
    {
        if (isset($this->lines[$u->id])) {
            return $this->lines[$u->id];
        }
        $me = Employee::where('user_id', $u->id)->value('id');
        $out = [];
        $frontier = $me ? [(int) $me] : [];
        while ($frontier && count($out) < 5000) {
            $next = Employee::whereIn('manager_id', $frontier)->pluck('id')->map(fn ($i) => (int) $i)->all();
            $next = array_values(array_diff($next, $out, [(int) $me]));   // a loop in the line stops here
            $out = array_merge($out, $next);
            $frontier = $next;
        }

        return $this->lines[$u->id] = $out;
    }

    public static function tierOf(string $field): ?string
    {
        foreach (self::TIERS as $tier => $fields) {
            if (in_array($field, $fields, true)) {
                return $tier;
            }
        }

        return null;
    }

    /** The tiers this user may see of this record. @return string[] */
    public function seen(User $u, Employee $e): array
    {
        if (! $this->canSee($u, $e)) {
            return [];
        }
        $own = (int) $e->user_id === (int) $u->id;
        $tiers = ['work'];
        if ($own || $u->hasPermission('hr.view') || $u->hasPermission('hr.manage') || ($u->hasPermission('hr.team') && $this->isAbove($u, $e))) {
            $tiers[] = 'personal';   // managers see their line's personal tier (choice 3)
        }
        if ($u->hasPermission('hr.sensitive') || ($own && app(HrSettings::class)->get()['own_details'])) {
            $tiers[] = 'sensitive';
        }
        if (! $u->hasPermission('hr.view') && ! $u->hasPermission('hr.manage') && ! $own && ! ($u->hasPermission('hr.team') && $this->isAbove($u, $e))) {
            return $this->leadTiers($u, $e) ?: ['work'];   // only a lead: exactly their sensitivity, whatever else they hold
        }

        return array_values(array_unique(array_merge($tiers, array_intersect($this->leadTiers($u, $e), ['personal']))));
    }

    /** The tiers this user may change of this record (null: a new record). @return string[] */
    public function changeable(User $u, ?Employee $e): array
    {
        if ($u->hasPermission('hr.manage')) {
            return $u->hasPermission('hr.sensitive') ? ['work', 'personal', 'sensitive'] : ['work', 'personal'];
        }

        return $e && (($u->hasPermission('hr.team') && $this->isAbove($u, $e)) || $this->leadChanges($u, $e)) ? ['work'] : [];   // managers and department leads change work fields only
    }

    /** The fields of $input the user may not change, by tier. @return array<string, string[]> tier => fields */
    public function refused(User $u, ?Employee $e, array $input): array
    {
        $may = $this->changeable($u, $e);
        $out = [];
        foreach ($input as $field => $value) {
            $tier = self::tierOf((string) $field);
            if (! $tier || in_array($tier, $may, true)) {
                continue;
            }
            $now = $e ? EmployeeHistory::text($e->getAttribute($field)) : '';
            $new = EmployeeHistory::text($value);
            if ($new !== $now && ! (is_numeric($new) && is_numeric($now) && (float) $new === (float) $now)) {   // a form sends every field: only a real change counts
                $out[$tier][] = (string) $field;
            }
        }

        return $out;
    }

    /** What this user is sent of a record: the tiers they may see, numbers masked, plus which tiers and what they may do. @return array<string, mixed> */
    public function shape(Employee $e, User $u): array
    {
        $seen = $this->seen($u, $e);
        $a = $e->toArray();   // pay and identity details are hidden on the model
        foreach (['manager', 'subordinates'] as $rel) {   // the people around them: who they are, never their details
            if ($e->relationLoaded($rel)) {
                $a[$rel] = $rel === 'manager' ? ($e->manager ? $this->brief($e->manager) : null) : $e->subordinates->map(fn ($x) => $this->brief($x))->values()->all();
            }
        }
        if (! in_array('personal', $seen, true)) {
            $a = array_diff_key($a, array_flip(self::TIERS['personal']));
            unset($a['age']);
        }
        if (in_array('sensitive', $seen, true)) {
            foreach (self::TIERS['sensitive'] as $f) {
                $v = $e->getAttribute($f);
                $a[$f] = in_array($f, self::MASKED, true) ? self::mask($v) : $v;
            }
        }
        $may = $this->changeable($u, $e);

        return $a + ['tiers' => $seen, 'can' => ['change' => $may, 'show' => in_array('sensitive', $seen, true), 'delete' => $u->hasPermission('hr.manage'), 'purge' => $u->hasPermission('hr.purge')]];
    }

    /** @return array<string, mixed> */
    private function brief(Employee $x): array
    {
        return ['id' => $x->id, 'user_id' => $x->user_id, 'employee_number' => $x->employee_number, 'job_title' => $x->job_title, 'department' => $x->department, 'status' => $x->status,
            'user' => $x->relationLoaded('user') && $x->user ? ['id' => $x->user->id, 'name' => $x->user->name, 'email' => $x->user->email] : null];
    }

    /** A masked value sent back by a form ("••••4471") means "unchanged": it is taken out before anything is saved. */
    public static function stripMasked(\Illuminate\Http\Request $request): void
    {
        foreach (self::MASKED as $f) {
            if (is_string($request->input($f)) && str_starts_with($request->input($f), '••••')) {
                $request->offsetUnset($f);
            }
        }
    }

    /** "••••4471": the last four characters, or nothing to show. */
    public static function mask($v): ?string
    {
        $v = trim((string) $v);
        if ($v === '') {
            return null;
        }

        return str_repeat('•', 4) . mb_substr($v, -min(4, max(1, mb_strlen($v) - 2)));
    }
}
