<?php

namespace App\Services\Projects;

use App\Models\Books\Ledger;
use App\Models\User;
use App\Services\Books\StatementLines;
use App\Services\Books\TaxAccountGuard;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Ledgers made in Books from a project (docs/PROJECTS_STAGE4_SPEC.md, build 4.3): "Filing fees" for a law firm, a client bank account.
 * The ledger is made in Books, through the same checks Books' own ledger screen uses, and Books owns it from then on; Projects only remembers
 * which project asked for it. No opening balance is taken: money only ever enters the books as a voucher.
 *
 * A ledger needs `projects.ledgers.create`; a bank ledger also needs `projects.ledgers.bank`. Both need a project role that sees money.
 */
class ProjectLedgers
{
    public const PURPOSES = ['general' => 'An account for this work', 'bank' => 'A bank account', 'client_money' => 'Client money held', 'retention' => 'Retention', 'advance' => 'Advances'];

    /** The ledgers made from this project, read from Books as they are now. @return array<int, array<string, mixed>> */
    public function of(object $project): array
    {
        if (! ProjectsSetup::money() || ! Schema::hasTable('ledgers')) {
            return [];
        }

        return DB::table('project_ledgers as pl')->join('ledgers as l', 'l.id', '=', 'pl.ledger_id')->leftJoin('ledger_groups as g', 'g.id', '=', 'l.group_id')->leftJoin('users as u', 'u.id', '=', 'pl.created_by')
            ->where('pl.project_id', $project->id)->orderBy('pl.id')
            ->get(['pl.id', 'l.id as ledger_id', 'l.name', 'g.name as group_name', 'pl.purpose', 'pl.note', 'u.name as made_by', 'pl.created_at', 'l.is_active'])
            ->map(fn ($r) => ['id' => (int) $r->id, 'ledger_id' => (int) $r->ledger_id, 'name' => $r->name, 'group' => $r->group_name, 'purpose' => $r->purpose, 'purpose_name' => self::PURPOSES[$r->purpose] ?? $r->purpose,
                'note' => $r->note, 'made_by' => $r->made_by, 'made_at' => $r->created_at, 'is_active' => (bool) $r->is_active])->all();
    }

    /** Where a ledger can go: income, expense and liability groups for an account; the bank groups for a bank account. @return array{general: array<int, array<string, mixed>>, bank: array<int, array<string, mixed>>} */
    public function groups(): array
    {
        if (! Schema::hasTable('ledger_groups')) {
            return ['general' => [], 'bank' => []];
        }
        $all = DB::table('ledger_groups')->where(fn ($q) => $q->whereNull('is_active')->orWhere('is_active', 1))->orderBy('name')->get(['id', 'parent_id', 'name', 'nature', 'behaviour']);
        $bank = $this->under($all, 'Bank Accounts');
        $taxRoot = $this->under($all, 'Duties & Taxes');
        $general = $all->filter(fn ($g) => in_array($g->nature, ['income', 'expense', 'liability'], true) && in_array($g->behaviour, [null, '', 'sales', 'purchase'], true) && ! isset($taxRoot[$g->id]));

        return ['general' => $general->map(fn ($g) => ['id' => (int) $g->id, 'name' => $g->name, 'nature' => $g->nature])->values()->all(),
            'bank' => $all->filter(fn ($g) => isset($bank[$g->id]))->map(fn ($g) => ['id' => (int) $g->id, 'name' => $g->name, 'nature' => $g->nature])->values()->all()];
    }

    /**
     * Make a ledger in Books for this project.
     *
     * @param array<string, mixed> $d name, group_id, purpose, note; for a bank: bank_name, account_number, account_name, branch
     */
    public function make(object $project, array $d, User $by): int
    {
        if (! ProjectsSetup::money()) {
            throw new ProjectException('This needs database script 260. Run it first.', 409);
        }
        app(ProjectAccess::class)->authorize($by, 'money', $project);
        $purpose = (string) ($d['purpose'] ?? 'general');
        if (! isset(self::PURPOSES[$purpose])) {
            throw new ProjectException('Choose what the ledger is for.');
        }
        $bank = in_array($purpose, ['bank', 'client_money'], true) && ! empty($d['is_bank']) || $purpose === 'bank';
        if (! $by->hasPermission('projects.ledgers.create') || ($bank && ! $by->hasPermission('projects.ledgers.bank'))) {
            ProjectLog::refused((int) $project->id, $by, 'ledger.make', $bank ? 'Does not hold projects.ledgers.bank' : 'Does not hold projects.ledgers.create', 'project', (int) $project->id);
            throw new ProjectException($bank ? 'Making a bank ledger needs its own permission.' : 'You may not make ledgers in the books.', 403);
        }
        $name = trim(preg_replace('/\s+/', ' ', (string) ($d['name'] ?? '')));
        if ($name === '' || mb_strlen($name) > 160) {
            throw new ProjectException('Give the ledger a name of up to 160 characters.');
        }
        if (DB::table('ledgers')->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->exists()) {
            throw new ProjectException('The books already have a ledger by that name. Choose another, or link to that one.');
        }
        $groups = $this->groups()[$bank ? 'bank' : 'general'];
        $groupId = (int) ($d['group_id'] ?? 0);
        if (! in_array($groupId, array_column($groups, 'id'), true)) {
            throw new ProjectException($bank ? 'Choose a bank group from the books.' : 'Choose where it goes in the books: an income, expense or liability group.');
        }
        try {
            app(TaxAccountGuard::class)->assertLedgerGoesInto($groupId);   // the same guard Books' own ledger screen uses
        } catch (ValidationException $e) {
            throw new ProjectException(collect($e->errors())->flatten()->first() ?? 'That group cannot take a ledger.');
        }
        $values = ['name' => $name, 'group_id' => $groupId, 'opening_balance' => 0, 'opening_side' => 'D', 'is_active' => true,
            'notes' => "Made from {$project->number} ({$project->title}) in Projects."];
        if ($bank) {
            foreach (['bank_name' => 80, 'account_number' => 60, 'account_name' => 120, 'branch' => 80] as $k => $max) {
                $v = trim((string) ($d[$k] ?? ''));
                if ($v !== '') {
                    $values[$k] = mb_substr($v, 0, $max);
                }
            }
        }
        if (StatementLines::available()) {
            $values['statement_id'] = app(StatementLines::class)->forNewLedger(null, $groupId, $by);
        }
        $note = trim((string) ($d['note'] ?? ''));

        return DB::transaction(function () use ($project, $values, $purpose, $note, $by) {
            $ledger = Ledger::create($values);
            $id = DB::table('project_ledgers')->insertGetId(['project_id' => $project->id, 'ledger_id' => $ledger->id, 'purpose' => $purpose, 'note' => $note === '' ? null : mb_substr($note, 0, 200), 'created_by' => $by->id, 'created_at' => now()]);
            ProjectLog::record((int) $project->id, $by, 'ledger.made', 'ledger', (int) $ledger->id, null, ['ledger' => $values['name'], 'for' => self::PURPOSES[$purpose]]);

            return (int) $ledger->id;
        });
    }

    /** @param Collection<int, object> $all @return array<int, true> the group by that name and every group under it */
    private function under(Collection $all, string $name): array
    {
        $root = $all->first(fn ($g) => strcasecmp($g->name, $name) === 0);
        if (! $root) {
            return [];
        }
        $kids = $all->groupBy('parent_id');
        $out = [];
        $walk = function (int $id) use (&$walk, &$out, $kids) {
            $out[$id] = true;
            foreach ($kids[$id] ?? [] as $g) {
                $walk((int) $g->id);
            }
        };
        $walk((int) $root->id);

        return $out;
    }
}
