<?php

namespace App\Services\Payroll;

use App\Models\AttendanceDay;
use App\Models\AttendanceSetting;
use App\Models\Books\Ledger;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Employee;
use App\Models\PayrollComponent;
use App\Models\PayrollEmployeeItem;
use App\Models\PayrollLine;
use App\Models\PayrollRun;
use App\Models\PayrollSetting;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\LedgerService;
use App\Services\Books\VoucherService;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Payroll. A run works out each person's payslip for a month from their basic salary, their verified attendance (unpaid absence, overtime) and the
 * editable components (earnings, deductions, employer contributions — see PayrollComponent), then:
 *   approve   posts ONE journal:  Dr Salaries & Wages (gross), Cr each deduction's ledger, Cr Salaries Payable (net);
 *             and for each employer contribution  Dr its expense ledger, Cr its liability ledger
 *   pay       Dr Salaries Payable, Cr the bank or cash ledger the staff were paid from
 *   cancel    puts it back (a paid run's payment is cancelled first)
 * Attendance that is not verified blocks approval unless finance or an admin accepts paying that person as it stands.
 */
class PayrollService
{
    public const MANAGERS = ['admin', 'super_admin', 'finance'];

    public function __construct(private VoucherService $vouchers, private LedgerService $ledgers) {}

    public static function ready(): bool
    {
        return Schema::hasTable('payroll_runs') && Schema::hasTable('payroll_components');
    }

    public static function isManager(?User $u): bool
    {
        return $u && $u->holdsAny(self::MANAGERS);
    }

    private function need(): void
    {
        if (! self::ready()) {
            throw new BooksException('Run script 64_payroll.sql before using payroll.');
        }
    }

    // ── the sum for one person ─────────────────────────────────────────────

    /** What one component comes to on a base. */
    public function amount(PayrollComponent $c, ?float $override, float $base): float
    {
        $b = $c->base_cap !== null ? min($base, (float) $c->base_cap) : $base;
        $a = match ($c->calc) {
            'percent' => $b * ($override ?? (float) $c->value) / 100,
            'bands' => $this->banded($b, (array) $c->bands),
            default => $override ?? (float) $c->value,
        };
        if ($c->relief) {
            $a = max(0.0, $a - (float) $c->relief);
        }
        if ($base > 0) {
            if ($c->min_amount !== null && $a < (float) $c->min_amount) {
                $a = (float) $c->min_amount;
            }
        }
        if ($c->max_amount !== null && $a > (float) $c->max_amount) {
            $a = (float) $c->max_amount;
        }

        return round(max(0.0, $a), 2);
    }

    /** Each slice of the base up to a band's limit is charged at that band's rate. */
    private function banded(float $base, array $bands): float
    {
        $tax = 0.0;
        $prev = 0.0;
        foreach ($bands as $band) {
            $upto = $band['upto'] ?? null;
            $top = $upto === null ? $base : min($base, (float) $upto);
            if ($top > $prev) {
                $tax += ($top - $prev) * (float) $band['rate'] / 100;
            }
            if ($upto === null || $base <= (float) $upto) {
                break;
            }
            $prev = (float) $upto;
        }

        return $tax;
    }

    private function workdaysIn(Carbon $from, Carbon $to, array $days): int
    {
        $n = 0;
        for ($d = $from->copy(); $d->lte($to); $d->addDay()) {
            if (in_array($d->dayOfWeek, $days, true)) {
                $n++;
            }
        }

        return $n;
    }

    /**
     * One payslip, worked out. $adjust: typed-in extras [{description, amount, kind: earning|deduction, ledger_id}].
     *
     * @return array|null null when the person was not employed at all in the period
     */
    public function compute(User $u, Employee $e, Carbon $from, Carbon $to, PayrollSetting $s, Collection $components, Collection $items, array $adjust = []): ?array
    {
        $att = AttendanceSetting::current();
        $days = $att->days();
        $periodDays = $this->workdaysIn($from, $to, $days);
        $empFrom = $e->hire_date && $e->hire_date->gt($from) ? $e->hire_date->copy() : $from->copy();
        $empTo = $e->termination_date && $e->termination_date->lt($to) ? $e->termination_date->copy() : $to->copy();
        if ($empFrom->gt($empTo)) {
            return null;
        }
        $empDays = $this->workdaysIn($empFrom, $empTo, $days);
        $full = (float) $e->base_salary;
        $basic = $periodDays > 0 ? round($full * $empDays / $periodDays, 2) : $full;
        $daily = $periodDays > 0 ? $full / $periodDays : 0.0;
        $hoursPerDay = max(1.0, round(Carbon::parse($att->work_start)->diffInMinutes(Carbon::parse($att->work_end)) / 60, 2));

        // attendance: only verified days count; working days not yet verified are flagged
        $unpaid = 0.0;
        $otMinutes = 0;
        $unverified = 0;
        if (Schema::hasTable('attendance_days')) {
            $rows = AttendanceDay::where('user_id', $u->id)->whereBetween('work_date', [$empFrom->toDateString(), $empTo->toDateString()])->get()->keyBy(fn ($r) => $r->work_date->toDateString());
            for ($d = $empFrom->copy(); $d->lte($empTo); $d->addDay()) {
                if (! in_array($d->dayOfWeek, $days, true)) {
                    continue;
                }
                $r = $rows->get($d->toDateString());
                if (! $r || $r->verify_status !== 'verified') {
                    $unverified++;
                    continue;
                }
                $unpaid += $r->status === 'absent' ? 1.0 : ($r->status === 'half_day' ? 0.5 : 0.0);
                $otMinutes += (int) $r->overtime_minutes;
            }
        }
        $absence = $s->deduct_absence ? min($basic, round($daily * $unpaid, 2)) : 0.0;
        $otHours = round($otMinutes / 60, 2);
        $overtime = round($otHours * ($daily / $hoursPerDay) * (float) $s->overtime_multiplier, 2);
        $afterAbsence = round($basic - $absence + $overtime, 2);

        $mine = $components->filter(function (PayrollComponent $c) use ($items) {
            $it = $items->get($c->id);
            if ($it && $it->exempt) {
                return false;
            }

            return $c->applies_to === 'all' || ($c->applies_to === 'selected' && $it);
        })->sortBy('sort_order')->values();
        $override = fn (PayrollComponent $c) => ($items->get($c->id)?->amount);

        $breakdown = [];
        $add = function (PayrollComponent $c, float $amt) use (&$breakdown) {
            $breakdown[] = ['component_id' => $c->id, 'name' => $c->name, 'kind' => $c->kind, 'amount' => $amt, 'ledger_id' => $c->ledger_id, 'expense_ledger_id' => $c->expense_ledger_id, 'reduces_taxable' => (bool) $c->reduces_taxable];
        };
        $earnings = 0.0;
        foreach ($mine->where('kind', 'earning') as $c) {
            $a = $this->amount($c, $override($c), $c->base === 'basic' ? $basic : $afterAbsence);
            $earnings += $a;
            $add($c, $a);
        }
        $adjEarn = $adjDed = 0.0;
        $adjClean = [];
        foreach ($adjust as $x) {
            $amt = round((float) ($x['amount'] ?? 0), 2);
            if ($amt <= 0) {
                continue;
            }
            $kind = ($x['kind'] ?? 'earning') === 'deduction' ? 'deduction' : 'earning';
            $adjClean[] = ['description' => trim((string) ($x['description'] ?? '')) ?: ucfirst($kind), 'amount' => $amt, 'kind' => $kind, 'ledger_id' => $x['ledger_id'] ?? null];
            $kind === 'earning' ? $adjEarn += $amt : $adjDed += $amt;
        }
        $gross = round($afterAbsence + $earnings + $adjEarn, 2);

        $pre = 0.0;
        foreach ($mine->where('kind', 'deduction')->where('reduces_taxable', true) as $c) {
            $a = $this->amount($c, $override($c), $c->base === 'basic' ? $basic : $gross);
            $pre += $a;
            $add($c, $a);
        }
        $taxable = round(max(0.0, $gross - $pre), 2);
        $ded = $pre;
        foreach ($mine->where('kind', 'deduction')->where('reduces_taxable', false) as $c) {
            $a = $this->amount($c, $override($c), match ($c->base) { 'basic' => $basic, 'taxable' => $taxable, default => $gross });
            $ded += $a;
            $add($c, $a);
        }
        $employer = 0.0;
        foreach ($mine->where('kind', 'employer') as $c) {
            $a = $this->amount($c, $override($c), match ($c->base) { 'basic' => $basic, 'taxable' => $taxable, default => $gross });
            $employer += $a;
            $add($c, $a);
        }
        $totalDed = round($ded + $adjDed, 2);

        return ['basic' => $basic, 'days_expected' => $empDays, 'days_unpaid' => $unpaid, 'overtime_hours' => $otHours, 'absence_deduction' => $absence, 'overtime_pay' => $overtime, 'gross' => $gross,
            'taxable' => $taxable, 'total_deductions' => $totalDed, 'net' => round($gross - $totalDed, 2), 'employer_cost' => round($employer, 2), 'unverified_days' => $unverified,
            'adjustments' => $adjClean, 'breakdown' => $breakdown];
    }

    /** Everyone who is paid: staff with an employee record and a salary. */
    public function payees(): Collection
    {
        return User::with('employee')->whereHas('employee', fn ($q) => $q->where('base_salary', '>', 0))->orderBy('name')->get();
    }

    private function components(): Collection
    {
        return PayrollComponent::where('is_active', true)->orderBy('sort_order')->get();
    }

    private function itemsFor(int $userId): Collection
    {
        return Schema::hasTable('payroll_employee_items') ? PayrollEmployeeItem::where('user_id', $userId)->get()->keyBy('component_id') : collect();
    }

    // ── runs ───────────────────────────────────────────────────────────────

    private function period(string $ym): array
    {
        if (! preg_match('/^\d{4}-\d{2}$/', $ym)) {
            throw new BooksException('Choose the month.');
        }
        $from = Carbon::parse($ym . '-01')->startOfDay();

        return [$from, $from->copy()->endOfMonth()->startOfDay()];
    }

    /** Start a run for a month: every payee's payslip worked out, nothing posted yet. */
    public function create(string $ym, ?string $notes, ?User $by): PayrollRun
    {
        $this->need();
        [$from, $to] = $this->period($ym);
        if (PayrollRun::where('period_start', $from->toDateString())->where('status', '!=', 'cancelled')->exists()) {
            throw new BooksException('There is already a payroll run for that month. Cancel it to start another.');
        }
        if (! $this->components()->isNotEmpty() && ! PayrollComponent::exists()) {
            throw new BooksException('Set up the payroll components first.');
        }

        return DB::transaction(function () use ($ym, $from, $to, $notes, $by) {
            $number = 'PR-' . $ym;
            for ($n = 2; PayrollRun::where('number', $number)->exists(); $n++) {   // a cancelled run keeps its number
                $number = "PR-{$ym}-{$n}";
            }
            $run = PayrollRun::create(['number' => $number, 'period_start' => $from->toDateString(), 'period_end' => $to->toDateString(), 'status' => 'draft', 'notes' => $notes, 'created_by' => $by?->id]);
            $this->fill($run);

            return $run->fresh();
        });
    }

    /** (Re)work out every payslip of a draft run, keeping typed-in adjustments and accepted-unverified marks. */
    private function fill(PayrollRun $run): void
    {
        $s = PayrollSetting::current();
        $comps = $this->components();
        $from = Carbon::parse($run->period_start->toDateString());
        $to = Carbon::parse($run->period_end->toDateString());
        $seen = [];
        foreach ($this->payees() as $u) {
            $prev = PayrollLine::where('run_id', $run->id)->where('user_id', $u->id)->first();
            $calc = $this->compute($u, $u->employee, $from, $to, $s, $comps, $this->itemsFor($u->id), $prev?->adjustments ?? []);
            if (! $calc) {
                continue;
            }
            PayrollLine::updateOrCreate(['run_id' => $run->id, 'user_id' => $u->id], $calc + ['accepted_unverified' => $prev?->accepted_unverified ?? false]);
            $seen[] = $u->id;
        }
        PayrollLine::where('run_id', $run->id)->whereNotIn('user_id', $seen)->delete();
        $this->totals($run);
    }

    private function totals(PayrollRun $run): void
    {
        $l = PayrollLine::where('run_id', $run->id)->get();
        $run->update(['total_gross' => round($l->sum('gross'), 2), 'total_deductions' => round($l->sum('total_deductions'), 2), 'total_net' => round($l->sum('net'), 2), 'total_employer' => round($l->sum('employer_cost'), 2)]);
    }

    private function draft(PayrollRun $run): void
    {
        if ($run->status !== 'draft') {
            throw new BooksException("{$run->number} is {$run->status} — only a draft can be changed.");
        }
    }

    public function refresh(PayrollRun $run): PayrollRun
    {
        $this->draft($run);
        DB::transaction(fn () => $this->fill($run));

        return $run->fresh();
    }

    /** Typed-in extras for one person in a draft run (a bonus, an advance recovered) and whether to pay them with unverified attendance. */
    public function adjust(PayrollRun $run, int $userId, array $adjustments, ?bool $acceptUnverified, ?User $by): PayrollLine
    {
        $this->draft($run);
        $line = PayrollLine::where('run_id', $run->id)->where('user_id', $userId)->firstOrFail();
        foreach ($adjustments as $x) {
            if ((float) ($x['amount'] ?? 0) > 0 && ($x['kind'] ?? 'earning') === 'deduction' && empty($x['ledger_id'])) {
                throw new BooksException('Choose the account a deduction is credited to (for example the staff advances account).');
            }
        }
        $s = PayrollSetting::current();
        $u = User::with('employee')->findOrFail($userId);
        $from = Carbon::parse($run->period_start->toDateString());
        $to = Carbon::parse($run->period_end->toDateString());
        $calc = $this->compute($u, $u->employee, $from, $to, $s, $this->components(), $this->itemsFor($userId), $adjustments);
        if (! $calc) {
            throw new BooksException('That person was not employed in this period.');
        }
        $line->fill($calc + ['accepted_unverified' => $acceptUnverified ?? $line->accepted_unverified])->save();
        $this->totals($run);

        return $line->fresh();
    }

    /** Post the run to the books: one journal. Blocked while attendance is unverified (unless accepted), a net is negative, or a ledger is missing. */
    public function approve(PayrollRun $run, ?User $by): PayrollRun
    {
        $this->draft($run);
        $s = PayrollSetting::current();
        $lines = PayrollLine::with('user:id,name')->where('run_id', $run->id)->get();
        if ($lines->isEmpty()) {
            throw new BooksException('There is nobody to pay in this run.');
        }
        $unv = $lines->filter(fn ($l) => $l->unverified_days > 0 && ! $l->accepted_unverified);
        if ($unv->isNotEmpty()) {
            throw new BooksException('Attendance is not verified for: ' . $unv->map(fn ($l) => "{$l->user->name} ({$l->unverified_days} day" . ($l->unverified_days === 1 ? '' : 's') . ')')->implode(', ') . '. Verify it, or accept paying them as it stands.');
        }
        $neg = $lines->filter(fn ($l) => $l->net < 0);
        if ($neg->isNotEmpty()) {
            throw new BooksException('The deductions are more than the pay for: ' . $neg->map(fn ($l) => $l->user->name)->implode(', ') . '.');
        }
        if (! $s->salaries_expense_ledger_id || ! $s->salaries_payable_ledger_id) {
            throw new BooksException('Choose the Salaries & Wages and Salaries Payable ledgers in Payroll settings.');
        }
        $credit = [];   // ledger => amount
        $debit = [];
        $bump = function (array &$a, int $id, float $amt) {
            $a[$id] = round(($a[$id] ?? 0) + $amt, 2);
        };
        foreach ($lines as $l) {
            $bump($debit, (int) $s->salaries_expense_ledger_id, $l->gross);
            $bump($credit, (int) $s->salaries_payable_ledger_id, $l->net);
            foreach ($l->breakdown ?? [] as $b) {
                if ($b['amount'] <= 0 || $b['kind'] === 'earning') {
                    continue;   // earnings are already in the gross
                }
                if (empty($b['ledger_id'])) {
                    throw new BooksException("Choose the ledger {$b['name']} posts to (Payroll settings).");
                }
                $bump($credit, (int) $b['ledger_id'], $b['amount']);
                if ($b['kind'] === 'employer') {
                    if (empty($b['expense_ledger_id'])) {
                        throw new BooksException("Choose the expense ledger for {$b['name']} (Payroll settings).");
                    }
                    $bump($debit, (int) $b['expense_ledger_id'], $b['amount']);
                }
            }
            foreach ($l->adjustments ?? [] as $x) {
                if ($x['kind'] === 'deduction') {
                    $bump($credit, (int) $x['ledger_id'], $x['amount']);
                }
            }
        }
        $type = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');
        $entries = [];
        foreach ($debit as $id => $amt) {
            $entries[] = ['ledger_id' => $id, 'side' => 'D', 'amount' => $amt];
        }
        foreach ($credit as $id => $amt) {
            $entries[] = ['ledger_id' => $id, 'side' => 'C', 'amount' => $amt];
        }
        if (abs(array_sum($debit) - array_sum($credit)) > 0.01) {
            throw new BooksException('The payroll does not balance — check the components and their ledgers.');
        }

        return DB::transaction(function () use ($run, $type, $entries, $by) {
            $v = $this->vouchers->create(['voucher_type_id' => $type->id, 'date' => $run->period_end->toDateString(), 'reference_no' => $run->number, 'narration' => "Payroll {$run->number}",
                'entries' => $entries, 'meta' => ['payroll_run_id' => $run->id]], $by);
            $run->update(['status' => 'approved', 'journal_voucher_id' => $v->id, 'approved_by' => $by?->id, 'approved_at' => now()]);

            return $run->fresh();
        });
    }

    /** Pay the net pay out of a bank or cash ledger: Dr Salaries Payable, Cr that ledger. */
    public function pay(PayrollRun $run, int $fromLedgerId, ?string $date, ?User $by): PayrollRun
    {
        if ($run->status !== 'approved') {
            throw new BooksException($run->status === 'paid' ? "{$run->number} is already paid." : "Approve {$run->number} before paying it.");
        }
        $from = Ledger::findOrFail($fromLedgerId);
        if (! $this->ledgers->isUnderGroup($from, 'Bank Accounts') && ! $this->ledgers->isUnderGroup($from, 'Cash-in-hand')) {
            throw new BooksException('Staff are paid from a bank or cash account.');
        }
        $held = $this->ledgers->balance($from->id);
        if ((float) $run->total_net - $held > 0.005) {
            throw new BooksException("{$from->name} holds only " . number_format($held, 2) . ' but the payroll is ' . number_format((float) $run->total_net, 2) . '.');
        }
        $s = PayrollSetting::current();
        $type = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');

        return DB::transaction(function () use ($run, $from, $s, $type, $date, $by) {
            $v = $this->vouchers->create(['voucher_type_id' => $type->id, 'date' => $date ?: today()->toDateString(), 'reference_no' => $run->number, 'narration' => "Salaries paid — {$run->number}",
                'entries' => [['ledger_id' => (int) $s->salaries_payable_ledger_id, 'side' => 'D', 'amount' => (float) $run->total_net], ['ledger_id' => $from->id, 'side' => 'C', 'amount' => (float) $run->total_net]],
                'meta' => ['payroll_run_id' => $run->id, 'payroll_payment' => true]], $by);
            $run->update(['status' => 'paid', 'payment_voucher_id' => $v->id, 'paid_at' => now()]);

            return $run->fresh();
        });
    }

    /** Take a run back: a draft is simply cancelled; an approved or paid run has its vouchers cancelled (the payment first). */
    public function cancel(PayrollRun $run, ?User $by): PayrollRun
    {
        if ($run->status === 'cancelled') {
            throw new BooksException("{$run->number} is already cancelled.");
        }

        return DB::transaction(function () use ($run, $by) {
            foreach ([$run->payment_voucher_id, $run->journal_voucher_id] as $id) {
                $v = $id ? Voucher::find($id) : null;
                if ($v && $v->status === Voucher::POSTED) {
                    $this->vouchers->cancel($v, "Payroll {$run->number} cancelled", $by);
                }
            }
            $run->update(['status' => 'cancelled']);

            return $run->fresh();
        });
    }


    // ── keeping a run in step with its vouchers ────────────────────────────

    /** A run's journal cannot be cancelled while the payment of that run still stands. */
    public function beforeVoucherCancelled(Voucher $v): void
    {
        $runId = $v->meta['payroll_run_id'] ?? null;
        if (! $runId || ! empty($v->meta['payroll_payment']) || ! self::ready()) {
            return;
        }
        $run = PayrollRun::find($runId);
        $pay = $run?->payment_voucher_id ? Voucher::find($run->payment_voucher_id) : null;
        if ($pay && $pay->status === Voucher::POSTED) {
            throw new BooksException("Can't cancel {$v->voucher_number} — the salaries were paid with {$pay->voucher_number}. Cancel that payment first (or cancel the whole run in Payroll).");
        }
    }

    /** Cancelling the payment puts the run back to approved; cancelling its journal cancels the run. */
    public function afterVoucherCancelled(Voucher $v): void
    {
        $runId = $v->meta['payroll_run_id'] ?? null;
        if (! $runId || ! self::ready() || ! ($run = PayrollRun::find($runId))) {
            return;
        }
        if (! empty($v->meta['payroll_payment'])) {
            if ((int) $run->payment_voucher_id === (int) $v->id && $run->status === 'paid') {
                $run->update(['status' => 'approved', 'payment_voucher_id' => null, 'paid_at' => null]);
            }
        } elseif ((int) $run->journal_voucher_id === (int) $v->id && $run->status !== 'cancelled') {
            $run->update(['status' => 'cancelled']);
        }
    }

    /** A run whose vouchers were cancelled elsewhere (before this was automatic) is brought into line. */
    public function reconcile(PayrollRun $run): PayrollRun
    {
        if (in_array($run->status, ['approved', 'paid'], true)) {
            $j = $run->journal_voucher_id ? Voucher::find($run->journal_voucher_id) : null;
            $p = $run->payment_voucher_id ? Voucher::find($run->payment_voucher_id) : null;
            if ($j && $j->status === Voucher::CANCELLED) {
                $run->update(['status' => 'cancelled']);
            } elseif ($run->status === 'paid' && $p && $p->status === Voucher::CANCELLED) {
                $run->update(['status' => 'approved', 'payment_voucher_id' => null, 'paid_at' => null]);
            }
        }

        return $run->fresh();
    }

    private function voucherRef(?int $id): ?array
    {
        $v = $id ? Voucher::find($id, ['id', 'voucher_number', 'status', 'date']) : null;

        return $v ? ['id' => $v->id, 'number' => $v->voucher_number, 'status' => $v->status, 'date' => $v->date?->toDateString()] : null;
    }

    // ── what the screens show ──────────────────────────────────────────────

    public function runPayload(PayrollRun $run): array
    {
        $lines = PayrollLine::with('user:id,name')->where('run_id', $run->id)->get()->sortBy(fn ($l) => $l->user?->name)->values();

        return ['id' => $run->id, 'number' => $run->number, 'period_start' => $run->period_start->toDateString(), 'period_end' => $run->period_end->toDateString(), 'status' => $run->status,
            'total_gross' => $run->total_gross, 'total_deductions' => $run->total_deductions, 'total_net' => $run->total_net, 'total_employer' => $run->total_employer, 'notes' => $run->notes,
            'journal_voucher_id' => $run->journal_voucher_id, 'payment_voucher_id' => $run->payment_voucher_id, 'journal' => $this->voucherRef($run->journal_voucher_id), 'payment' => $this->voucherRef($run->payment_voucher_id),
            'lines' => $lines->map(fn ($l) => ['user_id' => $l->user_id, 'name' => $l->user?->name] + $l->only(['basic', 'days_expected', 'days_unpaid', 'overtime_hours', 'absence_deduction', 'overtime_pay', 'gross', 'taxable', 'total_deductions', 'net',
                'employer_cost', 'unverified_days', 'accepted_unverified', 'adjustments', 'breakdown']))->all()];
    }


    /** Runs a person can see their payslip for: approved or paid, never a draft or a cancelled run. Newest first. */
    public function payslipsFor(User $u, int $limit = 36): array
    {
        if (! self::ready()) {
            return [];
        }

        return PayrollLine::where('user_id', $u->id)->join('payroll_runs as r', 'r.id', '=', 'payroll_lines.run_id')->whereIn('r.status', ['approved', 'paid'])->orderByDesc('r.period_start')->limit($limit)
            ->get(['payroll_lines.run_id', 'r.number', 'r.period_start', 'r.status', 'payroll_lines.gross', 'payroll_lines.total_deductions', 'payroll_lines.net'])
            ->map(fn ($x) => ['run_id' => (int) $x->run_id, 'number' => $x->number, 'period_start' => Carbon::parse($x->period_start)->toDateString(), 'status' => $x->status,
                'gross' => (float) $x->gross, 'total_deductions' => (float) $x->total_deductions, 'net' => (float) $x->net])->all();
    }

    /**
     * One person's own payslip for a run, for them to read. Only theirs, only for an approved or paid run. What the business pays on top (employer
     * contributions, their cost), and the ledgers, are left out: it is the employee's side of the sum.
     */
    public function payslipOf(User $u, int $runId): array
    {
        $run = PayrollRun::whereIn('status', ['approved', 'paid'])->find($runId) ?? throw new BooksException('That payslip is not available.');
        $l = PayrollLine::where('run_id', $run->id)->where('user_id', $u->id)->first() ?? throw new BooksException('That payslip is not available.');
        $e = $u->employee;
        $bd = collect($l->breakdown ?? [])->filter(fn ($b) => $b['amount'] > 0);
        $adj = collect($l->adjustments ?? []);

        return ['run' => ['number' => $run->number, 'period_start' => $run->period_start->toDateString(), 'period_end' => $run->period_end->toDateString(), 'status' => $run->status, 'paid_at' => $run->paid_at?->toDateString()],
            'company' => rescue(fn () => \App\Models\CompanyProfile::name(), null, false),
            'employee' => ['name' => $u->name, 'number' => $e?->employee_number, 'job_title' => $e?->job_title, 'department' => $e?->department, 'kra_pin' => $e?->kra_pin, 'nssf_number' => $e?->nssf_number, 'bank' => $e?->bank_name],
            'basic' => $l->basic, 'days_expected' => $l->days_expected, 'days_unpaid' => $l->days_unpaid, 'absence_deduction' => $l->absence_deduction, 'overtime_hours' => $l->overtime_hours, 'overtime_pay' => $l->overtime_pay,
            'earnings' => $bd->where('kind', 'earning')->map(fn ($b) => ['name' => $b['name'], 'amount' => $b['amount']])->values()->all() + [],
            'bonuses' => $adj->where('kind', 'earning')->map(fn ($a) => ['name' => $a['description'], 'amount' => $a['amount']])->values()->all(),
            'gross' => $l->gross, 'taxable' => $l->taxable,
            'deductions' => $bd->where('kind', 'deduction')->map(fn ($b) => ['name' => $b['name'], 'amount' => $b['amount']])->values()->all(),
            'other_deductions' => $adj->where('kind', 'deduction')->map(fn ($a) => ['name' => $a['description'], 'amount' => $a['amount']])->values()->all(),
            'total_deductions' => $l->total_deductions, 'net' => $l->net];
    }


    /**
     * Gratuity (service pay): for each person, completed years of service up to the date (or the day they left), times the days of pay per year set in
     * Payroll settings, at a day's pay of basic ÷ the divisor. Nothing is due before the minimum completed years. Part-years are shown separately.
     *
     * @return array{as_of:string, rows:array, totals:array, settings:array, missing_hire_date:array}
     */
    public function gratuity(?string $asOf, bool $includeLeft = false): array
    {
        $asOf = Carbon::parse($asOf ?: today())->startOfDay();
        $s = PayrollSetting::current();
        $days = (float) ($s->gratuity_days_per_year ?? 15);
        $min = (int) ($s->gratuity_min_years ?? 1);
        $div = max(1, (int) ($s->gratuity_divisor ?? 30));
        $rows = [];
        $missing = [];
        foreach (User::with('employee')->whereHas('employee', fn ($q) => $q->where('base_salary', '>', 0))->orderBy('name')->get() as $u) {
            $e = $u->employee;
            $left = $e->termination_date && $e->termination_date->lte($asOf);
            if ($left && ! $includeLeft) {
                continue;
            }
            if (! $e->hire_date) {
                $missing[] = $u->name;
                continue;
            }
            $start = Carbon::parse($e->hire_date->toDateString());
            if ($start->gt($asOf)) {
                continue;
            }
            $end = $left ? Carbon::parse($e->termination_date->toDateString()) : $asOf;
            $full = (int) $start->diffInYears($end);
            $years = round($start->diffInDays($end) / 365.25, 2);
            $months = (int) $start->copy()->addYears($full)->diffInMonths($end);
            $daily = (float) $e->base_salary / $div;
            $perYear = round($daily * $days, 2);
            $due = $full >= $min ? round($perYear * $full, 2) : 0.0;
            $withPart = $years >= $min ? round($perYear * $years, 2) : 0.0;
            $rows[] = ['user_id' => $u->id, 'name' => $u->name, 'hire_date' => $start->toDateString(), 'left' => $left ? $end->toDateString() : null, 'service' => "{$full}y {$months}m", 'full_years' => $full, 'years' => $years,
                'basic' => (float) $e->base_salary, 'daily' => round($daily, 2), 'per_year' => $perYear, 'due' => $due, 'with_part_year' => $withPart, 'eligible' => $full >= $min];
        }

        return ['as_of' => $asOf->toDateString(), 'rows' => $rows, 'missing_hire_date' => $missing,
            'totals' => ['due' => round(array_sum(array_column($rows, 'due')), 2), 'with_part_year' => round(array_sum(array_column($rows, 'with_part_year')), 2), 'basic' => round(array_sum(array_column($rows, 'basic')), 2)],
            'settings' => ['days_per_year' => $days, 'min_years' => $min, 'divisor' => $div, 'prorate' => (bool) ($s->gratuity_prorate ?? false)]];
    }

    /** The bank payment list as CSV: who, bank, account, amount. */
    public function csv(PayrollRun $run): string
    {
        $out = fopen('php://temp', 'r+');
        fputcsv($out, ['Name', 'Bank', 'Account number', 'Account name', 'Net pay']);
        foreach (PayrollLine::with('user.employee')->where('run_id', $run->id)->get()->sortBy(fn ($l) => $l->user?->name) as $l) {
            $e = $l->user?->employee;
            fputcsv($out, [$l->user?->name, $e?->bank_name, $e?->bank_account_number, $e?->bank_account_name ?: $l->user?->name, number_format($l->net, 2, '.', '')]);
        }
        rewind($out);

        return (string) stream_get_contents($out);
    }
}
