<?php

namespace App\Services\Pos;

use App\Models\Access\AccessLog;
use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Books\VoucherType;
use App\Models\Pos\Station;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A cashier's shift at a station: opened with a float, every document made while it is open carries it, closed with a count of the drawer. The X report is the shift so far; the Z report is the same
 * thing kept at the close. Expected cash = the float + cash taken − cash given back on returns. One open shift per person and per station. A supervisor can close anyone's shift at their branches.
 * Until script 172 is run no shift is asked for.
 */
class ShiftService
{
    public function __construct(private StationService $stations)
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
        return ['id' => (int) $sh->id, 'user' => User::whereKey($sh->user_id)->value('name'), 'station' => Station::whereKey($sh->station_id)->value('name'), 'location_id' => (int) $sh->location_id,
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
        $notes = DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->where('v.shift_id', $sh->id)->where('v.status', 'posted')->where('t.base_type', VoucherType::CREDIT_NOTE)->get(['v.total_amount', 'v.meta']);
        foreach ($notes as $n) {
            $m = json_decode((string) $n->meta, true) ?: [];
            if (! empty($m['pos_refund'])) {   // money handed back at the till
                $refunds += (float) $m['pos_refund']['amount'];
                $cashRefunds += ! empty($m['pos_refund']['cash']) ? (float) $m['pos_refund']['amount'] : 0;
            }
        }
        $discounts = (float) DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->where('v.shift_id', $sh->id)->where('v.status', 'posted')->sum('i.discount_amount');
        $until = $sh->closed_at ?? now();
        $voids = AccessLog::where('action', 'pos_void')->where('actor_id', $sh->user_id)->whereBetween('created_at', [$sh->opened_at, $until])->count();

        $methods = $takings->map(function ($t) use ($sh, $cashRefunds) {
            $cash = $t->kind === 'cash';

            return ['id' => (int) $t->id, 'name' => $t->name, 'kind' => $t->kind, 'taken' => round((float) $t->amount, 2),
                'expected' => round(((float) $t->amount) + ($cash ? (float) $sh->opening_float - $cashRefunds : 0), 2)];
        })->values()->all();
        if (! collect($methods)->contains('kind', 'cash')) {   // a shift with no cash sale still has its float, less refunds, in the drawer
            $cashMethod = \App\Models\Books\PaymentMethod::where('kind', 'cash')->where('is_active', true)->first();
            if ($cashMethod) {
                array_unshift($methods, ['id' => $cashMethod->id, 'name' => $cashMethod->name, 'kind' => 'cash', 'taken' => 0.0, 'expected' => round((float) $sh->opening_float - $cashRefunds, 2)]);
            }
        }

        return ['cash_sales' => $of(VoucherType::CASH_SALE), 'invoices' => $of(VoucherType::SALES), 'orders' => $of(VoucherType::SALES_ORDER), 'receipts' => $of(VoucherType::RECEIPT), 'returns' => $of(VoucherType::CREDIT_NOTE),
            'refunded' => round($refunds, 2), 'cash_refunded' => round($cashRefunds, 2), 'discounts' => round($discounts, 2), 'voids' => $voids, 'methods' => $methods,
            'expected_cash' => round((float) (collect($methods)->firstWhere('kind', 'cash')['expected'] ?? 0), 2)];
    }

    /** Close the shift with a count of what is in the drawer. $counted: [{payment_method_id, amount}]. The cash count is required; a difference needs a note. @return array<string, mixed> */
    public function close(User $u, int $shiftId, array $counted, ?string $note): array
    {
        return DB::transaction(function () use ($u, $shiftId, $counted, $note) {
            $sh = DB::table('pos_shifts')->where('id', $shiftId)->lockForUpdate()->first() ?? throw new BooksException('That shift does not exist.');
            if ($sh->status !== 'open') {
                throw new BooksException('That shift is already closed.');
            }
            if (! $this->mayHandle($u, $sh) || ((int) $sh->user_id === (int) $u->id && ! app(Authorizer::class)->allows($u, 'pos.shift'))) {
                throw new BooksException('Only the cashier or a supervisor can close this shift.');
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
            DB::table('pos_shifts')->where('id', $shiftId)->update(['status' => 'closed', 'closed_at' => now(), 'closed_by' => $u->id, 'counted' => json_encode($by->all()), 'report' => json_encode($r),
                'variance' => $variance, 'note' => $note ?: null, 'updated_at' => now()]);
            AccessLog::record($u->id, (int) $sh->user_id, 'pos_shift_closed', ['shift' => $shiftId, 'variance' => $variance]);

            return $this->report($u, $shiftId);
        });
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
