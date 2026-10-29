<?php

namespace App\Services\Books;

use App\Models\User;
use App\Services\Access\BranchFilter;
use App\Services\Books\Engine\Identifiers;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The reconciliation hub (docs/BOOKS_REPORTS_PLAN.md, section 6): one ledger's book entries set against an imported statement.
 *
 * Direction is the ledger's own: a bank's statement line is positive when money came in (the ledger grew, a debit); a creditor's when more is owed (a credit).
 * A line matches a book entry on the numbers the entry carries (voucher number, reference, cheque number, M-Pesa code) when the statement names one, else on
 * amount within the tolerance and date within the window (Reports settings). One line matches one entry.
 *
 * The proof: the statement's closing balance, less the statement lines the books do not have yet (bank charges, interest), must equal the book balance less the
 * book entries the statement does not show yet (cheques not cashed, deposits in transit): `statement - unbooked lines = book - outstanding entries`. The difference
 * is shown and must be nil to prepare. A book entry matched in a locked session is cleared and is not offered again.
 *
 * Preparing needs books.reconcile; approving and locking books.reconcile.approve (a second person when the rule is on); reopening books.period and a reason.
 */
class ReconService
{
    public static function ready(): bool
    {
        return Schema::hasTable('recon_sessions') && Schema::hasTable('recon_statement_lines') && Schema::hasTable('recon_log');
    }

    private function assertReady(): void
    {
        if (! self::ready()) {
            throw new BooksException('Run database script 233_reconciliation.sql to turn on reconciliation.');
        }
    }

    private function settings(): array
    {
        $s = ReportSettings::ready() ? app(ReportSettings::class)->values() : [];

        return ['tolerance' => (float) ($s['reconcile_amount_tolerance'] ?? 0), 'window' => (int) ($s['reconcile_date_window_days'] ?? 3), 'second' => (bool) ($s['second_approver_reconcile'] ?? true)];
    }

    /** The ledgers that can be reconciled (the Reports settings), with their kind. */
    public function ledgers(): array
    {
        if (! ReportSettings::ready()) {
            return [];
        }

        return array_values(array_filter(app(ReportSettings::class)->reconcilableLedgers(), fn ($l) => ! $l['disabled']));
    }

    /** +1 when a debit makes the ledger bigger (an asset or expense), -1 when a credit does. */
    private function dir(int $ledgerId): int
    {
        $nature = DB::table('ledgers as l')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')->where('l.id', $ledgerId)->value('g.nature');

        return in_array($nature, ['asset', 'expense'], true) ? 1 : -1;
    }

    private function find(int $id): object
    {
        $this->assertReady();

        return DB::table('recon_sessions')->find($id) ?? throw new BooksException('There is no such reconciliation.');
    }

    private function log(int $id, string $action, ?User $u, ?string $note = null): void
    {
        DB::table('recon_log')->insert(['session_id' => $id, 'action' => $action, 'user_id' => $u?->id, 'user_name' => $u?->name, 'note' => $note, 'created_at' => now()]);
    }

    private function editable(object $s): void
    {
        if (! in_array($s->status, ['open', 'reopened', 'prepared'], true)) {
            throw new BooksException('This reconciliation is ' . $s->status . ' and cannot be changed. Reopen it first.');
        }
    }

    public function sessions(?int $ledgerId = null): array
    {
        $this->assertReady();

        return DB::table('recon_sessions as s')->join('ledgers as l', 'l.id', '=', 's.ledger_id')->when($ledgerId, fn ($q) => $q->where('s.ledger_id', $ledgerId))
            ->orderByDesc('s.statement_to')->orderByDesc('s.id')->limit(100)->get(['s.id', 's.ledger_id', 'l.name as ledger', 's.kind', 's.statement_from', 's.statement_to', 's.statement_closing', 's.status', 's.prepared_at', 's.locked_at'])
            ->map(fn ($r) => (array) $r)->all();
    }

    public function start(array $d, User $user): int
    {
        $this->assertReady();
        $ids = array_column($this->ledgers(), 'id');
        if (! in_array((int) $d['ledger_id'], $ids, true)) {
            throw new BooksException('That ledger is not set up for reconciliation. Choose its group under Books → Configuration → Reports → Reconciliation.');
        }
        $kind = collect($this->ledgers())->firstWhere('id', (int) $d['ledger_id']);
        $id = DB::table('recon_sessions')->insertGetId(['ledger_id' => (int) $d['ledger_id'], 'kind' => $kind['kind'] ?? $kind['suggested_kind'] ?? 'bank', 'statement_from' => $d['statement_from'] ?? null,
            'statement_to' => $d['statement_to'], 'statement_opening' => $d['statement_opening'] ?? null, 'statement_closing' => round((float) $d['statement_closing'], 2), 'status' => 'open',
            'created_by' => $user->id, 'note' => $d['note'] ?? null, 'created_at' => now(), 'updated_at' => now()]);
        $this->log($id, 'started', $user);

        return $id;
    }

    // ── the statement ──────────────────────────────────────────────────

    /**
     * Add the lines of a statement from CSV text.
     *
     * @param  array{date: string|int, description?: string|int, reference?: string|int, amount?: string|int, in?: string|int, out?: string|int, balance?: string|int, date_format?: string, has_header?: bool, delimiter?: string, invert?: bool} $map
     *         a column is its header name (when there is a header) or its position (from 0)
     * @return array{added: int, skipped: int}
     */
    public function import(int $id, string $csv, array $map, User $user, bool $replace = false): array
    {
        $s = $this->find($id);
        $this->editable($s);
        $delimiter = ($map['delimiter'] ?? ',') === '\t' || ($map['delimiter'] ?? '') === 'tab' ? "\t" : ($map['delimiter'] ?? ',');
        $rows = array_map(fn ($line) => str_getcsv($line, $delimiter), preg_split('/\r\n|\r|\n/', trim($csv)) ?: []);
        $rows = array_values(array_filter($rows, fn ($r) => count(array_filter($r, fn ($c) => trim((string) $c) !== '')) > 0));
        $header = ($map['has_header'] ?? true) ? array_map(fn ($h) => mb_strtolower(trim((string) $h)), array_shift($rows) ?? []) : [];
        $col = function ($key) use ($map, $header) {
            if (! isset($map[$key]) || $map[$key] === '' || $map[$key] === null) {
                return null;
            }
            $v = $map[$key];
            if (is_numeric($v) && ! in_array(mb_strtolower((string) $v), $header, true)) {
                return (int) $v;
            }
            $pos = array_search(mb_strtolower(trim((string) $v)), $header, true);

            return $pos === false ? null : (int) $pos;
        };
        $c = ['date' => $col('date'), 'desc' => $col('description'), 'ref' => $col('reference'), 'amount' => $col('amount'), 'in' => $col('in'), 'out' => $col('out'), 'bal' => $col('balance')];
        if ($c['date'] === null || ($c['amount'] === null && $c['in'] === null && $c['out'] === null)) {
            throw new BooksException('Say which column holds the date, and which hold the amount (or the money in and money out).');
        }
        if ($replace) {
            if (DB::table('recon_statement_lines')->where('session_id', $id)->whereNotNull('matched_entry_id')->exists()) {
                throw new BooksException('Some lines are already matched: unmatch them before replacing the statement.');
            }
            DB::table('recon_statement_lines')->where('session_id', $id)->delete();
        }
        $dir = ($map['invert'] ?? false) ? -1 : 1;
        $added = $skipped = 0;
        $no = (int) DB::table('recon_statement_lines')->where('session_id', $id)->max('line_no');
        $existing = DB::table('recon_statement_lines')->where('session_id', $id)->get(['line_date', 'amount', 'reference', 'description'])->map(fn ($r) => substr((string) $r->line_date, 0, 10) . '|' . number_format((float) $r->amount, 2, '.', '') . '|' . $r->reference . '|' . $r->description)->flip()->all();
        foreach ($rows as $r) {
            $date = $this->parseDate((string) ($r[$c['date']] ?? ''), $map['date_format'] ?? null);
            $amount = $c['amount'] !== null ? $this->parseNumber((string) ($r[$c['amount']] ?? '')) : (($this->parseNumber((string) ($r[$c['in']] ?? '')) ?? 0.0) - ($this->parseNumber((string) ($r[$c['out']] ?? '')) ?? 0.0));
            if (! $date || $amount === null || abs($amount) < 0.005) {
                $skipped++;
                continue;
            }
            $amount = round($amount * $dir, 2);
            $desc = $c['desc'] !== null ? mb_substr(trim((string) ($r[$c['desc']] ?? '')), 0, 255) : null;
            $ref = $c['ref'] !== null ? mb_substr(trim((string) ($r[$c['ref']] ?? '')), 0, 120) : null;
            $sig = $date . '|' . number_format($amount, 2, '.', '') . '|' . $ref . '|' . $desc;
            if (isset($existing[$sig])) {   // the same line again: a statement imported twice adds nothing
                $skipped++;
                continue;
            }
            $existing[$sig] = true;
            DB::table('recon_statement_lines')->insert(['session_id' => $id, 'line_no' => ++$no, 'line_date' => $date, 'description' => $desc, 'reference' => $ref, 'amount' => $amount,
                'balance' => $c['bal'] !== null ? $this->parseNumber((string) ($r[$c['bal']] ?? '')) : null, 'created_at' => now(), 'updated_at' => now()]);
            $added++;
        }
        $this->log($id, 'imported', $user, "{$added} lines");

        return ['added' => $added, 'skipped' => $skipped];
    }

    private function parseDate(string $v, ?string $format): ?string
    {
        $v = trim($v);
        if ($v === '') {
            return null;
        }
        try {
            $formats = $format && $format !== 'auto' ? [$format] : ['Y-m-d', 'd/m/Y', 'd-m-Y', 'd.m.Y', 'd M Y', 'd-M-Y', 'Y/m/d', 'd/m/y'];
            foreach ($formats as $f) {
                $d = Carbon::createFromFormat('!' . $f, $v);
                if ($d && $d->format($f) === $v) {
                    return $d->toDateString();
                }
            }
            if (preg_match('/^\d{4}-\d{2}-\d{2}/', $v)) {
                return Carbon::parse(substr($v, 0, 10))->toDateString();
            }
        } catch (\Throwable) {
        }

        return null;
    }

    private function parseNumber(string $v): ?float
    {
        $v = trim($v);
        if ($v === '') {
            return null;
        }
        $neg = (str_starts_with($v, '(') && str_ends_with($v, ')')) || str_starts_with($v, '-') || str_ends_with($v, '-');
        $clean = preg_replace('/[^0-9.\-]/', '', str_replace(',', '', $v));
        if ($clean === '' || ! is_numeric(ltrim($clean, '-'))) {
            return null;
        }
        $n = abs((float) ltrim($clean, '-'));

        return $neg ? -$n : $n;
    }

    // ── the book side ──────────────────────────────────────────────────

    /**
     * The book entries of the ledger up to the statement date, in the ledger's own direction, that no locked session has cleared. Each says whether this
     * session has matched it.
     *
     * @return array<int, array>
     */
    public function bookEntries(object $s): array
    {
        $dir = $this->dir((int) $s->ledger_id);
        $cleared = DB::table('recon_statement_lines as ln')->join('recon_sessions as ss', 'ss.id', '=', 'ln.session_id')->where('ss.status', 'locked')->where('ss.id', '<>', $s->id)
            ->whereNotNull('ln.matched_entry_id')->pluck('ln.matched_entry_id')->flip()->all();
        $mine = DB::table('recon_statement_lines')->where('session_id', $s->id)->whereNotNull('matched_entry_id')->pluck('id', 'matched_entry_id')->all();
        $b = RestatedBase::entry();
        $rows = RestatedBase::join(DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id'))->leftJoin('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->where('e.ledger_id', $s->ledger_id)->where('v.status', 'posted')->where('v.date', '<=', $s->statement_to)
            ->orderBy('v.date')->orderBy('e.id')
            ->get(['e.id', 'e.voucher_id', 'e.side', DB::raw("{$b} as base"), 'e.narration', 'v.voucher_number', 'v.date', 't.name as type', 'v.party_name']);
        $codes = (new Identifiers())->forVouchers($rows->pluck('voucher_id')->all());
        $out = [];
        foreach ($rows as $r) {
            if (isset($cleared[$r->id])) {
                continue;
            }
            $out[] = ['id' => (int) $r->id, 'voucher_id' => (int) $r->voucher_id, 'number' => $r->voucher_number, 'type' => $r->type, 'date' => substr((string) $r->date, 0, 10), 'narration' => $r->narration, 'party' => $r->party_name,
                'amount' => round(($r->side === 'D' ? 1 : -1) * $dir * (float) $r->base, 2), 'codes' => array_map('mb_strtolower', array_values(array_unique(array_filter(array_map('strval', $codes[$r->voucher_id]['codes'] ?? []))))),
                'matched_line' => $mine[$r->id] ?? null];
        }

        return $out;
    }

    public function autoMatch(int $id, User $user): int
    {
        $s = $this->find($id);
        $this->editable($s);
        $cfg = $this->settings();
        $entries = array_values(array_filter($this->bookEntries($s), fn ($e) => $e['matched_line'] === null));
        $taken = [];
        $matched = 0;
        $lines = DB::table('recon_statement_lines')->where('session_id', $id)->whereNull('matched_entry_id')->orderBy('line_date')->orderBy('id')->get();
        foreach ([true, false] as $byCode) {
            foreach ($lines as $ln) {
                if (isset($taken['l' . $ln->id])) {
                    continue;
                }
                $text = mb_strtolower(trim($ln->reference . ' ' . $ln->description));
                $best = null;
                $bestGap = PHP_INT_MAX;
                foreach ($entries as $e) {
                    if (isset($taken[$e['id']]) || abs($e['amount'] - (float) $ln->amount) > $cfg['tolerance'] + 0.0001) {
                        continue;
                    }
                    $gap = abs(Carbon::parse($e['date'])->diffInDays(Carbon::parse($ln->line_date)));
                    if ($byCode) {
                        $hit = false;
                        foreach ($e['codes'] as $code) {
                            if (strlen($code) >= 4 && $text !== '' && str_contains($text, $code)) {
                                $hit = true;
                                break;
                            }
                        }
                        if (! $hit) {
                            continue;
                        }
                    } elseif ($gap > $cfg['window']) {
                        continue;
                    }
                    if ($gap < $bestGap) {
                        $best = $e;
                        $bestGap = $gap;
                    }
                }
                if ($best) {
                    DB::table('recon_statement_lines')->where('id', $ln->id)->update(['matched_entry_id' => $best['id'], 'match_how' => $byCode ? 'reference' : 'amount', 'updated_at' => now()]);
                    $taken[$best['id']] = true;
                    $taken['l' . $ln->id] = true;
                    $matched++;
                }
            }
        }
        $this->log($id, 'matched', $user, "{$matched} automatically");

        return $matched;
    }

    public function match(int $id, int $lineId, int $entryId, User $user): void
    {
        $s = $this->find($id);
        $this->editable($s);
        $line = DB::table('recon_statement_lines')->where('id', $lineId)->where('session_id', $id)->first() ?? throw new BooksException('There is no such statement line.');
        $entry = collect($this->bookEntries($s))->firstWhere('id', $entryId) ?? throw new BooksException('That entry is not open for this reconciliation.');
        if ($entry['matched_line'] !== null && (int) $entry['matched_line'] !== $lineId) {
            throw new BooksException('That entry is already matched to another line.');
        }
        DB::table('recon_statement_lines')->where('id', $line->id)->update(['matched_entry_id' => $entryId, 'match_how' => 'manual', 'updated_at' => now()]);
        $this->log($id, 'matched', $user, "line {$line->line_no} by hand");
    }

    public function unmatch(int $id, int $lineId, User $user): void
    {
        $this->editable($this->find($id));
        $n = DB::table('recon_statement_lines')->where('id', $lineId)->where('session_id', $id)->update(['matched_entry_id' => null, 'match_how' => null, 'updated_at' => now()]);
        if ($n) {
            DB::table('recon_statement_lines')->where('id', $lineId)->where('match_how', 'cleared')->delete();
            $this->log($id, 'unmatched', $user);
        }
    }

    /**
     * Mark book entries as already cleared by earlier statements, from a date back: for the first reconciliation of a ledger, when older entries were never matched.
     * Each becomes a matched line of its own (so the statement's balance still includes it).
     */
    public function clearBefore(int $id, string $date, User $user): int
    {
        $s = $this->find($id);
        $this->editable($s);
        $n = 0;
        foreach ($this->bookEntries($s) as $e) {
            if ($e['matched_line'] === null && $e['date'] < $date) {
                DB::table('recon_statement_lines')->insert(['session_id' => $id, 'line_no' => 0, 'line_date' => $e['date'], 'description' => 'Cleared before ' . $date . ': ' . $e['number'], 'reference' => $e['number'],
                    'amount' => $e['amount'], 'matched_entry_id' => $e['id'], 'match_how' => 'cleared', 'created_at' => now(), 'updated_at' => now()]);
                $n++;
            }
        }
        $this->log($id, 'cleared', $user, "{$n} entries before {$date}");

        return $n;
    }

    /** Post an unbooked statement line (a bank charge, interest) as a journal against another ledger, and match the line to its entry. */
    public function bookLine(int $id, int $lineId, int $otherLedgerId, ?string $narration, User $user): void
    {
        $s = $this->find($id);
        $this->editable($s);
        $line = DB::table('recon_statement_lines')->where('id', $lineId)->where('session_id', $id)->whereNull('matched_entry_id')->first() ?? throw new BooksException('That statement line is already matched.');
        if ($otherLedgerId === (int) $s->ledger_id) {
            throw new BooksException('Choose the ledger the charge or interest belongs to.');
        }
        $dir = $this->dir((int) $s->ledger_id);
        $growth = (float) $line->amount;                                    // in the ledger's direction
        $sideOfLedger = ($growth * $dir) > 0 ? 'D' : 'C';                   // a debit makes an asset bigger
        $amt = abs($growth);
        $v = app(VoucherService::class)->create(['type' => 'journal', 'date' => substr((string) $line->line_date, 0, 10), 'narration' => $narration ?: trim('From the statement: ' . $line->description), 'reference_no' => $line->reference,
            'entries' => [['ledger_id' => (int) $s->ledger_id, 'side' => $sideOfLedger, 'amount' => $amt], ['ledger_id' => $otherLedgerId, 'side' => $sideOfLedger === 'D' ? 'C' : 'D', 'amount' => $amt]]], $user);
        $entry = DB::table('voucher_entries')->where('voucher_id', $v->id)->where('ledger_id', $s->ledger_id)->value('id');
        DB::table('recon_statement_lines')->where('id', $line->id)->update(['matched_entry_id' => $entry, 'match_how' => 'booked', 'updated_at' => now()]);
        $this->log($id, 'booked', $user, "line {$line->line_no} as {$v->voucher_number}");
    }

    // ── the proof ──────────────────────────────────────────────────────

    /** @return array<string, mixed> */
    public function proof(object $s): array
    {
        $dir = $this->dir((int) $s->ledger_id);
        $book = round($dir * app(LedgerBalances::class)->balance((int) $s->ledger_id, substr((string) $s->statement_to, 0, 10), Scope::dates(null, null)), 2);
        $entries = $this->bookEntries($s);
        $outstanding = array_values(array_filter($entries, fn ($e) => $e['matched_line'] === null));
        $unbooked = DB::table('recon_statement_lines')->where('session_id', $s->id)->whereNull('matched_entry_id')->get(['id', 'line_no', 'line_date', 'description', 'reference', 'amount']);
        $out = round(array_sum(array_column($outstanding, 'amount')), 2);
        $unb = round((float) $unbooked->sum('amount'), 2);
        $closing = round((float) $s->statement_closing, 2);
        $difference = round(($closing - $unb) - ($book - $out), 2);

        return ['statement_closing' => $closing, 'unbooked_lines' => $unb, 'adjusted_statement' => round($closing - $unb, 2), 'book_balance' => $book, 'outstanding_entries' => $out, 'adjusted_book' => round($book - $out, 2),
            'difference' => $difference, 'reconciles' => abs($difference) < 0.01, 'counts' => ['outstanding' => count($outstanding), 'unbooked' => $unbooked->count(), 'matched' => DB::table('recon_statement_lines')->where('session_id', $s->id)->whereNotNull('matched_entry_id')->count()]];
    }

    public function view(int $id): array
    {
        $s = $this->find($id);
        $names = Schema::hasTable('users') ? DB::table('users')->whereIn('id', array_filter([$s->created_by, $s->prepared_by, $s->approved_by, $s->locked_by, $s->reopened_by]))->pluck('name', 'id') : collect();
        $lines = DB::table('recon_statement_lines')->where('session_id', $id)->orderBy('line_date')->orderBy('line_no')->orderBy('id')->get()->map(fn ($r) => (array) $r)->all();
        $entries = $this->bookEntries($s);

        return ['session' => ['id' => (int) $s->id, 'ledger_id' => (int) $s->ledger_id, 'ledger' => DB::table('ledgers')->where('id', $s->ledger_id)->value('name'), 'kind' => $s->kind, 'statement_from' => $s->statement_from, 'statement_to' => substr((string) $s->statement_to, 0, 10),
            'statement_closing' => (float) $s->statement_closing, 'status' => $s->status, 'prepared_by' => $names[$s->prepared_by] ?? null, 'approved_by' => $names[$s->approved_by] ?? null, 'locked_by' => $names[$s->locked_by] ?? null,
            'reopen_reason' => $s->reopen_reason, 'note' => $s->note], 'lines' => $lines, 'entries' => array_map(fn ($e) => array_diff_key($e, ['codes' => 1]), $entries), 'proof' => $this->proof($s),
            'log' => DB::table('recon_log')->where('session_id', $id)->orderBy('id')->get()->map(fn ($r) => (array) $r)->all(), 'second_approver' => $this->settings()['second']];
    }

    // ── sign-off ───────────────────────────────────────────────────────

    private function assertAllBranches(): void
    {
        if (app(BranchFilter::class)->limit(auth()->user()) !== null) {
            throw new BooksException('A reconciliation needs the whole ledger: ask someone with access to every branch.');
        }
    }

    public function prepare(int $id, User $user): void
    {
        $s = $this->find($id);
        $this->editable($s);
        $this->assertAllBranches();
        $p = $this->proof($s);
        if (! $p['reconciles']) {
            throw new BooksException('It does not reconcile yet: the difference is ' . number_format(abs($p['difference']), 2) . '. Match the lines, or post what the statement has that the books do not.');
        }
        DB::table('recon_sessions')->where('id', $id)->update(['status' => 'prepared', 'prepared_by' => $user->id, 'prepared_at' => now(), 'proof' => json_encode($p), 'updated_at' => now()]);
        $this->log($id, 'prepared', $user);
    }

    public function approve(int $id, User $user): void
    {
        $s = $this->find($id);
        if ($s->status !== 'prepared') {
            throw new BooksException('Only a prepared reconciliation can be approved.');
        }
        if ($this->settings()['second'] && (int) $s->prepared_by === (int) $user->id) {
            throw new BooksException('A reconciliation needs a second person: the one who prepared it cannot approve it.');
        }
        DB::table('recon_sessions')->where('id', $id)->update(['status' => 'approved', 'approved_by' => $user->id, 'approved_at' => now(), 'updated_at' => now()]);
        $this->log($id, 'approved', $user);
    }

    public function lock(int $id, User $user): void
    {
        $s = $this->find($id);
        if ($s->status !== 'approved') {
            throw new BooksException('Only an approved reconciliation can be locked.');
        }
        if (! $this->proof($s)['reconciles']) {
            throw new BooksException('The books have changed since it was prepared and it no longer reconciles. Reopen it and match again.');
        }
        DB::table('recon_sessions')->where('id', $id)->update(['status' => 'locked', 'locked_by' => $user->id, 'locked_at' => now(), 'updated_at' => now()]);
        $this->log($id, 'locked', $user);
    }

    public function reopen(int $id, User $user, string $reason): void
    {
        $s = $this->find($id);
        if (! in_array($s->status, ['prepared', 'approved', 'locked'], true)) {
            throw new BooksException('Only a prepared, approved or locked reconciliation can be reopened.');
        }
        if (trim($reason) === '') {
            throw new BooksException('Give a reason for reopening it.');
        }
        if ($s->status === 'locked' && DB::table('recon_sessions')->where('ledger_id', $s->ledger_id)->where('status', 'locked')->where('statement_to', '>', $s->statement_to)->exists()) {
            throw new BooksException('A later reconciliation of this ledger is locked: reopen that one first.');
        }
        DB::table('recon_sessions')->where('id', $id)->update(['status' => 'reopened', 'reopened_by' => $user->id, 'reopened_at' => now(), 'reopen_reason' => mb_substr($reason, 0, 255), 'updated_at' => now()]);
        $this->log($id, 'reopened', $user, $reason);
    }

    /** Was this ledger reconciled and locked up to a date? (the year-end close and the health panel ask) */
    public function lockedUpTo(int $ledgerId): ?string
    {
        return self::ready() ? DB::table('recon_sessions')->where('ledger_id', $ledgerId)->where('status', 'locked')->max('statement_to') : null;
    }
}
