<?php

namespace App\Services\Projects;

use App\Models\CostCentre;
use App\Models\Location;
use App\Services\CostCentres\CostCentreService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * A project is a cost centre in the books: everything it costs and earns is a voucher that carries it, and Projects only ever reads those
 * vouchers. The cost centre is made with the project, under the branch's own "Projects" cost centre:
 *     Nairobi > Projects > M-0413 Imara Sacco v. Baraka Traders
 * Before the books have cost centres (script 100 not run) a project simply has none yet.
 */
class ProjectCostCentres
{
    public function __construct(private CostCentreService $costCentres) {}

    private ?bool $ready = null;

    public function ready(): bool
    {
        return $this->ready ??= Schema::hasTable('cost_centres');
    }

    /** Make the cost centre of a new project. Null when the books have no cost centres yet. */
    public function forProject(string $number, string $title, ?int $locationId): ?CostCentre
    {
        if (! $this->ready()) {
            return null;
        }
        $parent = $this->projectsParent($locationId);

        return $this->costCentres->create(['parent_id' => $parent->id, 'name' => $this->name($number, $title), 'code' => $number, 'purpose' => 'project',
            'description' => 'Made by Projects for ' . $number, 'sort_order' => 100]);
    }

    /** A cost centre for one phase, under the cost centre the phase above it uses. Null when the books have none or there is nothing to nest it under. */
    public function forPhase(?int $parentCostCentreId, string $projectNumber, string $label): ?CostCentre
    {
        if (! $this->ready() || ! $parentCostCentreId || ! CostCentre::whereKey($parentCostCentreId)->exists()) {
            return null;
        }

        return $this->costCentres->create(['parent_id' => $parentCostCentreId, 'name' => Str::limit($label, 117, '...'), 'code' => $projectNumber . '-' . $label, 'purpose' => 'project_phase',
            'description' => 'Made by Projects for a part of ' . $projectNumber, 'sort_order' => 100]);
    }

    public function renamePhase(int $costCentreId, string $label): void
    {
        if ($this->ready() && ($cc = CostCentre::find($costCentreId))) {
            $cc->update(['name' => Str::limit($label, 117, '...')]);
        }
    }

    /** Keep the cost centre's name in step when the project is renamed. */
    public function rename(?int $costCentreId, string $number, string $title): void
    {
        if ($costCentreId && $this->ready() && ($cc = CostCentre::find($costCentreId))) {
            $cc->update(['name' => $this->name($number, $title)]);
        }
    }

    /** "Nairobi > Projects > M-0413 Title" for the screen. */
    public function path(?int $costCentreId): ?string
    {
        if (! $costCentreId || ! $this->ready()) {
            return null;
        }
        $names = [];
        $seen = 0;
        for ($cc = CostCentre::find($costCentreId); $cc && $seen++ < 12; $cc = $cc->parent_id ? CostCentre::find($cc->parent_id) : null) {
            array_unshift($names, $cc->name);
        }

        return $names ? implode(' › ', $names) : null;
    }

    /** The "Projects" cost centre of a branch (or the free-standing one when the project has no branch), made the first time it is needed. */
    /**
     * Where a project's cost centre is filed (HR stage 1b): under its lead owner's department when it has one, else under the branch's "Projects".
     * Books nests cost centres, so a department's figures include its projects.
     */
    public function parentFor(?int $locationId, ?int $departmentId): ?CostCentre
    {
        if (! $this->ready()) {
            return null;
        }
        if ($departmentId && ($cc = DB::table('departments')->where('id', $departmentId)->value('cost_centre_id')) && ($found = CostCentre::find($cc))) {
            return $found;
        }

        return $this->projectsParent($locationId);
    }

    /** File a project's cost centre under another parent (past entries stay on the same cost centre; only the roll-up changes). */
    public function moveUnder(?int $costCentreId, ?CostCentre $parent, ?int $locationId): void
    {
        if ($costCentreId && $parent && (int) $parent->id !== $costCentreId) {
            CostCentre::whereKey($costCentreId)->update(['parent_id' => $parent->id, 'location_id' => $locationId]);
        }
    }

    private function projectsParent(?int $locationId): CostCentre
    {
        // the branch's own cost centre is made with the branch (LocationCostCentreObserver); a branch without one yet gets a free-standing "Projects"
        $branch = null;
        if ($locationId && Schema::hasTable('locations') && ($location = Location::find($locationId))) {
            $branch = ($location->cost_centre_id ? CostCentre::find($location->cost_centre_id) : null) ?: CostCentre::where('location_id', $location->id)->where('type', 'branch')->first();
        }
        $found = CostCentre::where('purpose', 'projects')->where('parent_id', $branch?->id)->orderBy('id')->first();

        return $found ?: $this->costCentres->create(['parent_id' => $branch?->id, 'name' => 'Projects', 'code' => 'PRJ' . ($branch ? '-' . $branch->code : ''),
            'purpose' => 'projects', 'description' => 'Holds the cost centre of each project' . ($branch ? ' of this branch' : ''), 'sort_order' => 90]);
    }

    private function name(string $number, string $title): string
    {
        return Str::limit($number . ' ' . $title, 117, '...');
    }
}
