<?php

namespace App\Services\Books;

use App\Models\Books\FinancialYear;
use App\Models\Books\Voucher;
use App\Models\User;
use App\Services\Access\BranchFilter;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The year-end close (docs/BOOKS_REPORTS_PLAN.md, section 7): prepare, approve, lock, and reopen with a reason.
 *
 * It is not a posting, as in Tally. Closing a year stores, for every ledger, its balance at the end of the year and what it carries into the next one:
 * balance-sheet ledgers carry their balance; income and expense ledgers carry nothing, their profit moves to retained earnings. The statement line each ledger
 * was on is kept with it, so a later change of line never silently changes a closed year. Locking sets the financial year closed, which the period guard
 * already enforces for every voucher. Every step is logged; a reopening needs a reason.
 *
 * Who does what: preparing needs books.close.prepare; approving, locking and reopening need books.period (the owner). With the second-approver rule on (Reports
 * settings), the person who prepared the close cannot approve it.
 */
class YearCloseService
{
    public const CONFIRMATIONS = [
        'depreciation' => 'Depreciation for the year has been run',
        'accruals' => 'Accruals and prepayments are posted',
        'stock_valuation' => 'Stock has been counted and valued',
    ];

    public static function ready(): bool
    {
        return Schema::hasTable('year_closes') && Schema::hasTable('ledger_year_balances') && Schema::hasTable('year_close_log');
    }

    /** The close that counts for a year: the newest that is not superseded or reopened, else the newest of all. */
    public function current(int $yearId): ?object
    {
        if (! self::ready()) {
            return null;
        }

        return DB::table('year_closes')->where('financial_year_id', $yearId)->whereNotIn('status', ['superseded', 'reopened'])->orderByDesc('id')->first()
            ?? DB::table('year_closes')->where('financial_year_id', $yearId)->orderByDesc('id')->first();
    }

    /** Every year with where its close stands. */
    public function years(): array
    {
        $out = [];
        foreach (FinancialYear::orderByDesc('start_date')->get() as $y) {
            $c = $this->current($y->id);
            $out[] = ['id' => $y->id, 'name' => $y->name, 'start_date' => $y->start_date->toDateString(), 'end_date' => $y->end_date->toDateString(), 'is_closed' => (bool) $y->is_closed,
                'close' => $c ? $this->present($c) : null];
        }

        return $out;
    }

    private function present(object $c): array
    {
        $names = Schema::hasTable('users') ? DB::table('users')->whereIn('id', array_filter([$c->prepared_by, $c->approved_by, $c->locked_by, $c->reopened_by]))->pluck('name', 'id') : collect();

        return ['id' => (int) $c->id, 'status' => $c->status, 'prepared_by' => $names[$c->prepared_by] ?? null, 'prepared_at' => $c->prepared_at, 'approved_by' => $names[$c->approved_by] ?? null, 'approved_at' => $c->approved_at,
            'locked_by' => $names[$c->locked_by] ?? null, 'locked_at' => $c->locked_at, 'reopened_by' => $names[$c->reopened_by] ?? null, 'reopened_at' => $c->reopened_at, 'reopen_reason' => $c->reopen_reason,
            'checklist' => $c->checklist ? json_decode($c->checklist, true) : null, 'summary' => $c->summary ? json_decode($c->summary, true) : null];
    }

    public function secondApproverRequired(): bool
    {
        return ReportSettings::ready() ? (bool) app(ReportSettings::class)->get('second_approver_close') : true;
    }

    /**
     * What must be true before a year can be closed. `blocking` items stop the close; the others are for the preparer's judgement.
     *
     * @return array<int, array{key: string, label: string, status: string, blocking: bool, detail: ?string}>
     */
    public function checklist(FinancialYear $year): array
    {
        $end = $year->end_date->toDateString();
        $start = $year->start_date->toDateString();
        $items = [];
        $add = function (string $key, string $label, bool $ok, bool $blocking, ?string $detail = null, bool $manual = false) use (&$items) {
            $items[] = ['key' => $key, 'label' => $label, 'status' => $ok ? 'pass' : ($blocking ? 'fail' : 'warn'), 'blocking' => $blocking && ! $ok, 'detail' => $detail, 'manual' => $manual];
        };

        $add('year_ended', 'The year has ended', Carbon::parse($end)->lt(today()), true, 'The year ends on ' . $end . '.');
        $earlier = FinancialYear::where('end_date', '<', $start)->where('is_closed', false)->orderBy('start_date')->first();
        $add('earlier_closed', 'The earlier years are closed', ! $earlier, true, $earlier ? "{$earlier->name} is still open: close it first." : null);
        $net = app(LedgerBalances::class)->openings()['net'];
        $add('opening_difference', 'Opening balances net to nothing', abs($net) < 0.01, true, abs($net) < 0.01 ? null : 'The opening balances are out by ' . number_format(abs($net), 2) . ($net > 0 ? ' (debit)' : ' (credit)') . '. Correct them under the ledgers first.');
        $drafts = DB::table('vouchers')->where('status', Voucher::DRAFT)->whereBetween('date', [$start, $end])->count();
        $add('drafts', 'No draft vouchers in the year', $drafts === 0, true, $drafts ? "{$drafts} draft voucher(s) are dated in the year: post or cancel them." : null);
        $suspense = Schema::hasColumn('accounting_settings', 'suspense_ledger_id') ? DB::table('accounting_settings')->value('suspense_ledger_id') : null;
        if ($suspense) {
            $bal = app(LedgerBalances::class)->balance((int) $suspense, $end, Scope::dates(null, $end));
            $add('suspense', 'The suspense account is clear', abs($bal) < 0.01, false, abs($bal) < 0.01 ? null : 'The suspense account holds ' . number_format(abs($bal), 2) . ': clear it or explain it.');
        }
        $limited = app(BranchFilter::class)->limit(auth()->user());
        $add('all_branches', 'You can see every branch', $limited === null, true, $limited === null ? null : 'A close needs figures for the whole business; ask someone with access to every branch.');
        foreach (self::CONFIRMATIONS as $key => $label) {
            $add($key, $label, false, false, 'Tick to confirm when you prepare the close.', true);
        }
        $add('reconciliations', 'Reconciliations are signed off', false, false, 'Not checked yet: reconciliation is not built.', true);

        return $items;
    }

    private function log(int $closeId, string $action, ?User $user, ?string $note = null): void
    {
        DB::table('year_close_log')->insert(['year_close_id' => $closeId, 'action' => $action, 'user_id' => $user?->id, 'user_name' => $user?->name, 'note' => $note, 'created_at' => now()]);
    }

    public function log_for(int $closeId): array
    {
        return DB::table('year_close_log')->where('year_close_id', $closeId)->orderBy('id')->get()->map(fn ($r) => (array) $r)->all();
    }

    /** @param string[] $confirmed the keys of CONFIRMATIONS the preparer ticked */
    public function prepare(FinancialYear $year, User $user, array $confirmed = [], ?string $note = null): object
    {
        $this->assertReady();
        $current = $this->current($year->id);
        if ($current && $current->status === 'locked') {
            throw new BooksException("{$year->name} is already closed. Reopen it first.");
        }
        $blocking = array_values(array_filter($this->checklist($year), fn ($i) => $i['blocking']));
        if ($blocking) {
            throw new BooksException('The year cannot be closed yet: ' . implode(' ', array_map(fn ($i) => $i['label'] . '. ' . ($i['detail'] ?? ''), $blocking)));
        }
        foreach (array_keys(self::CONFIRMATIONS) as $k) {
            if (! in_array($k, $confirmed, true)) {
                throw new BooksException('Confirm: ' . self::CONFIRMATIONS[$k] . '.');
            }
        }

        return DB::transaction(function () use ($year, $user, $confirmed, $note, $current) {
            if ($current && in_array($current->status, ['prepared', 'approved'], true)) {   // preparing again replaces the earlier attempt
                DB::table('year_closes')->where('id', $current->id)->update(['status' => 'superseded', 'updated_at' => now()]);
                DB::table('ledger_year_balances')->where('year_close_id', $current->id)->delete();
                $this->log((int) $current->id, 'superseded', $user, 'Prepared again');
            }
            $figures = $this->figures($year);
            $checklist = array_map(fn ($i) => $i['manual'] && in_array($i['key'], $confirmed, true) ? ['status' => 'pass'] + $i : $i, $this->checklist($year));
            $id = DB::table('year_closes')->insertGetId(['financial_year_id' => $year->id, 'status' => 'prepared', 'prepared_by' => $user->id, 'prepared_at' => now(), 'checklist' => json_encode($checklist),
                'summary' => json_encode($figures['summary']), 'created_at' => now(), 'updated_at' => now()]);
            foreach (array_chunk($figures['rows'], 200) as $chunk) {
                DB::table('ledger_year_balances')->insert(array_map(fn ($r) => $r + ['year_close_id' => $id, 'financial_year_id' => $year->id, 'created_at' => now(), 'updated_at' => now()], $chunk));
            }
            $this->log($id, 'prepared', $user, $note);

            return DB::table('year_closes')->find($id);
        });
    }

    /**
     * Every ledger's balance at the end of the year and what it carries forward, with the year's profit.
     *
     * @return array{rows: array<int, array>, summary: array<string, mixed>}
     */
    public function figures(FinancialYear $year): array
    {
        $end = $year->end_date->toDateString();
        $start = $year->start_date->toDateString();
        $balances = app(LedgerBalances::class);
        $whole = Scope::dates(null, $end);
        $closing = $balances->balances($whole, $end);
        $thisYear = $balances->movement(Scope::dates($start, $end), $start, $end);
        $rows = [];
        $profit = 0.0;           // credit positive: what the income and expense ledgers moved inside the year
        $pl = 0.0;               // credit positive: what they hold in all, earlier years included
        $bs = 0.0;               // signed: what the balance-sheet ledgers carry
        foreach ($balances->ledgers() as $l) {
            $amount = $closing[(int) $l->id] ?? 0.0;
            $isPl = in_array($l->nature, ['income', 'expense'], true);
            if ($isPl) {
                $profit -= ($thisYear[$l->id]['dr'] ?? 0) - ($thisYear[$l->id]['cr'] ?? 0);
                $pl -= $amount;
            } else {
                $bs += $amount;
            }
            if (abs($amount) < 0.005) {
                continue;
            }
            $rows[] = ['ledger_id' => (int) $l->id, 'group_id' => (int) $l->group_id, 'statement_id' => $l->statement_id ? (int) $l->statement_id : null, 'nature' => $l->nature,
                'closing_amount' => round($amount, 2), 'carried_amount' => $isPl ? 0.0 : round($amount, 2), 'reclassified' => 0];
        }
        $profit = round($profit, 2);

        return ['rows' => $rows, 'summary' => ['profit' => $profit, 'earlier_years' => round($pl - $profit, 2), 'retained_earnings' => round($pl, 2), 'balance_sheet_net' => round($bs, 2),
            'ledgers' => count($rows), 'to' => $end]];
    }

    private function assertReady(): void
    {
        if (! self::ready()) {
            throw new BooksException('Run database script 232_year_close.sql to turn on the year-end close.');
        }
    }

    private function find(int $closeId): object
    {
        $this->assertReady();

        return DB::table('year_closes')->find($closeId) ?? throw new BooksException('There is no such close.');
    }

    public function approve(int $closeId, User $user): object
    {
        $c = $this->find($closeId);
        if ($c->status !== 'prepared') {
            throw new BooksException('Only a prepared close can be approved.');
        }
        if ($this->secondApproverRequired() && (int) $c->prepared_by === (int) $user->id) {
            throw new BooksException('The year-end close needs a second person: the one who prepared it cannot approve it.');
        }
        DB::table('year_closes')->where('id', $c->id)->update(['status' => 'approved', 'approved_by' => $user->id, 'approved_at' => now(), 'updated_at' => now()]);
        $this->log($closeId, 'approved', $user);

        return $this->find($closeId);
    }

    /** Lock the year: after this no voucher dated in it can change. */
    public function lock(int $closeId, User $user): object
    {
        $c = $this->find($closeId);
        if ($c->status !== 'approved') {
            throw new BooksException('Only an approved close can be locked.');
        }
        DB::transaction(function () use ($c, $user) {
            DB::table('year_closes')->where('id', $c->id)->update(['status' => 'locked', 'locked_by' => $user->id, 'locked_at' => now(), 'updated_at' => now()]);
            FinancialYear::whereKey($c->financial_year_id)->update(['is_closed' => true, 'closed_by' => $user->id, 'closed_at' => now()]);
            $this->log((int) $c->id, 'locked', $user);
        });

        return $this->find($closeId);
    }

    public function reopen(int $closeId, User $user, string $reason): object
    {
        $c = $this->find($closeId);
        if ($c->status !== 'locked') {
            throw new BooksException('Only a locked year can be reopened.');
        }
        $later = DB::table('year_closes as y')->join('financial_years as f', 'f.id', '=', 'y.financial_year_id')->join('financial_years as me', 'me.id', '=', DB::raw((int) $c->financial_year_id))
            ->where('y.status', 'locked')->whereColumn('f.start_date', '>', 'me.start_date')->exists();
        if ($later) {
            throw new BooksException('A later year is closed: reopen that one first, because it starts from this year\'s balances.');
        }
        if (trim($reason) === '') {
            throw new BooksException('Give a reason for reopening the year.');
        }
        DB::transaction(function () use ($c, $user, $reason) {
            DB::table('year_closes')->where('id', $c->id)->update(['status' => 'reopened', 'reopened_by' => $user->id, 'reopened_at' => now(), 'reopen_reason' => mb_substr($reason, 0, 255), 'updated_at' => now()]);
            FinancialYear::whereKey($c->financial_year_id)->update(['is_closed' => false, 'closed_by' => null, 'closed_at' => null]);
            $this->log((int) $c->id, 'reopened', $user, $reason);
        });

        return $this->find($closeId);
    }

    /** What a locked year carried forward, by ledger. @return array<int, float> */
    public function carried(int $yearId): array
    {
        $c = DB::table('year_closes')->where('financial_year_id', $yearId)->where('status', 'locked')->orderByDesc('id')->first();

        return $c ? DB::table('ledger_year_balances')->where('year_close_id', $c->id)->pluck('carried_amount', 'ledger_id')->map(fn ($v) => (float) $v)->all() : [];
    }
}
