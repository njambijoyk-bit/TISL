<?php

namespace App\Services\Pos;

use App\Models\Access\AccessLog;
use App\Models\Books\AccountingSetting;
use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Pos\Station;
use App\Models\Currency;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A cashier's shift at a station: opened with a float, every document made while it is open carries it, closed with a count of the drawer. The X report is the shift so far; the Z report is the same
 * thing kept at the close. Expected cash = the float + cash taken − cash given back on returns. One open shift per person and per station. Closing someone else's shift, or one's own without the shift permission, needs a supervisor's PIN; so does reopening a closed shift.
 * Until script 172 is run no shift is asked for.
 */
class ShiftService
{
    public function __construct(private StationService $stations, private PinService $pins)
    {
    }

    public static function installed(): bool
    {
        return Schema::hasTable('pos_shifts') && Schema::hasColumn('vouchers', 'shift_id');
    }

    public function current(User $u): ?object
    {
        return self::installed() ? DB::table('pos_shifts')->where('user_id', $u->id)->where('status', 'open')->first() : null;
    }

    /** Does selling here need an open shift? Only once the script is run, and where the branch asks for it (the default). */
    public function required(Station $s): bool
    {
        return self::installed() && $this->stations->branch((int) $s->location_id)['require_shift'];
    }

    /** The shift a document is made in: the cashier's open one, or none; where one is required and missing, the cashier is told to open it. */
    public function forSale(User $u, Station $s): ?int
    {
        $sh = $this->current($u);
        if (! $sh && $this->required($s)) {
            throw new BooksException('Open your shift first (Open shift, with the cash you start with).');
        }

        return $sh ? (int) $sh->id : null;
    }

    public function open(User $u, Station $station, float $float): object
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 172_pos_shifts.sql first.');
        }
        if (! app(Authorizer::class)->allows($u, 'pos.shift')) {
            throw new BooksException('You may not open a shift.');
        }
        if ($float < 0) {
            throw new BooksException('The float can not be less than nothing.');
        }

        return DB::transaction(function () use ($u, $station, $float) {
            if (DB::table('pos_shifts')->where('user_id', $u->id)->where('status', 'open')->lockForUpdate()->exists()) {
                throw new BooksException('You already have a shift open. Close it first.');
            }
            if ($mate = DB::table('pos_shifts')->where('station_id', $station->id)->where('status', 'open')->lockForUpdate()->first()) {
                throw new BooksException('Someone else has this station open ('.User::whereKey($mate->user_id)->value('name').'). Their shift must be closed first, or use another station.');
            }
            $id = DB::table('pos_shifts')->insertGetId(['user_id' => $u->id, 'station_id' => $station->id, 'location_id' => $station->location_id, 'status' => 'open', 'opened_at' => now(), 'opening_float' => round($float, 2),
                'created_at' => now(), 'updated_at' => now()]);
            AccessLog::record($u->id, $u->id, 'pos_shift_opened', ['shift' => $id, 'station' => $station->id, 'float' => round($float, 2)]);

            return DB::table('pos_shifts')->find($id);
        });
    }

    /** Can this person see or close this shift: their own, or any at a branch where they supervise. */
    private function mayHandle(User $u, object $sh): bool
    {
        if ((int) $sh->user_id === (int) $u->id) {
            return true;
        }

        return app(Authorizer::class)->allows($u, 'pos.supervise', ['location_id' => $sh->location_id]);
    }

    /** The X report (or, for a closed shift, the Z report as kept). @return array<string, mixed> */
    public function report(User $u, int $shiftId): array
    {
        $sh = DB::table('pos_shifts')->find($shiftId) ?? throw new BooksException('That shift does not exist.');
        if (! $this->mayHandle($u, $sh)) {
            throw new BooksException('That is someone else\'s shift.');
        }
        if ($sh->status === 'closed' && $sh->report) {
            return json_decode((string) $sh->report, true) + ['shift' => $this->row($sh), 'kind' => 'Z'];
        }

        return $this->compute($sh) + ['shift' => $this->row($sh), 'kind' => 'X'];
    }

    private function row(object $sh): array
    {
        return ['id' => (int) $sh->id, 'user_id' => (int) $sh->user_id, 'user' => User::whereKey($sh->user_id)->value('name'), 'station' => Station::whereKey($sh->station_id)->value('name'), 'location_id' => (int) $sh->location_id,
            'status' => $sh->status, 'opened_at' => $sh->opened_at, 'closed_at' => $sh->closed_at, 'opening_float' => (float) $sh->opening_float, 'variance' => $sh->variance !== null ? (float) $sh->variance : null,
            'closed_by' => $sh->closed_by ? User::whereKey($sh->closed_by)->value('name') : null, 'note' => $sh->note];
    }

    /** @return array<string, mixed> */
    private function compute(object $sh): array
    {
        $docs = DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->where('v.shift_id', $sh->id)->where('v.status', 'posted')
            ->selectRaw('t.base_type as base, count(*) as n, sum(v.total_amount) as total')->groupBy('t.base_type')->get()->keyBy('base');
        $of = fn (string $b) => ['count' => (int) ($docs[$b]->n ?? 0), 'total' => round((float) ($docs[$b]->total ?? 0), 2)];

        $takings = DB::table('voucher_tenders as x')->join('vouchers as v', 'v.id', '=', 'x.voucher_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->join('payment_methods as m', 'm.id', '=', 'x.payment_method_id')
            ->where('v.shift_id', $sh->id)->where('v.status', 'posted')->whereIn('t.base_type', [VoucherType::CASH_SALE, VoucherType::RECEIPT])
            ->selectRaw('m.id as id, m.name as name, m.kind as kind, sum(x.amount) as amount')->groupBy('m.id', 'm.name', 'm.kind')->orderBy('m.name')->get();

        $refunds = 0.0;
        $cashRefunds = 0.0;
        $byMethod = [];   // refunds paid back through a bank or mobile-money ledger, by the payment method of the sale they went back to
        $giftBack = 0.0;   // the part of returned sales that was paid by gift voucher: it went back on the voucher
        $notes = DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->where('v.shift_id', $sh->id)->where('v.status', 'posted')->where('t.base_type', VoucherType::CREDIT_NOTE)->get(['v.total_amount', 'v.meta']);
        foreach ($notes as $n) {
            $m = json_decode((string) $n->meta, true) ?: [];
            if (! empty($m['pos_refund'])) {   // money handed back at the till
                $refunds += (float) $m['pos_refund']['amount'];
                $cashRefunds += ! empty($m['pos_refund']['cash']) ? (float) $m['pos_refund']['amount'] : 0;
                if (empty($m['pos_refund']['cash']) && ! empty($m['pos_refund']['method_id'])) {
                    $byMethod[(int) $m['pos_refund']['method_id']] = ($byMethod[(int) $m['pos_refund']['method_id']] ?? 0) + (float) $m['pos_refund']['amount'];
                }
            }
            $giftBack += (float) ($m['pos_reversal']['gift_base'] ?? 0);
        }
        $discounts = (float) DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->where('v.shift_id', $sh->id)->where('v.status', 'posted')->sum('i.discount_amount');
        $until = $sh->closed_at ?? now();
        $voids = AccessLog::where('action', 'pos_void')->where('actor_id', $sh->user_id)->whereBetween('created_at', [$sh->opened_at, $until])->count();

        $methods = $takings->map(function ($t) use ($sh, $cashRefunds, $byMethod, $giftBack) {
            $cash = $t->kind === 'cash';
            $back = $cash ? $cashRefunds : (float) ($byMethod[(int) $t->id] ?? 0) + ($t->kind === 'gift_voucher' ? $giftBack : 0);   // what went back out through this way of paying

            return ['id' => (int) $t->id, 'name' => $t->name, 'kind' => $t->kind, 'taken' => round((float) $t->amount, 2),
                'expected' => round(((float) $t->amount) + ($cash ? (float) $sh->opening_float : 0) - $back, 2)];
        })->values()->all();
        if (! collect($methods)->contains('kind', 'cash')) {   // a shift with no cash sale still has its float, less refunds, in the drawer
            $cashMethod = \App\Models\Books\PaymentMethod::where('kind', 'cash')->where('is_active', true)->first();
            if ($cashMethod) {
                array_unshift($methods, ['id' => $cashMethod->id, 'name' => $cashMethod->name, 'kind' => 'cash', 'taken' => 0.0, 'expected' => round((float) $sh->opening_float - $cashRefunds, 2)]);
            }
        }

        return ['variance_limit' => $this->stations->branch((int) $sh->location_id)['variance_limit'], 'cash_sales' => $of(VoucherType::CASH_SALE), 'invoices' => $of(VoucherType::SALES), 'orders' => $of(VoucherType::SALES_ORDER), 'receipts' => $of(VoucherType::RECEIPT), 'returns' => $of(VoucherType::CREDIT_NOTE),
            'refunded' => round($refunds, 2), 'cash_refunded' => round($cashRefunds, 2), 'discounts' => round($discounts, 2), 'voids' => $voids, 'methods' => $methods,
            'expected_cash' => round((float) (collect($methods)->firstWhere('kind', 'cash')['expected'] ?? 0), 2)];
    }

    /** Close the shift with a count of what is in the drawer. $counted: [{payment_method_id, amount}]. The cash count is required; a difference needs a note. @return array<string, mixed> */
    public function close(User $u, int $shiftId, array $counted, ?string $note, ?string $approval = null, ?Station $at = null): array
    {
        return DB::transaction(function () use ($u, $shiftId, $counted, $note, $approval, $at) {
            $sh = DB::table('pos_shifts')->where('id', $shiftId)->lockForUpdate()->first() ?? throw new BooksException('That shift does not exist.');
            if ($sh->status !== 'open') {
                throw new BooksException('That shift is already closed.');
            }
            if (! $this->mayHandle($u, $sh)) {
                throw new BooksException('That is someone else\'s shift.');
            }
            $r = $this->compute($sh);
            $by = collect($counted)->mapWithKeys(fn ($c) => [(int) ($c['payment_method_id'] ?? 0) => round((float) ($c['amount'] ?? 0), 2)]);
            $cash = collect($r['methods'])->firstWhere('kind', 'cash');
            if ($cash && ! $by->has($cash['id'])) {
                throw new BooksException('Count the cash in the drawer.');
            }
            $rows = [];
            $variance = 0.0;
            foreach ($r['methods'] as $m) {
                $c = $by->get($m['id']);
                $diff = $c === null ? null : round($c - $m['expected'], 2);
                $rows[] = $m + ['counted' => $c, 'difference' => $diff];
                $variance += $diff ?? 0;
            }
            $variance = round($variance, 2);
            $note = trim((string) $note);
            if (abs($variance) > 0.004 && $note === '') {
                throw new BooksException('The count is '.($variance > 0 ? 'over' : 'short').' by '.number_format(abs($variance), 2).'. Write a note saying why.');
            }
            $r['methods'] = $rows;
            $r['variance'] = $variance;
            // A supervisor's PIN is needed to close someone else's shift, or one's own without the shift permission, and whenever the cash is off by more than the branch allows.
            $cashRow = collect($rows)->firstWhere('kind', 'cash');
            $gap = $cashRow && $cashRow['counted'] !== null ? (float) $cashRow['difference'] : 0.0;
            $limit = $this->stations->branch((int) $sh->location_id)['variance_limit'];
            $large = abs($gap) > $limit + 0.004;
            $needsPin = (int) $sh->user_id !== (int) $u->id || ! app(Authorizer::class)->allows($u, 'pos.shift') || $large;
            $sup = $needsPin ? $this->approvedBy($approval, $u, $at, 'close_shift', $sh, $large
                ? 'The cash is '.($gap > 0 ? 'over' : 'short').' by '.number_format(abs($gap), 2).', more than '.number_format($limit, 2).'. A supervisor must approve closing this shift: ask for their PIN.'
                : 'Closing this shift needs a supervisor: ask for their PIN.') : null;
            if ($needsPin) {
                $this->pins->spend($approval, $u, $at, 'close_shift', ['shift' => $shiftId]);   // spent only now the count is accepted
            }
            $r['books'] = abs($gap) > 0.004 ? $this->postGap($sh, $cashRow, $gap, $u) : null;   // the cash over or short goes to the books
            DB::table('pos_shifts')->where('id', $shiftId)->update(['status' => 'closed', 'closed_at' => now(), 'closed_by' => $u->id, 'counted' => json_encode($by->all()), 'report' => json_encode($r),
                'variance' => $variance, 'note' => $note ?: null, 'updated_at' => now()]);
            AccessLog::record($u->id, (int) $sh->user_id, 'pos_shift_closed', ['shift' => $shiftId, 'variance' => $variance, 'cash_gap' => $gap] + ($sup ? ['approved_by' => $sup] : []));

            return $this->report($u, $shiftId);
        });
    }

    /**
     * Put a cash over or short in the books as a journal: short is Dr Cash Over / Short, Cr the till's cash ledger; over is the other way round. The till's cash ledger is the one the
     * cash payment method posts to. Closing is never blocked when Books is not set up for it: the report then says the difference was not posted.
     *
     * @return array<string, mixed>
     */
    private function postGap(object $sh, array $cashRow, float $gap, User $u): array
    {
        $over = AccountingSetting::current()->cash_over_short_ledger_id;
        $cash = StationLedgers::of((int) $sh->station_id)['cash'] ?: PaymentMethod::whereKey($cashRow['id'])->value('ledger_id');   // the station's own cash ledger, else the method's
        $journal = VoucherType::byBase(VoucherType::JOURNAL);
        if (! $over || ! $cash || ! $journal) {
            return ['posted' => false, 'amount' => round($gap, 2), 'why' => ! $over ? 'The Cash Over / Short ledger is not chosen in Books settings.' : (! $cash ? 'The cash payment method has no ledger.' : 'The Journal voucher type is switched off.')];
        }
        $amount = round(abs($gap), 2);
        $station = Station::whereKey($sh->station_id)->value('name');
        [$dr, $cr] = $gap < 0 ? [(int) $over, (int) $cash] : [(int) $cash, (int) $over];
        $v = app(VoucherService::class)->create([
            'voucher_type_id' => $journal->id, 'date' => today()->toDateString(), 'location_id' => (int) $sh->location_id, 'currency_id' => Currency::getBaseCurrency()?->id,
            'narration' => 'Cash '.($gap < 0 ? 'short' : 'over')." at {$station}, shift #{$sh->id}", 'meta' => ['pos_shift' => (int) $sh->id, 'cash_over_short' => round($gap, 2)],
            'entries' => [['ledger_id' => $dr, 'side' => 'D', 'amount' => $amount], ['ledger_id' => $cr, 'side' => 'C', 'amount' => $amount]],
        ], $u);

        return ['posted' => true, 'amount' => round($gap, 2), 'journal_id' => (int) $v->id, 'journal' => $v->voucher_number];
    }

    /** The supervisor whose PIN approval is good for this purpose here, who must also hold supervise at the shift's branch. Nothing is spent. */
    private function approvedBy(?string $token, User $u, ?Station $at, string $purpose, object $sh, string $message): int
    {
        $sup = $at ? $this->pins->peek($token, $u, $at, $purpose) : null;
        if (! $sup) {
            throw new ApprovalRequired($purpose, $message);
        }
        $who = User::find($sup);
        if (! $who || ! app(Authorizer::class)->allows($who, 'pos.supervise', ['location_id' => $sh->location_id])) {
            throw new BooksException('That supervisor can not approve for this shift\'s branch.');
        }

        return $sup;
    }

    /**
     * Open a closed shift again, with a supervisor's PIN and a reason. Only while the cashier has no other shift open and nobody has opened the station since.
     * The Z report it had is kept in the access log; closing it again makes a new one.
     *
     * @return array<string, mixed> the X report of the reopened shift
     */
    public function reopen(User $u, int $shiftId, string $reason, ?string $approval, Station $at): array
    {
        $reason = trim($reason);
        if (mb_strlen($reason) < 3) {
            throw new BooksException('Say why the shift is being reopened.');
        }
        DB::transaction(function () use ($u, $shiftId, $reason, $approval, $at) {
            $sh = DB::table('pos_shifts')->where('id', $shiftId)->lockForUpdate()->first() ?? throw new BooksException('That shift does not exist.');
            if ($sh->status !== 'closed') {
                throw new BooksException('That shift is not closed.');
            }
            if (! $this->mayHandle($u, $sh)) {
                throw new BooksException('That is someone else\'s shift.');
            }
            $sup = $this->approvedBy($approval, $u, $at, 'reopen_shift', $sh, 'Reopening a shift needs a supervisor: ask for their PIN.');
            if (DB::table('pos_shifts')->where('user_id', $sh->user_id)->where('status', 'open')->lockForUpdate()->exists()) {
                throw new BooksException(User::whereKey($sh->user_id)->value('name').' has another shift open. Close it first.');
            }
            if (DB::table('pos_shifts')->where('station_id', $sh->station_id)->where('status', 'open')->lockForUpdate()->exists()) {
                throw new BooksException('The station has been opened by someone else since: that shift must be closed first.');
            }
            $this->pins->spend($approval, $u, $at, 'reopen_shift', ['shift' => $shiftId]);
            $was = json_decode((string) $sh->report, true) ?: [];
            if (! empty($was['books']['journal_id']) && ($j = Voucher::find($was['books']['journal_id'])) && $j->status === Voucher::POSTED) {
                app(VoucherService::class)->cancel($j, "Shift #{$shiftId} reopened: closing it again posts the cash over or short afresh", $u);   // the books follow the shift
            }
            AccessLog::record($u->id, (int) $sh->user_id, 'pos_shift_reopened', ['shift' => $shiftId, 'reason' => $reason, 'approved_by' => $sup, 'closed_at' => $sh->closed_at, 'variance' => $sh->variance,
                'counted' => json_decode((string) $sh->counted, true), 'report' => json_decode((string) $sh->report, true)]);
            DB::table('pos_shifts')->where('id', $shiftId)->update(['status' => 'open', 'closed_at' => null, 'closed_by' => null, 'counted' => null, 'report' => null, 'variance' => null, 'note' => null, 'updated_at' => now()]);
        });

        return $this->report($u, $shiftId);
    }

    /** Open shifts (and the last few closed ones) that this person may see: their own; a supervisor sees every shift at their branches. @return array<int, array<string, mixed>> */
    public function list(User $u): array
    {
        if (! self::installed()) {
            return [];
        }
        $access = app(Authorizer::class);
        $scope = $access->locationIds($u);
        $rows = DB::table('pos_shifts')->when($scope !== null, fn ($q) => $q->whereIn('location_id', $scope ?: [0]))->orderByRaw("status = 'open' desc")->orderByDesc('id')->limit(40)->get();

        return $rows->filter(fn ($sh) => $this->mayHandle($u, $sh))->map(fn ($sh) => $this->row($sh))->values()->all();
    }

    /** Is this refund ledger a cash drawer (Cash-in-hand) rather than a bank? */
    public function isCashLedger(int $ledgerId): bool
    {
        $gid = Ledger::whereKey($ledgerId)->value('group_id');
        $ids = LedgerGroup::where('name', 'Cash-in-hand')->get()->flatMap(fn ($g) => $g->selfAndDescendantIds())->unique()->all();

        return $gid && in_array((int) $gid, $ids, true);
    }
}
