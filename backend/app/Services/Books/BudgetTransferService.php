<?php

namespace App\Services\Books;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Budget transfers (database script 243): after a version is approved it is not edited, but budget can still move from one line to another for one month, with a reason, an
 * approval and a record. An approved transfer is added to the plan wherever the plan is read (see BudgetService::lines with $effective); the request stays as the audit trail.
 * Asking needs books.planning; accepting or turning down needs books.budget.approve (routes), and a second person when that rule is on.
 */
class BudgetTransferService
{
    public static function ready(): bool
    {
        return Schema::hasTable('budget_transfers');
    }

    /** Net approved movement by row and month for a version: positive where budget arrives, negative where it leaves. @return array<int, array<string, float>> */
    public function adjustments(int $versionId): array
    {
        if (! self::ready()) {
            return [];
        }
        $out = [];
        foreach (DB::table('budget_transfers')->where('version_id', $versionId)->where('status', 'approved')->get() as $t) {
            $out[(int) $t->from_row_id][$t->period] = ($out[(int) $t->from_row_id][$t->period] ?? 0) - (float) $t->amount;
            $out[(int) $t->to_row_id][$t->period] = ($out[(int) $t->to_row_id][$t->period] ?? 0) + (float) $t->amount;
        }

        return $out;
    }

    /** @return array<int, array<string, mixed>> the transfers of a version, the ones waiting first */
    public function forVersion(int $versionId): array
    {
        if (! self::ready()) {
            return [];
        }
        $rows = DB::table('budget_rows')->where('version_id', $versionId)->get()->keyBy('id');
        $label = function ($rowId) use ($rows) {
            $r = $rows[$rowId] ?? null;
            if (! $r) {
                return "#{$rowId} (gone)";
            }
            $name = $r->target_type === 'group' ? DB::table('ledger_groups')->where('id', $r->target_id)->value('name') : DB::table('ledgers')->where('id', $r->target_id)->value('name');
            $dims = [];
            foreach (['cost_centre_id' => 'cost_centres', 'department_id' => 'departments', 'location_id' => 'locations', 'initiative_id' => 'budget_initiatives'] as $col => $table) {
                if ($r->{$col} && Schema::hasTable($table)) {
                    $dims[] = DB::table($table)->where('id', $r->{$col})->value('name');
                }
            }

            return ($name ?? "#{$r->target_id}") . ($r->is_recovery ? ' (recovery)' : '') . ($dims ? ', ' . implode(' › ', array_filter($dims)) : '');
        };

        return DB::table('budget_transfers as t')->leftJoin('users as r', 'r.id', '=', 't.requested_by')->leftJoin('users as d', 'd.id', '=', 't.decided_by')->where('t.version_id', $versionId)->where('t.status', '!=', 'withdrawn')
            ->orderByRaw("CASE t.status WHEN 'pending' THEN 0 ELSE 1 END")->orderByDesc('t.id')->get(['t.*', 'r.name as requester', 'd.name as decider'])
            ->map(fn ($t) => ['id' => (int) $t->id, 'from_row_id' => (int) $t->from_row_id, 'to_row_id' => (int) $t->to_row_id, 'from' => $label($t->from_row_id), 'to' => $label($t->to_row_id), 'period' => $t->period, 'amount' => (float) $t->amount, 'status' => $t->status,
                'note' => $t->note, 'decision_note' => $t->decision_note, 'requested_by' => $t->requester, 'decided_by' => $t->decider, 'created_at' => $t->created_at, 'decided_at' => $t->decided_at])->all();
    }

    /** Ask to move an amount of one month's budget between two rows of an approved version. */
    public function request(array $in, ?User $by): int
    {
        abort_unless(self::ready(), 409, 'Run database script 243_budget_transfers.sql first.');
        $from = (int) ($in['from_row_id'] ?? 0);
        $to = (int) ($in['to_row_id'] ?? 0);
        $period = (string) ($in['period'] ?? '');
        $amount = round((float) ($in['amount'] ?? 0), 2);
        $errors = [];
        $a = DB::table('budget_rows')->where('id', $from)->first();
        $b = DB::table('budget_rows')->where('id', $to)->first();
        if (! $a) {
            $errors['from_row_id'] = 'Choose the line the budget comes from.';
        }
        if (! $b) {
            $errors['to_row_id'] = 'Choose the line the budget goes to.';
        }
        if ($a && $b && $a->version_id !== $b->version_id) {
            $errors['to_row_id'] = 'Both lines must be in the same version.';
        }
        if ($a && $b && $from === $to) {
            $errors['to_row_id'] = 'Choose a different line to move it to.';
        }
        if (! preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $period)) {
            $errors['period'] = 'Choose the month.';
        }
        if ($amount <= 0) {
            $errors['amount'] = 'The amount must be more than nothing.';
        }
        if (! $errors) {
            $status = DB::table('budget_versions')->where('id', $a->version_id)->value('status');
            if ($status !== 'approved') {
                $errors['version'] = $status === 'locked' ? 'This version is locked: reopen it first.' : 'Only an approved version needs transfers; a draft can simply be edited.';
            } else {
                $svc = app(BudgetService::class);
                $adj = $this->adjustments((int) $a->version_id);
                $have = (float) DB::table('budget_lines')->where('row_id', $from)->where('period', $period)->value('amount') + ($adj[$from][$period] ?? 0);
                $pending = (float) DB::table('budget_transfers')->where('from_row_id', $from)->where('period', $period)->where('status', 'pending')->sum('amount');
                if ($amount > $have - $pending + 0.005) {
                    $errors['amount'] = 'That line has only ' . number_format(max(0, $have - $pending), 2) . ' left for ' . $period . ($pending > 0 ? ' after the transfers already waiting' : '') . '.';
                }
            }
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        return (int) DB::table('budget_transfers')->insertGetId(['version_id' => $a->version_id, 'from_row_id' => $from, 'to_row_id' => $to, 'period' => $period, 'amount' => $amount, 'status' => 'pending',
            'note' => ($in['note'] ?? '') !== '' ? mb_substr((string) $in['note'], 0, 255) : null, 'requested_by' => $by?->id, 'created_at' => now(), 'updated_at' => now()]);
    }

    /** Accept or turn down a waiting transfer; accepting checks again that the line still has the amount. */
    public function decide(int $id, string $action, ?User $by, ?string $note): string
    {
        $t = DB::table('budget_transfers')->where('id', $id)->first();
        abort_unless($t, 404, 'That transfer does not exist.');
        if ($t->status !== 'pending') {
            throw ValidationException::withMessages(['status' => 'That transfer is not waiting for a decision.']);
        }
        if ($action === 'reject' && ($note === null || $note === '')) {
            throw ValidationException::withMessages(['note' => 'Say why it is turned down.']);
        }
        if ($action === 'approve') {
            if ($by && (int) $t->requested_by === (int) $by->id && (ReportSettings::ready() ? (bool) (app(ReportSettings::class)->values()['second_approver_budget'] ?? true) : true)) {
                throw ValidationException::withMessages(['status' => 'A second person must accept a transfer: the one who asked for it cannot. (This rule is in Reports settings, Approvals.)']);
            }
            $adj = $this->adjustments((int) $t->version_id);
            $have = (float) DB::table('budget_lines')->where('row_id', $t->from_row_id)->where('period', $t->period)->value('amount') + ($adj[(int) $t->from_row_id][$t->period] ?? 0);
            if ((float) $t->amount > $have + 0.005) {
                throw ValidationException::withMessages(['amount' => 'The line no longer has that much for ' . $t->period . ' (it has ' . number_format(max(0, $have), 2) . ').']);
            }
        }
        $status = $action === 'approve' ? 'approved' : 'rejected';
        DB::table('budget_transfers')->where('id', $id)->update(['status' => $status, 'decided_by' => $by?->id, 'decided_at' => now(), 'decision_note' => $note !== null && $note !== '' ? mb_substr($note, 0, 255) : null, 'updated_at' => now()]);

        return $status;
    }

    /** The person who asked takes a waiting request back. */
    public function withdraw(int $id, ?User $by): void
    {
        $t = DB::table('budget_transfers')->where('id', $id)->where('status', 'pending')->first();
        abort_unless($t, 404, 'That transfer is not waiting.');
        if ($by && $t->requested_by && (int) $t->requested_by !== (int) $by->id) {
            throw ValidationException::withMessages(['status' => 'Only the person who asked can take a transfer back.']);
        }
        DB::table('budget_transfers')->where('id', $id)->update(['status' => 'withdrawn', 'updated_at' => now()]);
    }
}
