<?php

namespace App\Services\Verification;

use App\Models\AttendanceDay;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\PayrollRun;
use App\Models\User;
use App\Models\VerificationAssignment;
use App\Models\VerificationItem;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherVersionService;
use App\Services\Calendar\CalendarService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Verification: a second pair of eyes on the month's records that NEVER changes them or the books. Admin or finance assigns staff to verify a voucher type (or every
 * voucher), payroll runs or attendance months — checking every one, a percentage each month, or hand-picked ones. A verifier sees a monthly register by type, opens an item,
 * and records a status and a note; every change is logged with who and when. A verified voucher that is edited afterwards comes back as "altered" to be checked again.
 * What is left to verify shows on the verifier's calendar, falling as they work through it. A verifier cannot verify their own work (vouchers they created, their own
 * attendance); the super admin can.
 */
class VerificationService
{
    public const MANAGERS = ['admin', 'super_admin', 'finance'];

    public function __construct(private CalendarService $calendar, private VoucherVersionService $versions) {}

    public static function ready(): bool
    {
        return Schema::hasTable('verification_items') && Schema::hasTable('verification_assignments');
    }

    public static function isManager(?User $u): bool
    {
        return $u && $u->holdsAny(self::MANAGERS);
    }

    private function need(): void
    {
        if (! self::ready()) {
            throw new BooksException('Run script 65_verification.sql before using verification.');
        }
    }

    public function dueDay(): int
    {
        return Schema::hasTable('verification_settings') ? (int) (DB::table('verification_settings')->value('due_day') ?: 10) : 10;
    }

    // ── assignments ────────────────────────────────────────────────────────

    public function saveAssignment(array $in, ?int $id, ?User $by): VerificationAssignment
    {
        $this->need();
        $scope = $in['scope_type'] ?? '';
        if (! array_key_exists($scope, VerificationAssignment::SCOPES)) {
            throw new BooksException('Choose what is verified.');
        }
        if ($scope === 'voucher_type' && ! VoucherType::whereKey($in['scope_id'] ?? 0)->exists()) {
            throw new BooksException('Choose the voucher type.');
        }
        $sampling = $in['sampling'] ?? 'all';
        if (! array_key_exists($sampling, VerificationAssignment::SAMPLING)) {
            throw new BooksException('Choose how many are checked.');
        }
        $pct = (int) ($in['percent'] ?? 100);
        if ($sampling === 'percent' && ($pct < 1 || $pct > 100)) {
            throw new BooksException('The percentage must be between 1 and 100.');
        }
        foreach (['from_month', 'to_month'] as $k) {
            if (filled($in[$k] ?? null) && ! preg_match('/^\d{4}-\d{2}$/', $in[$k])) {
                throw new BooksException('Months look like 2026-08.');
            }
        }
        if (! User::whereKey($in['user_id'] ?? 0)->exists()) {
            throw new BooksException('Choose who verifies.');
        }
        $d = ['user_id' => (int) $in['user_id'], 'scope_type' => $scope, 'scope_id' => $scope === 'voucher_type' ? (int) $in['scope_id'] : null, 'location_id' => in_array($scope, ['voucher_type', 'all_vouchers'], true) && ! empty($in['location_id']) ? (int) $in['location_id'] : null,
            'sampling' => $sampling, 'percent' => $sampling === 'percent' ? $pct : 100, 'from_month' => $in['from_month'] ?? null, 'to_month' => $in['to_month'] ?? null, 'is_active' => (bool) ($in['is_active'] ?? true)];

        return $id ? tap(VerificationAssignment::findOrFail($id))->update($d) : VerificationAssignment::create($d + ['created_by' => $by?->id]);
    }

    public function assignments(): array
    {
        if (! self::ready()) {
            return [];
        }
        $types = VoucherType::pluck('name', 'id');

        return VerificationAssignment::orderBy('id')->get()->map(fn ($a) => $a->only(['id', 'user_id', 'scope_type', 'scope_id', 'location_id', 'sampling', 'percent', 'from_month', 'to_month', 'is_active'])
            + ['verifier' => User::whereKey($a->user_id)->value('name'), 'scope_label' => $a->scope_type === 'voucher_type' ? ($types[$a->scope_id] ?? 'a voucher type') : VerificationAssignment::SCOPES[$a->scope_type],
                'branch' => $a->location_id ? DB::table('locations')->where('id', $a->location_id)->value('name') : null])->all();
    }

    // ── materialising the month ────────────────────────────────────────────

    private function inRange(VerificationAssignment $a, string $month): bool
    {
        return (! $a->from_month || $month >= $a->from_month) && (! $a->to_month || $month <= $a->to_month);
    }

    /** Does the deterministic sample take this one? Stable, so the same ones stay chosen. */
    private function sampled(VerificationAssignment $a, string $key): bool
    {
        return match ($a->sampling) { 'all' => true, 'manual' => false, default => (crc32("{$a->id}:{$key}") % 100) < $a->percent };
    }

    /** What a voucher looked like when last changed: its edit-log version, or (before the log) a fingerprint of its figures. */
    public function stamp(Voucher $v): string
    {
        if (Schema::hasTable('voucher_versions')) {
            return 'v' . (int) DB::table('voucher_versions')->where('voucher_id', $v->id)->max('version');
        }

        return 'h' . md5(json_encode([$v->date?->toDateString(), $v->status, (float) $v->total_amount, $v->party_ledger_id]));
    }

    /** Create the month's items for every assignment (new vouchers appear, a cancelled voucher drops out, a verified voucher edited since comes back as altered). */
    public function sync(string $month): void
    {
        $this->need();
        $from = Carbon::parse($month . '-01')->startOfMonth();
        $to = $from->copy()->endOfMonth();
        $types = VoucherType::pluck('name', 'id');
        foreach (VerificationAssignment::where('is_active', true)->orderBy('id')->get() as $a) {
            if (! $this->inRange($a, $month)) {
                continue;
            }
            if (in_array($a->scope_type, ['voucher_type', 'all_vouchers'], true)) {
                $q = Voucher::where('status', Voucher::POSTED)->whereBetween('date', [$from->toDateString(), $to->toDateString()])
                    ->when($a->scope_type === 'voucher_type', fn ($w) => $w->where('voucher_type_id', $a->scope_id))->when($a->location_id, fn ($w) => $w->where('location_id', $a->location_id));
                foreach ($q->with('partyLedger:id,name')->get() as $v) {
                    $this->ensure($a, 'voucher', (string) $v->id, $month, ['type_key' => 'vt:' . $v->voucher_type_id, 'type_label' => $types[$v->voucher_type_id] ?? 'Voucher', 'ref' => $v->voucher_number, 'item_date' => $v->date?->toDateString(),
                        'particulars' => mb_substr((string) ($v->partyLedger?->name ?? $v->party_name ?? $v->narration ?? ''), 0, 160), 'amount' => (float) $v->total_amount]);
                }
            } elseif ($a->scope_type === 'payroll' && Schema::hasTable('payroll_runs')) {
                foreach (PayrollRun::whereBetween('period_start', [$from->toDateString(), $to->toDateString()])->whereIn('status', ['approved', 'paid'])->get() as $r) {
                    $this->ensure($a, 'payroll_run', (string) $r->id, $month, ['type_key' => 'payroll', 'type_label' => 'Payroll runs', 'ref' => $r->number, 'item_date' => $r->period_end->toDateString(), 'particulars' => 'Payroll for the month', 'amount' => (float) $r->total_net]);
                }
            } elseif ($a->scope_type === 'attendance' && Schema::hasTable('attendance_days')) {
                foreach (AttendanceDay::whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->distinct()->pluck('user_id') as $uid) {
                    $this->ensure($a, 'attendance_month', "{$uid}:{$month}", $month, ['type_key' => 'attendance', 'type_label' => 'Attendance months', 'ref' => 'Attendance ' . $month, 'item_date' => $to->toDateString(),
                        'particulars' => (string) User::whereKey($uid)->value('name'), 'amount' => null]);
                }
            }
        }
        $this->recheck($month);
    }

    private function ensure(VerificationAssignment $a, string $type, string $key, string $month, array $attrs): void
    {
        $it = VerificationItem::where('subject_type', $type)->where('subject_key', $key)->first();
        if (! $it) {
            VerificationItem::create($attrs + ['subject_type' => $type, 'subject_key' => $key, 'month' => $month, 'assignment_id' => $a->id, 'assigned_to' => $a->user_id, 'selected' => $this->sampled($a, $key), 'status' => 'pending']);

            return;
        }
        if ($it->assignment_id === $a->id && $it->status === 'pending' && $a->sampling === 'percent') {
            $it->update(['selected' => $this->sampled($a, $key)]);   // the percentage was changed: unchecked ones follow it
        }
        $it->update(array_intersect_key($attrs, array_flip(['ref', 'item_date', 'particulars', 'amount'])));
    }

    /** Vouchers that were cancelled leave the register; verified ones edited since come back as altered. */
    private function recheck(string $month): void
    {
        foreach (VerificationItem::where('month', $month)->where('subject_type', 'voucher')->get() as $it) {
            $v = Voucher::find($it->subject_key);
            if (! $v || $v->status !== Voucher::POSTED) {
                $it->update(['selected' => false, 'status' => $it->status === 'verified' ? 'pending' : $it->status]);
                continue;
            }
            if ($it->status === 'verified' && $it->verified_stamp && $it->verified_stamp !== $this->stamp($v)) {
                $it->update(['status' => 'altered']);
                $this->log($it, null, 'altered', 'Edited after it was verified');
            }
        }
    }

    // ── what the verifier sees ─────────────────────────────────────────────

    private function visible(User $viewer, bool $all)
    {
        return VerificationItem::where('selected', true)->when(! ($all && self::isManager($viewer)), fn ($q) => $q->where('assigned_to', $viewer->id));
    }

    /** The month's register by type: how many to verify, how many done, how many need attention. */
    public function register(User $viewer, string $month, bool $all = false): array
    {
        $this->sync($month);
        $rows = $this->visible($viewer, $all)->where('month', $month)->get()->groupBy('type_key');
        $out = [];
        foreach ($rows as $key => $items) {
            $out[] = ['type_key' => $key, 'label' => $items->first()->type_label, 'total' => $items->count(), 'verified' => $items->where('status', 'verified')->count(),
                'attention' => $items->whereIn('status', ['altered', 'internal_observation', 'external_query', 'internal_clarified', 'external_clarified'])->count(), 'pending' => $items->where('status', 'pending')->count(),
                'amount' => round((float) $items->sum('amount'), 2)];
        }
        usort($out, fn ($a, $b) => strcmp($a['label'], $b['label']));
        $this->touchCalendar($viewer->id, $month);

        return ['month' => $month, 'due' => Carbon::parse($month . '-01')->addMonth()->day(min($this->dueDay(), 28))->toDateString(), 'types' => $out];
    }

    // ── the verification report (every voucher type, whoever verifies it) ───

    /** How the vouchers of a type are being picked for checking, from the active assignments that cover that month. */
    private function methodFor(int $typeId, string $month, $assignments): string
    {
        $labels = [];
        foreach ($assignments as $a) {
            if (! $this->inRange($a, $month) || ! (($a->scope_type === 'voucher_type' && (int) $a->scope_id === $typeId) || $a->scope_type === 'all_vouchers')) {
                continue;
            }
            $labels[] = match ($a->sampling) { 'all' => 'Every one', 'percent' => "{$a->percent}% sampled", default => 'Manually sampled' };
        }

        return implode(', ', array_values(array_unique($labels)));
    }

    /** Tally-style: for the month, each voucher type with how many vouchers there are, how many were picked to check (sampled), and how many of those are verified. */
    public function report(string $month): array
    {
        $this->need();
        $this->sync($month);
        $from = Carbon::parse($month . '-01')->startOfMonth();
        $to = $from->copy()->endOfMonth();
        $totals = Voucher::where('status', Voucher::POSTED)->whereBetween('date', [$from->toDateString(), $to->toDateString()])->selectRaw('voucher_type_id, COUNT(*) as n')->groupBy('voucher_type_id')->pluck('n', 'voucher_type_id');
        $names = VoucherType::pluck('name', 'id');
        $items = VerificationItem::where('month', $month)->where('subject_type', 'voucher')->where('selected', true)->get()->groupBy('type_key');
        $assignments = VerificationAssignment::where('is_active', true)->get();
        $rows = [];
        foreach ($totals as $typeId => $n) {
            $it = $items->get('vt:' . $typeId, collect());
            $rows[] = ['type_key' => 'vt:' . $typeId, 'label' => $names[$typeId] ?? 'Voucher', 'total' => (int) $n, 'sampled' => $it->count(), 'verified' => $it->where('status', 'verified')->count(), 'method' => $this->methodFor((int) $typeId, $month, $assignments)];
        }
        usort($rows, fn ($a, $b) => strcmp($a['label'], $b['label']));

        return ['month' => $month, 'from' => $from->toDateString(), 'to' => $to->toDateString(), 'types' => $rows];
    }

    /** Every voucher of one type for the month, with where it stands: picked for checking or not, and its status and note. */
    public function reportType(string $month, string $typeKey): array
    {
        $this->need();
        $this->sync($month);
        $from = Carbon::parse($month . '-01')->startOfMonth();
        $typeId = (int) substr($typeKey, 3);
        $vouchers = Voucher::where('status', Voucher::POSTED)->where('voucher_type_id', $typeId)->whereBetween('date', [$from->toDateString(), $from->copy()->endOfMonth()->toDateString()])->with('partyLedger:id,name')->orderBy('date')->orderBy('id')->get();
        $items = VerificationItem::where('month', $month)->where('subject_type', 'voucher')->whereIn('subject_key', $vouchers->pluck('id')->map(fn ($i) => (string) $i))->get()->keyBy('subject_key');
        $sampling = VerificationAssignment::whereIn('id', $items->pluck('assignment_id')->filter()->unique())->pluck('sampling', 'id');

        return $vouchers->map(function ($v) use ($items, $sampling) {
            $it = $items->get((string) $v->id);
            $picked = $it && $it->selected;
            $how = $picked ? match ($sampling[$it->assignment_id] ?? null) { 'manual' => 'Manually sampled', 'percent' => 'Sampled', default => null } : null;

            return ['voucher_id' => $v->id, 'item_id' => $picked ? $it->id : null, 'date' => $v->date?->toDateString(), 'ref' => $v->voucher_number, 'particulars' => (string) ($v->partyLedger?->name ?? $v->party_name ?? $v->narration ?? ''),
                'amount' => (float) $v->total_amount, 'sampled' => $how, 'status' => $picked ? $it->status : null, 'status_label' => $picked ? (VerificationItem::STATUSES[$it->status] ?? $it->status) : null, 'note' => $picked ? $it->note : null];
        })->all();
    }

    /** Months with something still to do for this person (for the month picker). @return array<int,array{month:string,open:int,total:int}> */
    public function months(User $viewer, bool $all = false): array
    {
        return $this->visible($viewer, $all)->selectRaw("month, COUNT(*) as total, SUM(CASE WHEN status = 'verified' THEN 0 ELSE 1 END) as open")->groupBy('month')->orderByDesc('month')->limit(18)->get()
            ->map(fn ($r) => ['month' => $r->month, 'total' => (int) $r->total, 'open' => (int) $r->open])->all();
    }

    public function items(User $viewer, string $month, string $typeKey, bool $all = false): array
    {
        $this->sync($month);
        $q = $this->visible($viewer, $all)->where('month', $month)->where('type_key', $typeKey)->orderBy('item_date')->orderBy('id');

        return $q->get()->map(fn ($i) => $this->row($i))->all();
    }

    /** Admin: every item of a type for the month, picked or not, so a hand-picked sample can be chosen. */
    public function pickList(string $month, string $typeKey): array
    {
        $this->sync($month);

        return VerificationItem::where('month', $month)->where('type_key', $typeKey)->orderBy('item_date')->orderBy('id')->get()->map(fn ($i) => $this->row($i) + ['selected' => $i->selected])->all();
    }

    private function row(VerificationItem $i): array
    {
        return ['id' => $i->id, 'ref' => $i->ref, 'date' => $i->item_date?->toDateString(), 'particulars' => $i->particulars, 'amount' => $i->amount, 'status' => $i->status, 'status_label' => VerificationItem::STATUSES[$i->status] ?? $i->status,
            'note' => $i->note, 'verified_by' => $i->verified_by ? User::whereKey($i->verified_by)->value('name') : null, 'verified_at' => $i->verified_at?->toIso8601String(), 'subject_type' => $i->subject_type];
    }

    /** One item in full: its figures as the subject stands now, and the history of what was said about it. */
    public function show(User $viewer, int $id): array
    {
        $i = $this->mine($viewer, $id, false);
        $detail = null;
        if ($i->subject_type === 'voucher') {
            $v = Voucher::find($i->subject_key);
            $detail = $v ? ['kind' => 'voucher', 'snapshot' => $this->versions->snapshot($v), 'versions' => Schema::hasTable('voucher_versions') ? (int) DB::table('voucher_versions')->where('voucher_id', $v->id)->max('version') : 0, 'voucher_id' => $v->id,
                'created_by' => $v->created_by ? User::whereKey($v->created_by)->value('name') : null] : null;
        } elseif ($i->subject_type === 'payroll_run') {
            $run = PayrollRun::find($i->subject_key);
            $detail = $run ? ['kind' => 'payroll', 'run' => app(\App\Services\Payroll\PayrollService::class)->runPayload($run)] : null;
        } else {
            [$uid, $m] = explode(':', $i->subject_key);
            $days = AttendanceDay::where('user_id', $uid)->whereBetween('work_date', [Carbon::parse($m . '-01')->toDateString(), Carbon::parse($m . '-01')->endOfMonth()->toDateString()])->orderBy('work_date')->get();
            $detail = ['kind' => 'attendance', 'name' => User::whereKey($uid)->value('name'), 'counts' => $days->groupBy('status')->map->count(), 'verified_days' => $days->where('verify_status', 'verified')->count(), 'total_days' => $days->count(),
                'overtime_minutes' => (int) $days->sum('overtime_minutes'), 'days' => $days->map(fn ($d) => ['date' => $d->work_date->toDateString(), 'status' => $d->status, 'in' => $d->sign_in_at?->format('H:i'), 'out' => $d->sign_out_at?->format('H:i'), 'verified' => $d->verify_status === 'verified'])->values()];
        }
        $log = DB::table('verification_log as l')->leftJoin('users as u', 'u.id', '=', 'l.user_id')->where('l.item_id', $i->id)->orderBy('l.id')->get(['l.status', 'l.note', 'l.created_at', 'u.name'])
            ->map(fn ($r) => ['status' => $r->status, 'status_label' => VerificationItem::STATUSES[$r->status] ?? $r->status, 'note' => $r->note, 'at' => (string) $r->created_at, 'by' => $r->name])->all();

        return ['item' => $this->row($i) + ['type_label' => $i->type_label, 'clarified_by_name' => $i->clarified_by_name, 'clarified_note' => $i->clarified_note, 'can_mark' => $this->canMark($viewer, $i)], 'detail' => $detail, 'log' => $log];
    }

    private function mine(User $viewer, int $id, bool $forWrite): VerificationItem
    {
        $this->need();
        $i = VerificationItem::findOrFail($id);
        if ((int) $i->assigned_to !== $viewer->id && ! (self::isManager($viewer) && ! $forWrite)) {
            throw new BooksException('That item is not assigned to you.');
        }

        return $i;
    }

    /** Verifiers do not verify their own work (the super admin may). */
    private function canMark(User $u, VerificationItem $i): bool
    {
        if ((int) $i->assigned_to !== $u->id) {
            return false;
        }
        if ($u->holdsAny(['super_admin'])) {
            return true;
        }
        if ($i->subject_type === 'voucher') {
            return (int) Voucher::whereKey($i->subject_key)->value('created_by') !== $u->id;
        }
        if ($i->subject_type === 'attendance_month') {
            return (int) explode(':', $i->subject_key)[0] !== $u->id;
        }

        return true;
    }

    /** Record a status and note. Anything but "verified" needs a note; "clarified from outside" says who cleared it up. */
    public function mark(User $u, int $id, string $status, ?string $note, ?string $clarifiedBy = null): VerificationItem
    {
        $i = $this->mine($u, $id, true);
        if (! $this->canMark($u, $i)) {
            throw new BooksException('You cannot verify your own work — someone else checks it.');
        }
        if (! in_array($status, ['verified', 'internal_observation', 'internal_clarified', 'external_query', 'external_clarified'], true)) {
            throw new BooksException('Choose a status.');
        }
        $note = trim((string) $note);
        if ($status !== 'verified' && $note === '') {
            throw new BooksException('Write a note for that status.');
        }
        if ($status === 'external_clarified' && trim((string) $clarifiedBy) === '') {
            throw new BooksException('Say who cleared it up.');
        }
        if ($status === 'internal_clarified' && $i->status !== 'internal_observation') {
            throw new BooksException('Only an observation can be marked clarified internally.');
        }
        if ($status === 'external_clarified' && $i->status !== 'external_query') {
            throw new BooksException('Only an outside query can be marked clarified from outside.');
        }
        $stamp = null;
        if ($i->subject_type === 'voucher') {
            $v = Voucher::find($i->subject_key);
            if (! $v || $v->status !== Voucher::POSTED) {
                throw new BooksException('That voucher was cancelled.');
            }
            $stamp = $this->stamp($v);
        }
        DB::transaction(function () use ($i, $u, $status, $note, $clarifiedBy, $stamp) {
            $fill = ['status' => $status, 'note' => $note !== '' ? $note : $i->note];
            if ($status === 'verified') {
                $fill += ['verified_stamp' => $stamp, 'verified_by' => $u->id, 'verified_at' => now()];
            }
            if ($status === 'external_clarified') {
                $fill += ['clarified_by_name' => trim((string) $clarifiedBy), 'clarified_note' => $note, 'clarified_at' => now()];
            } elseif ($status === 'internal_clarified') {
                $fill += ['clarified_note' => $note, 'clarified_at' => now()];
            }
            $i->update($fill);
            $this->log($i, $u->id, $status, $note !== '' ? ($status === 'external_clarified' ? "Clarified by {$clarifiedBy}: {$note}" : $note) : null);
        });
        $this->touchCalendar((int) $i->assigned_to, $i->month);

        return $i->fresh();
    }

    /** A manager hand-picks (or drops) an item for a "picked by hand" assignment. */
    public function pick(User $manager, int $id, bool $selected): VerificationItem
    {
        $this->need();
        if (! self::isManager($manager)) {
            throw new BooksException('Only finance or an admin picks what is verified.');
        }
        $i = VerificationItem::findOrFail($id);
        if (! $selected && $i->status !== 'pending') {
            throw new BooksException('That one has already been looked at — it stays on the list.');
        }
        $i->update(['selected' => $selected]);
        $this->touchCalendar((int) $i->assigned_to, $i->month);

        return $i;
    }

    private function log(VerificationItem $i, ?int $userId, string $status, ?string $note): void
    {
        DB::table('verification_log')->insert(['item_id' => $i->id, 'user_id' => $userId, 'status' => $status, 'note' => $note, 'created_at' => now()]);
    }

    // ── the verifier's calendar ────────────────────────────────────────────

    /** One calendar entry per verifier and month, due on the set day of the next month, naming how many are left. It disappears when they are all done. */
    public function touchCalendar(int $userId, string $month): void
    {
        $open = VerificationItem::where('assigned_to', $userId)->where('month', $month)->where('selected', true)->whereNotIn('status', ['verified'])->count();
        $sourceId = (int) (str_replace('-', '', $month) . str_pad((string) $userId, 6, '0', STR_PAD_LEFT));
        if ($open === 0) {
            \App\Models\CalendarEntry::where('source_type', 'verification')->where('source_id', $sourceId)->delete();

            return;
        }
        $due = Carbon::parse($month . '-01')->addMonth()->day(min($this->dueDay(), 28))->startOfDay();
        $this->calendar->put(['source_type' => 'verification', 'source_id' => $sourceId, 'user_id' => $userId, 'resource_id' => null, 'kind' => 'verification',
            'title' => "Verify {$due->copy()->subMonth()->format('F Y')}: {$open} left", 'starts_at' => $due, 'ends_at' => $due->copy()->endOfDay(), 'all_day' => true, 'visibility' => 'staff', 'url' => '/admin/verification?month=' . $month]);
    }

    /** Everyone's open work, for admin: who has how much left, by month. */
    public function workload(): array
    {
        if (! self::ready()) {
            return [];
        }

        return VerificationItem::where('selected', true)->selectRaw("assigned_to, month, COUNT(*) as total, SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified")->groupBy('assigned_to', 'month')->orderByDesc('month')->limit(120)->get()
            ->map(fn ($r) => ['user_id' => (int) $r->assigned_to, 'name' => User::whereKey($r->assigned_to)->value('name'), 'month' => $r->month, 'total' => (int) $r->total, 'verified' => (int) $r->verified])->all();
    }
}
