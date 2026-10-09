<?php

namespace App\Services\Departments;

use App\Models\CostCentre;
use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeCostCentre;
use App\Models\Location;
use App\Services\CostCentres\CostCentreService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Departments (one row per branch), the cost centre each owns, and an employee's cost centre shares.
 */
class DepartmentService
{
    public function __construct(private CostCentreService $costCentres) {}

    /** Make a department at a branch with its own cost centre under the branch's. If it exists already, that one is returned. */
    public function create(int $locationId, string $name, ?string $code = null, ?int $managerEmployeeId = null): Department
    {
        $name = trim($name);
        $existing = Department::where('location_id', $locationId)->where('name', $name)->first();
        if ($existing) {
            return $existing;
        }
        $loc = Location::findOrFail($locationId);

        return DB::transaction(function () use ($loc, $name, $code, $managerEmployeeId) {
            $branchCc = $this->costCentres->ensureForLocation($loc);
            $cc = $this->costCentres->create(['name' => $name, 'parent_id' => $branchCc?->id, 'location_id' => $loc->id, 'purpose' => 'department', 'code' => $code ? $loc->code . '-' . $code : null]);

            return Department::create(['location_id' => $loc->id, 'name' => $name, 'code' => $code, 'cost_centre_id' => $cc->id, 'manager_employee_id' => $managerEmployeeId, 'is_active' => true]);
        });
    }

    /** The same department at several branches in one go (each gets its own row and cost centre). Returns the departments, new or found. */
    public function addToLocations(string $name, array $locationIds): array
    {
        return array_map(fn ($id) => $this->create((int) $id, $name), array_values(array_unique($locationIds)));
    }

    public function update(Department $d, array $data): Department
    {
        return DB::transaction(function () use ($d, $data) {
            if (isset($data['name']) && trim($data['name']) !== $d->name) {
                $name = trim($data['name']);
                if (Department::where('location_id', $d->location_id)->where('name', $name)->whereKeyNot($d->id)->exists()) {
                    throw ValidationException::withMessages(['name' => 'This branch already has a department with that name.']);
                }
                $d->name = $name;
                if ($d->cost_centre_id) {
                    CostCentre::whereKey($d->cost_centre_id)->update(['name' => $name]);
                }
                // keep the old text columns in step
                Employee::where('department_id', $d->id)->update(['department' => $name]);
                DB::table('users')->whereIn('id', Employee::where('department_id', $d->id)->pluck('user_id'))->update(['department' => $name]);
            }
            foreach (['code', 'manager_employee_id', 'is_active'] as $k) {
                if (array_key_exists($k, $data)) {
                    $d->{$k} = $data[$k];
                }
            }
            if (array_key_exists('is_active', $data) && $d->cost_centre_id) {
                CostCentre::whereKey($d->cost_centre_id)->update(['is_active' => (bool) $data['is_active']]);
            }
            $d->save();

            return $d;
        });
    }

    public function delete(Department $d): void
    {
        if ($d->employees()->exists()) {
            throw ValidationException::withMessages(['id' => 'People still work in this department. Move them first, or switch it off.']);
        }
        DB::transaction(function () use ($d) {
            $ccId = $d->cost_centre_id;
            $d->delete();
            if ($ccId && ($cc = CostCentre::find($ccId))) {
                try {
                    $this->costCentres->delete($cc);
                } catch (ValidationException) {
                    $cc->update(['is_active' => false]);   // it has children or is used: keep it, switched off
                }
            }
        });
    }

    // ------------------------------------------------------- the employee

    /**
     * What an employee form sends (location_id, department_id) becomes the old text columns too, so everything that still reads the text keeps
     * working. A department must belong to the chosen branch. Returns the fields to merge into the employee (and the user's department).
     */
    public function textFor(?int $locationId, ?int $departmentId): array
    {
        $out = [];
        if ($departmentId) {
            $d = Department::findOrFail($departmentId);
            if ($locationId && (int) $d->location_id !== $locationId) {
                throw ValidationException::withMessages(['department_id' => 'That department belongs to another branch.']);
            }
            $locationId = (int) $d->location_id;
            $out['department'] = $d->name;
            $out['department_id'] = $d->id;
        }
        if ($locationId) {
            $out['location_id'] = $locationId;
            $out['work_location'] = Location::whereKey($locationId)->value('name');
        }

        return $out;
    }

    /**
     * Cost centre shares for an employee. Rows must be valid; on every date the shares in force must total 100 (a gap, or more than 100, is refused).
     * Rows: cost_centre_id, kind, share_percent, valid_from, valid_to (dates optional).
     */
    public function saveShares(Employee $e, array $rows): array
    {
        $rows = array_values($rows);
        if (! $rows) {
            throw ValidationException::withMessages(['shares' => 'Give at least one cost centre.']);
        }
        foreach ($rows as $i => $r) {
            if (! CostCentre::active()->whereKey((int) ($r['cost_centre_id'] ?? 0))->exists()) {
                throw ValidationException::withMessages(["shares.$i.cost_centre_id" => 'Pick an active cost centre.']);
            }
            if (! empty($r['valid_from']) && ! empty($r['valid_to']) && $r['valid_to'] < $r['valid_from']) {
                throw ValidationException::withMessages(["shares.$i.valid_to" => 'The end date is before the start date.']);
            }
        }
        $problem = $this->shareProblem($rows);
        if ($problem) {
            throw ValidationException::withMessages(['shares' => $problem]);
        }
        DB::transaction(function () use ($e, $rows) {
            EmployeeCostCentre::where('employee_id', $e->id)->delete();
            foreach ($rows as $r) {
                EmployeeCostCentre::create(['employee_id' => $e->id, 'cost_centre_id' => (int) $r['cost_centre_id'], 'kind' => $r['kind'] ?? 'home',
                    'share_percent' => round((float) $r['share_percent'], 2), 'valid_from' => $r['valid_from'] ?? null ?: null, 'valid_to' => $r['valid_to'] ?? null ?: null]);
            }
        });

        return $this->shares($e);
    }

    public function shares(Employee $e): array
    {
        return EmployeeCostCentre::with('costCentre:id,name,code')->where('employee_id', $e->id)->orderBy('valid_from')->get()->toArray();
    }

    /** Null when the shares total 100 on every date from the earliest to the latest edge; otherwise the message. */
    public function shareProblem(array $rows): ?string
    {
        $inf = Carbon::create(1900, 1, 1);
        $far = Carbon::create(2999, 12, 31);
        $from = fn ($r) => empty($r['valid_from']) ? $inf : Carbon::parse($r['valid_from']);
        $to = fn ($r) => empty($r['valid_to']) ? $far : Carbon::parse($r['valid_to']);
        // every date a share starts or stops is a place the total can change
        $points = [$inf->toDateString() => $inf];
        foreach ($rows as $r) {
            $points[$from($r)->toDateString()] = $from($r);
            $points[$to($r)->copy()->addDay()->toDateString()] = $to($r)->copy()->addDay();
        }
        ksort($points);
        foreach ($points as $day) {
            if ($day > $far) {
                continue;
            }
            $total = 0.0;
            foreach ($rows as $r) {
                if ($from($r) <= $day && $to($r) >= $day) {
                    $total += (float) $r['share_percent'];
                }
            }
            if (abs($total - 100) > 0.005) {
                $when = $day->equalTo($inf) ? 'before the first date given' : 'from ' . $day->format('j M Y');

                return 'The shares must total 100% on every date: they add up to ' . rtrim(rtrim(number_format($total, 2, '.', ''), '0'), '.') . '% ' . $when . '.';
            }
        }

        return null;
    }

    /** The home row follows the department: used when an employee is created or moved. */
    public function setHome(Employee $e): void
    {
        $ccId = $e->department_id ? Department::whereKey($e->department_id)->value('cost_centre_id') : null;
        if (! $ccId) {
            return;
        }
        $home = EmployeeCostCentre::where('employee_id', $e->id)->where('kind', 'home')->whereNull('valid_from')->whereNull('valid_to')->first();
        if ($home) {
            $home->update(['cost_centre_id' => $ccId]);
        } elseif (! EmployeeCostCentre::where('employee_id', $e->id)->exists()) {
            EmployeeCostCentre::create(['employee_id' => $e->id, 'cost_centre_id' => $ccId, 'kind' => 'home', 'share_percent' => 100]);
        }
    }
}
