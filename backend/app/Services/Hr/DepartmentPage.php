<?php

namespace App\Services\Hr;

use App\Models\Department;
use App\Models\Employee;
use App\Models\User;
use App\Services\CostCentres\CostCentreService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * A department's page (docs/HR_STAGE1B_SPEC.md, build D.2): its branch, leads and people; its cost centre and what it spent, from Books, with
 * books.view (choice 4); with Projects licensed, the work it owns. People are moved in and out here by HR or the department's head.
 */
class DepartmentPage
{
    public function __construct(private EmployeeAccess $access, private DepartmentLeads $leads) {}

    public function maySee(User $u, Department $d): bool
    {
        return $u->hasPermission('hr.view') || $u->hasPermission('hr.manage') || isset($this->leads->ledBy($u)[$d->id]);
    }

    /** May this user move people in or out of this department? HR, or its head. */
    public function mayMove(User $u, Department $d): bool
    {
        return $u->hasPermission('hr.manage') || (($this->leads->ledBy($u)[$d->id]['role'] ?? null) === 'head');
    }

    /** @return array<string, mixed> */
    public function show(Department $d, User $u): array
    {
        $this->maySee($u, $d) || throw ValidationException::withMessages(['department' => 'This department is for HR and its leads.'])->status(403);
        $d->loadMissing('location:id,name,code', 'costCentre:id,name,code');
        $people = $this->access->scope(Employee::with(['user:id,name,email', 'manager.user:id,name'])->where('department_id', $d->id), $u)->orderBy('job_title')->get()
            ->map(fn ($e) => ['id' => $e->id, 'name' => $e->user?->name, 'employee_number' => $e->employee_number, 'job_title' => $e->job_title, 'status' => $e->status, 'manager' => $e->manager?->user?->name,
                'lead' => collect($this->leads->of($d->id))->firstWhere('employee_id', $e->id)['role'] ?? null])->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)->values()->all();

        return [
            'department' => ['id' => $d->id, 'name' => $d->name, 'code' => $d->code, 'is_active' => (bool) $d->is_active, 'branch' => $d->location?->name, 'location_id' => $d->location_id,
                'cost_centre' => $d->costCentre ? ['id' => $d->costCentre->id, 'name' => $d->costCentre->name, 'code' => $d->costCentre->code, 'path' => $this->path((int) $d->costCentre->id)] : null],
            'leads' => $this->leads->of($d->id),
            'needs_full_lead' => $d->is_active && ! $this->leads->hasFull($d->id),
            'people' => $people,
            'spend' => $u->hasPermission('books.view') ? $this->spend($d) : null,   // choice 4: figures from Books only for those who may see the books
            'projects' => $this->projects($d, $u),
            'others' => $this->mayMove($u, $d) ? Employee::with('user:id,name')->whereIn('status', ['active', 'probation', 'on_leave'])->where(fn ($q) => $q->whereNull('department_id')->orWhere('department_id', '!=', $d->id))
                ->get()->map(fn ($e) => ['id' => $e->id, 'name' => $e->user?->name, 'department_id' => $e->department_id])->sortBy('name')->values()->all() : [],
            'departments' => $this->mayMove($u, $d) ? Department::with('location:id,name')->where('is_active', true)->whereKeyNot($d->id)->orderBy('location_id')->orderBy('name')->get()
                ->map(fn ($x) => ['id' => $x->id, 'label' => trim(($x->location?->name ?? '') . ' › ' . $x->name, ' ›')])->all() : [],
            'can' => ['move' => $this->mayMove($u, $d), 'leads' => $u->hasPermission('hr.manage'), 'money' => $u->hasPermission('books.view')],
        ];
    }

    /** Move a person into $to (from wherever they are), or out of this department into another. HR, or the head of every department involved. */
    public function move(Department $page, int $employeeId, int $toDepartmentId, User $by): void
    {
        $e = Employee::find($employeeId) ?? throw ValidationException::withMessages(['employee_id' => 'Choose someone with an employee record.']);
        $to = Department::where('is_active', true)->find($toDepartmentId) ?? throw ValidationException::withMessages(['department_id' => 'Choose a department that is in use.']);
        $from = $e->department_id ? Department::find($e->department_id) : null;
        in_array($page->id, [$to->id, $from?->id], true) || throw ValidationException::withMessages(['department_id' => 'Move people into or out of this department.']);
        foreach (array_filter([$from, $to]) as $dept) {
            $this->mayMove($by, $dept) || throw ValidationException::withMessages(['department_id' => "Moving people in or out of {$dept->name} is for HR or its head."])->status(403);
        }
        $org = app(\App\Services\Departments\DepartmentService::class)->textFor((int) $to->location_id, (int) $to->id);   // the branch follows the department: a department is never without its branch
        EmployeeHistory::as('changed', $by, 'Moved on the department page', function () use ($e, $org) {
            $e->update($org);
            app(\App\Services\Departments\DepartmentService::class)->setHome($e->fresh());
        });
        if ($e->user) {
            $e->user->update(['department' => $org['department'] ?? $to->name]);
        }
    }

    /** Spend and income this month and this year on the department's cost centre and everything under it (its projects included). @return array<string, mixed>|null */
    public function spend(Department $d): ?array
    {
        if (! $d->cost_centre_id || ! Schema::hasTable('vouchers') || ! Schema::hasTable('voucher_entries') || ! Schema::hasTable('ledger_groups')) {
            return null;
        }
        $cc = app(CostCentreService::class)->withDescendants((int) $d->cost_centre_id);
        $month = [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()];
        $year = [now()->startOfYear()->toDateString(), now()->endOfYear()->toDateString()];

        return ['currency' => Schema::hasTable('currencies') ? DB::table('currencies')->where('is_base', 1)->value('code') : null, 'cost_centres' => count($cc),
            'month' => ['spent' => $this->sum($cc, 'expense', $month), 'income' => $this->sum($cc, 'income', $month)],
            'year' => ['spent' => $this->sum($cc, 'expense', $year), 'income' => $this->sum($cc, 'income', $year)]];
    }

    /** The open work this department owns, that the viewer may open (Projects licensed, switched on or off). @return array<int, array<string, mixed>> */
    public function projects(Department $d, User $u): array
    {
        if (! Schema::hasTable('project_owners') || ! Schema::hasTable('projects') || ! app(\App\Services\Licensing\LicenseManager::class)->isLicensed('projects')) {
            return [];
        }
        $ids = DB::table('project_owners')->where('department_id', $d->id)->pluck('is_lead', 'project_id');

        return app(\App\Services\Projects\ProjectAccess::class)->visible(DB::table('projects as p'), $u)->whereIn('p.id', $ids->keys()->all() ?: [0])->whereIn('p.state', ['open', 'on_hold'])
            ->orderBy('p.number')->get(['p.id', 'p.number', 'p.title', 'p.state'])->map(fn ($p) => ['id' => (int) $p->id, 'number' => $p->number, 'title' => $p->title, 'state' => $p->state, 'lead' => (bool) $ids[$p->id]])->all();
    }

    private function sum(array $cc, string $nature, array $between): float
    {
        $lineCc = Schema::hasColumn('voucher_entries', 'cost_centre_id');
        $amount = Schema::hasColumn('voucher_entries', 'base_amount') ? 'COALESCE(e.base_amount, e.amount)' : 'e.amount';
        $r = DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id')->join('ledgers as l', 'l.id', '=', 'e.ledger_id')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')
            ->where('v.status', 'posted')->where('g.nature', $nature)->whereBetween('v.date', $between)
            ->whereIn($lineCc ? DB::raw('COALESCE(e.cost_centre_id, v.cost_centre_id)') : 'v.cost_centre_id', $cc)
            ->selectRaw("SUM(CASE WHEN e.side = 'D' THEN {$amount} ELSE 0 END) as dr, SUM(CASE WHEN e.side = 'C' THEN {$amount} ELSE 0 END) as cr")->first();

        return round($nature === 'expense' ? (float) $r->dr - (float) $r->cr : (float) $r->cr - (float) $r->dr, 2);
    }

    private function path(int $ccId): string
    {
        $names = [];
        $id = $ccId;
        for ($i = 0; $id && $i < 10; $i++) {
            $c = DB::table('cost_centres')->where('id', $id)->first(['name', 'parent_id']);
            if (! $c) {
                break;
            }
            array_unshift($names, $c->name);
            $id = $c->parent_id;
        }

        return implode(' › ', $names);
    }
}
