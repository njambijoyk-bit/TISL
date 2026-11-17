<?php

namespace App\Services\Projects;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Disbursements (docs/PROJECTS_STAGE5_SPEC.md, builds 5.8 and 5.9): costs paid for the client and billed back. In Books each is an ordinary
 * cost line (a payment or purchase debiting an expense ledger) on the work's cost centres. Marked "bill to the client", it joins the next bill
 * at the amount Books has, to the ledger Configuration names ("Disbursements recovered"), or back to its own expense ledger to net it off.
 * Each remembers the bill it went on; a cancelled bill frees it; it can be written off instead, with a reason.
 */
class ProjectDisbursements
{
    public function __construct(private ProjectAccess $access) {}

    /** Cost lines on the work's cost centres that can be marked, and the ones marked. @return array<string, mixed> */
    public function list(object $project, User $user): array
    {
        $this->needReady();
        $cc = $this->costCentres($project);
        $marked = DB::table('project_disbursements')->where('project_id', $project->id)->get()->keyBy('voucher_entry_id');
        $lines = DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id')->join('ledgers as l', 'l.id', '=', 'e.ledger_id')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')
            ->where('v.status', 'posted')->where('e.side', 'D')->where('g.nature', 'expense')
            ->where(fn ($q) => $q->whereIn('e.cost_centre_id', $cc ?: [0])->orWhere(fn ($w) => $w->whereNull('e.cost_centre_id')->whereIn('v.cost_centre_id', $cc ?: [0])))
            ->orderByDesc('v.date')->orderByDesc('e.id')->limit(300)
            ->get(['e.id', 'e.amount', 'e.voucher_id', 'v.voucher_number', 'v.date', 'v.narration', 'l.name as ledger']);
        $billed = $this->standingBills($project);

        return [
            'ready' => true,
            'lines' => $lines->map(function ($e) use ($marked, $billed) {
                $m = $marked[$e->id] ?? null;
                $state = ! $m ? 'not_marked' : ($m->written_off ? 'written_off' : ($m->bill_stage_id && in_array((int) $m->bill_stage_id, $billed['standing'], true) ? (in_array((int) $m->bill_stage_id, $billed['drafted'], true) ? 'drafted' : 'billed') : 'to_bill'));

                return ['entry_id' => (int) $e->id, 'id' => $m ? (int) $m->id : null, 'voucher' => $e->voucher_number, 'date' => $e->date, 'narration' => $e->narration, 'ledger' => $e->ledger,
                    'amount' => round((float) $e->amount, 2), 'state' => $state, 'write_off_reason' => $m->write_off_reason ?? null];
            })->all(),
            'can' => ['mark' => $user->hasPermission('projects.money.disbursements') && $this->access->decide($user, 'money', $project)['allowed'],
                'writeoff' => $user->hasPermission('projects.money.writeoff') && $this->access->decide($user, 'money', $project)['allowed']],
        ];
    }

    /** Mark or unmark a cost line to bill to the client. */
    public function mark(object $project, int $entryId, bool $on, User $by): void
    {
        $this->needReady();
        $this->access->authorize($by, 'money', $project);
        if (! $by->hasPermission('projects.money.disbursements')) {
            throw new ProjectException('Marking costs to bill back needs its own permission.', 403);
        }
        $line = collect($this->list($project, $by)['lines'])->firstWhere('entry_id', $entryId) ?? throw new ProjectException("Choose a cost on this work's cost centres.");
        if ($on) {
            if ($line['id']) {
                return;
            }
            DB::table('project_disbursements')->insert(['project_id' => $project->id, 'voucher_entry_id' => $entryId, 'voucher_id' => DB::table('voucher_entries')->where('id', $entryId)->value('voucher_id'),
                'marked_by' => $by->id, 'created_at' => now()]);
            ProjectLog::record((int) $project->id, $by, 'disbursement.marked', 'voucher_entry', $entryId, null, ['voucher' => $line['voucher']]);

            return;
        }
        if (in_array($line['state'], ['billed', 'drafted'], true)) {
            throw new ProjectException('This cost is on a bill. Cancel or drop the bill first.');
        }
        DB::table('project_disbursements')->where('project_id', $project->id)->where('voucher_entry_id', $entryId)->delete();
        ProjectLog::record((int) $project->id, $by, 'disbursement.unmarked', 'voucher_entry', $entryId, ['voucher' => $line['voucher']], null);
    }

    /** Write off a marked cost instead of billing it (the caller has asked the serious-action rules). */
    public function writeOff(object $project, int $entryId, string $reason, User $by): void
    {
        $this->needReady();
        $this->access->authorize($by, 'money', $project);
        if (! $by->hasPermission('projects.money.writeoff')) {
            throw new ProjectException('Writing off costs needs its own permission.', 403);
        }
        $line = collect($this->list($project, $by)['lines'])->firstWhere('entry_id', $entryId);
        if (! $line || $line['state'] !== 'to_bill') {
            throw new ProjectException('Only a cost marked to bill, and not yet on a bill, is written off.');
        }
        if (trim($reason) === '') {
            throw new ProjectException('Say why it is written off.');
        }
        DB::table('project_disbursements')->where('id', $line['id'])->update(['written_off' => 1, 'write_off_reason' => mb_substr(trim($reason), 0, 300)]);
        ProjectLog::record((int) $project->id, $by, 'disbursement.written_off', 'voucher_entry', $entryId, null, ['voucher' => $line['voucher']], ProjectLog::DONE, trim($reason));
    }

    /** Marked costs waiting to be billed, for the Money tab. @return array<int, array<string, mixed>> */
    public function open(object $project, ?string $upTo = null): array
    {
        if (! ProjectsSetup::work() || ! Schema::hasTable('voucher_entries')) {
            return [];
        }

        return $this->openRows($project, $upTo)->map(fn ($d) => ['id' => (int) $d->id, 'voucher' => $d->voucher_number, 'date' => $d->date, 'narration' => $d->narration, 'ledger' => $d->ledger, 'amount' => round((float) $d->amount, 2)])->all();
    }

    /** @return Collection<int, object> */
    public function openRows(object $project, ?string $upTo = null): Collection
    {
        if (! ProjectsSetup::work() || ! Schema::hasTable('voucher_entries')) {
            return collect();
        }
        $standing = $this->standingBills($project)['standing'];

        return $this->rows()->where('d.project_id', $project->id)->where('d.written_off', 0)->where('v.status', 'posted')
            ->when($upTo, fn ($q) => $q->where('v.date', '<=', Carbon::parse($upTo)->toDateString()))
            ->where(fn ($q) => $q->whereNull('d.bill_stage_id')->orWhereNotIn('d.bill_stage_id', $standing ?: [0]))->orderBy('v.date')->get();
    }

    /** @return Collection<int, object> */
    public function rowsOnBill(int $stageId): Collection
    {
        return Schema::hasTable('voucher_entries') ? $this->rows()->where('d.bill_stage_id', $stageId)->get() : collect();
    }

    /** One custom line per cost, at the amount Books has. @return array<int, array<string, mixed>> */
    public function linesFor(Collection $costs): array
    {
        $to = (int) app(ProjectSettings::class)->get('work')['disbursement_ledger_id'];

        return $costs->map(fn ($d) => ['type' => 'custom', 'description' => mb_substr('Disbursement: ' . ($d->narration ?: $d->ledger) . " ({$d->voucher_number})", 0, 250), 'quantity' => 1,
            'rate' => round((float) $d->amount, 2), 'ledger_id' => $to ?: (int) $d->ledger_id, '_price' => round((float) $d->amount, 2)])->values()->all();
    }

    // ------------------------------------------------------------------ inside

    private function rows()
    {
        return DB::table('project_disbursements as d')->join('voucher_entries as e', 'e.id', '=', 'd.voucher_entry_id')->join('vouchers as v', 'v.id', '=', 'e.voucher_id')->join('ledgers as l', 'l.id', '=', 'e.ledger_id')
            ->select(['d.*', 'e.amount', 'e.ledger_id', 'v.voucher_number', 'v.date', 'v.narration', 'l.name as ledger']);
    }

    /** @return array{standing: int[], drafted: int[]} time bills that hold what is on them: drafted, or in the books and not cancelled */
    private function standingBills(object $project): array
    {
        $bills = DB::table('project_billing_stages as s')->leftJoin('vouchers as v', 'v.id', '=', 's.voucher_id')->where('s.project_id', $project->id)->where('s.kind', 'time')
            ->where(fn ($q) => $q->whereNull('s.voucher_id')->orWhere('v.status', '!=', 'cancelled'))->get(['s.id', 's.voucher_id']);

        return ['standing' => $bills->pluck('id')->map(fn ($v) => (int) $v)->all(), 'drafted' => $bills->whereNull('voucher_id')->pluck('id')->map(fn ($v) => (int) $v)->all()];
    }

    /** @return int[] */
    private function costCentres(object $project): array
    {
        $ids = DB::table('project_phases')->where('project_id', $project->id)->whereNotNull('cost_centre_id')->pluck('cost_centre_id')->map(fn ($v) => (int) $v)->all();

        return array_values(array_unique(array_filter(array_merge([(int) $project->cost_centre_id], $ids))));
    }

    private function needReady(): void
    {
        if (! ProjectsSetup::work() || ! Schema::hasTable('voucher_entries') || ! Schema::hasTable('ledger_groups')) {
            throw new ProjectException('Disbursements need database script 261 and Books.', 409);
        }
    }
}
