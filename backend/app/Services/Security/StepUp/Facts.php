<?php

namespace App\Services\Security\StepUp;

use App\Models\Employee;
use App\Models\PayrollRun;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Access\Catalog;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * What the "is this what you meant?" screen says for each sensitive action, in words a person can check: the name of the person affected, the amount, the account the pay would go to - read from our own records,
 * never from the browser's idea of what it is doing. A rule with no entry here (or one that fails to read its record) falls back to the plain list of values (see StepUp::facts).
 * Secrets are named, never shown.
 */
final class Facts
{
    /** Teach StepUp how each rule says what it is about (a describer a feature or a test has already registered is left alone). */
    public static function register(): void
    {
        StepUp::describeDefault('security_settings', fn (Request $r) => self::securitySettings($r));
        StepUp::describeDefault('payment_keys', fn (Request $r) => self::paymentKeys($r));
        StepUp::describeDefault('access_change', fn (Request $r) => self::access($r));
        StepUp::describeDefault('staff_account', fn (Request $r) => self::person($r, 'Account'));
        StepUp::describeDefault('signin_reset', fn (Request $r) => self::person($r, 'Whose sign-in'));
        StepUp::describeDefault('payroll_run', fn (Request $r) => self::payroll($r));
        StepUp::describeDefault('bank_details', fn (Request $r) => self::bank($r));
    }

    private static function yes(mixed $v): string
    {
        return filter_var($v, FILTER_VALIDATE_BOOLEAN) ? 'Yes' : 'No';
    }

    private static function userLine(?User $u): string
    {
        return $u ? trim($u->name.' ('.$u->email.', '.$u->role.')') : 'an account that could not be found';
    }

    /** @return array<int, array{label: string, value: string}> */
    private static function securitySettings(Request $r): array
    {
        $names = app(Authorizer::class)->roleNames();
        $mode = ['off' => 'Off: nothing changes', 'log' => 'Test: nobody is stopped, it is only written down', 'enforce' => 'On: people the rule is for are held back until they add a passkey'][(string) $r->input('mode')] ?? (string) $r->input('mode');
        $facts = [['label' => 'The passkey rule', 'value' => $mode], ['label' => 'Applies from', 'value' => $r->input('enforce_from') ?: 'not set']];
        if ($r->has('roles')) {
            $facts[] = ['label' => 'For these roles', 'value' => implode(', ', array_map(fn ($k) => $names[$k] ?? $k, (array) $r->input('roles'))) ?: 'none'];
        }
        if ($r->has('permissions')) {
            $facts[] = ['label' => 'And anyone who can', 'value' => implode('; ', array_map(fn ($k) => Catalog::PERMISSIONS[$k][2] ?? $k, (array) $r->input('permissions'))) ?: 'nothing'];
        }
        if ($r->has('owner_roles')) {
            $facts[] = ['label' => 'Needing two passkeys', 'value' => implode(', ', array_map(fn ($k) => $names[$k] ?? $k, (array) $r->input('owner_roles'))) ?: 'none'];
        }
        if ($r->has('owner_device_bound')) {
            $facts[] = ['label' => 'Their two stay on the device', 'value' => self::yes($r->input('owner_device_bound'))];
        }

        return $facts;
    }

    /** @return array<int, array{label: string, value: string}> */
    private static function paymentKeys(Request $r): array
    {
        $uri = (string) $r->route()?->uri();
        $action = match (true) {
            str_contains($uri, 'purge-keys') => 'Delete the keys kept in old versions',
            str_contains($uri, 'rotate-token') => 'Make a new callback token',
            str_contains($uri, '/reset') => 'Clear this part back to its defaults',
            str_contains($uri, 'rollback') => 'Go back to an earlier version of the keys (number '.$r->route('id').')',
            default => 'Save new payment settings',
        };
        $facts = [['label' => 'Which keys', 'value' => Str::headline((string) ($r->route('part') ?? 'payment'))], ['label' => 'Change', 'value' => $action]];
        $fields = array_keys(array_diff_key($r->all(), array_flip(['password', 'current_password', 'anyway', 'clear', 'reason'])));
        if ($fields) {
            $facts[] = ['label' => 'Fields being set', 'value' => implode(', ', array_map(fn ($f) => Str::headline($f), $fields)).' (the values are not shown)'];
        }
        if ($r->filled('clear')) {
            $facts[] = ['label' => 'Fields being emptied', 'value' => implode(', ', array_map(fn ($f) => Str::headline((string) $f), (array) $r->input('clear')))];
        }

        return $facts;
    }

    /** @return array<int, array{label: string, value: string}> */
    private static function access(Request $r): array
    {
        $uri = (string) $r->route()?->uri();
        $who = $r->route('id') && str_contains($uri, 'access/users/') ? User::find((int) $r->route('id')) : null;
        $facts = [];
        if (str_contains($uri, 'access/users/')) {
            $facts[] = ['label' => 'Person', 'value' => self::userLine($who)];
        }
        $what = match (true) {
            str_contains($uri, '/clearance') => 'Set their clearance level to '.$r->input('level', $r->input('clearance', '?')),
            str_contains($uri, '/primary-role') => 'Make their main role "'.$r->input('role', $r->input('role_key', '?')).'"',
            str_contains($uri, '/default-location') => 'Set their default branch',
            str_contains($uri, '/grants') && $r->isMethod('delete') => 'Take away a branch or access grant (number '.$r->route('grantId').')',
            str_contains($uri, '/grants') => 'Give them access to a branch or area',
            str_contains($uri, '/roles') && $r->isMethod('delete') && str_contains($uri, 'users') => 'Take away a role (number '.$r->route('roleId').')',
            str_contains($uri, 'users') && str_contains($uri, '/roles') => 'Give them another role',
            str_contains($uri, 'access/roles') && $r->isMethod('delete') => 'Delete a role (number '.$r->route('id').')',
            str_contains($uri, 'access/roles') && $r->isMethod('post') => 'Create a new role "'.$r->input('name', '').'"',
            str_contains($uri, 'access/roles') => 'Change what a role can do (number '.$r->route('id').')',
            str_contains($uri, 'levels') => 'Rename a clearance level',
            str_contains($uri, 'scope-modes') => 'Change how branch limits are applied',
            default => 'Change access',
        };
        $facts[] = ['label' => 'Change', 'value' => $what];
        foreach (['role', 'role_id', 'level', 'name', 'permissions', 'location_id', 'mode', 'area'] as $k) {
            if ($r->filled($k)) {
                $v = $r->input($k);
                $facts[] = ['label' => Str::headline($k), 'value' => Str::limit(is_scalar($v) ? (string) $v : (string) json_encode($v), 200)];
            }
        }

        return $facts;
    }

    /** @return array<int, array{label: string, value: string}> */
    private static function person(Request $r, string $label): array
    {
        $uri = (string) $r->route()?->uri();
        $who = $r->route('id') ? User::find((int) $r->route('id')) : null;
        $what = match (true) {
            str_contains($uri, 'force-password-reset') => 'They must choose a new password, and every sign-in of theirs ends now',
            str_contains($uri, 'reset-password') => 'Set a new password for them',
            str_contains($uri, 'update-status') => 'Change their status to "'.$r->input('status').'"'.($r->input('status') === 'suspended' ? ' (they are signed out and cannot sign in)' : ''),
            $r->isMethod('delete') => 'Delete the account',
            $r->isMethod('post') => 'Create a staff account with the role "'.$r->input('role').'" for '.trim($r->input('name').' <'.$r->input('email').'>'),
            default => 'Change the account'.($r->filled('role') ? ' (new role: "'.$r->input('role').'")' : ''),
        };

        return $r->isMethod('post') && ! $who ? [['label' => 'Change', 'value' => $what]] : [['label' => $label, 'value' => self::userLine($who)], ['label' => 'Change', 'value' => $what]];
    }

    /** @return array<int, array{label: string, value: string}> */
    private static function payroll(Request $r): array
    {
        $run = $r->route('id') ? PayrollRun::find((int) $r->route('id')) : null;
        $uri = (string) $r->route()?->uri();
        $facts = [['label' => 'Change', 'value' => str_contains($uri, '/pay') ? 'Pay the salaries' : 'Approve the payroll run']];
        if ($run) {
            $facts[] = ['label' => 'Payroll run', 'value' => trim($run->number.' - '.$run->period_start?->toDateString().' to '.$run->period_end?->toDateString())];
            $facts[] = ['label' => 'Total net pay', 'value' => number_format((float) $run->total_net, 2)];
            $facts[] = ['label' => 'Total cost', 'value' => number_format((float) $run->total_gross + (float) $run->total_employer, 2)];
        }

        return $facts;
    }

    /** @return array<int, array{label: string, value: string}> */
    private static function bank(Request $r): array
    {
        $facts = [];
        $employee = str_contains((string) $r->route()?->uri(), 'employees') && $r->route('id') ? Employee::find((int) $r->route('id')) : null;
        $keys = $employee ? ['bank_name', 'bank_account_number', 'bank_account_name'] : ['bank_name', 'account_number', 'account_name', 'swift_code', 'branch_code', 'mobile_kind', 'mobile_number'];
        if ($employee) {
            $facts[] = ['label' => 'Whose pay', 'value' => trim((string) ($employee->user?->name ?? 'Employee '.$employee->employee_id))];
        }
        foreach ($keys as $k) {
            if ($r->has($k)) {
                $old = $employee ? trim((string) $employee->{$k}) : '';
                $new = trim((string) $r->input($k));
                if ($new !== $old) {
                    $facts[] = ['label' => Str::headline($k), 'value' => ($old !== '' ? "{$old}  →  " : 'new: ').($new !== '' ? $new : '(emptied)')];
                }
            }
        }

        return $facts;
    }
}
