<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A project on a Books voucher (docs/PROJECTS_STAGE4_SPEC.md, build 4.1). Every project is a cost centre, and so is every phase with its own,
 * so "posting to a project" is choosing that cost centre in the field every voucher already has. This adds a picker that fills it, and a
 * rule per kind of voucher: the project is required, optional, or not shown. Out of the box it is optional everywhere.
 *
 * The rule is checked only where a person fills in the Books voucher form. The shop, the till and payment gateways also make vouchers, and
 * none of them is held to it.
 */
class VoucherProjects
{
    public const LABELS = [
        'payment' => 'Payment', 'receipt' => 'Receipt', 'sales' => 'Sales invoice', 'cash_sale' => 'Cash sale', 'credit_note' => 'Credit note', 'purchase' => 'Purchase',
        'debit_note' => 'Debit note', 'journal' => 'Journal', 'contra' => 'Contra', 'quotation' => 'Quotation', 'sales_order' => 'Sales order', 'purchase_order' => 'Purchase order',
        'delivery_note' => 'Delivery note', 'receipt_note' => 'Goods received note',
    ];

    public static function active(): bool
    {
        try {
            return ProjectsSetup::ready() && app(\App\Services\Licensing\LicenseManager::class)->isActive('projects');
        } catch (\Throwable) {
            return false;
        }
    }

    /** required | optional | none for a kind of voucher */
    public function ruleFor(?string $baseType): string
    {
        return self::active() ? (string) (app(ProjectSettings::class)->get('money')['voucher_project'][$baseType] ?? 'none') : 'none';
    }

    /**
     * What the picker offers this person on this kind of voucher: the rule, and the projects they may see that are not finished, each with
     * its cost centre and the phases that have their own.
     *
     * @return array{rule: string, projects: array<int, array<string, mixed>>}
     */
    public function picker(User $user, ?string $baseType, ?int $alsoProjectId = null): array
    {
        $rule = $this->ruleFor($baseType);
        if ($rule === 'none') {
            return ['rule' => 'none', 'projects' => []];
        }
        $rows = app(ProjectAccess::class)->visible(DB::table('projects as p'), $user)->whereNotNull('p.cost_centre_id')
            ->where(fn ($w) => $w->whereIn('p.state', ['open', 'on_hold'])->when($alsoProjectId, fn ($x) => $x->orWhere('p.id', $alsoProjectId)))
            ->orderByDesc('p.id')->limit(500)->get(['p.id', 'p.number', 'p.title', 'p.cost_centre_id', 'p.confidential']);
        $phases = DB::table('project_phases')->whereIn('project_id', $rows->pluck('id'))->whereNull('deleted_at')->whereNotNull('cost_centre_id')
            ->orderBy('sort_order')->orderBy('id')->get(['id', 'project_id', 'parent_id', 'name', 'cost_centre_id'])->groupBy('project_id');

        return ['rule' => $rule, 'projects' => $rows->map(fn ($p) => ['id' => (int) $p->id, 'number' => $p->number, 'title' => $p->title, 'confidential' => (bool) $p->confidential, 'cost_centre_id' => (int) $p->cost_centre_id,
            'phases' => ($phases[$p->id] ?? collect())->map(fn ($ph) => ['id' => (int) $ph->id, 'name' => $ph->name, 'cost_centre_id' => (int) $ph->cost_centre_id, 'child' => $ph->parent_id !== null])->values()->all()])->all()];
    }

    /** The project (and phase) a cost centre belongs to, if any. @return array{project_id: int, phase_id: ?int, number: string}|null */
    public function projectOf(?int $costCentreId): ?array
    {
        if (! $costCentreId || ! ProjectsSetup::ready()) {
            return null;
        }
        $p = DB::table('projects')->where('cost_centre_id', $costCentreId)->whereNull('deleted_at')->first(['id', 'number']);
        if ($p) {
            return ['project_id' => (int) $p->id, 'phase_id' => null, 'number' => $p->number];
        }
        $ph = DB::table('project_phases as ph')->join('projects as p', 'p.id', '=', 'ph.project_id')->where('ph.cost_centre_id', $costCentreId)->whereNull('ph.deleted_at')->whereNull('p.deleted_at')->first(['ph.id', 'p.id as project_id', 'p.number']);

        return $ph ? ['project_id' => (int) $ph->project_id, 'phase_id' => (int) $ph->id, 'number' => $ph->number] : null;
    }

    /** On the Books voucher form only: a kind of voucher that requires a project must be posted to one. */
    public function assertForForm(mixed $voucherTypeId, mixed $costCentreId): void
    {
        if (! self::active() || ! Schema::hasTable('voucher_types')) {
            return;
        }
        $base = DB::table('voucher_types')->where('id', (int) $voucherTypeId)->value('base_type');
        if ($this->ruleFor($base) !== 'required') {
            return;
        }
        if (! $this->projectOf($costCentreId ? (int) $costCentreId : null)) {
            throw new BooksException('A ' . mb_strtolower(self::LABELS[$base] ?? 'voucher') . ' must be posted to a piece of work. Choose one under Project.');
        }
    }
}
