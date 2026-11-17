<?php

namespace App\Services\Books;

use App\Models\Books\VoucherEntry;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Money held for clients (docs/PROJECTS_STAGE4_SPEC.md, build 4.5), seen from the books.
 *
 * A client money account is a bank ledger whose money belongs to clients, balance by balance; each Books line that moves it can carry the
 * balance it belongs to (`voucher_entries.project_holding_id`). What a balance holds is the posted lines on its account's bank ledger
 * tagged with it, debits less credits.
 *
 * When an account's guard is on, the books refuse a voucher that
 *  - takes money out of that bank ledger without saying whose balance it comes from, or
 *  - lowers a balance below zero (a balance already below zero may still go up).
 * Cancelling a voucher is checked the same way: cancelling a receipt that was already paid out is refused.
 * Every account's guard is off until someone switches it on, and without database script 260 nothing here runs.
 */
class ClientMoneyGuard
{
    private const KEY = 'books.client_money.ready';

    /** Looked up once per request (kept in the container, so it never outlives the app it was asked in). */
    public static function ready(): bool
    {
        if (! app()->bound(self::KEY)) {
            app()->instance(self::KEY, Schema::hasTable('project_client_accounts') && Schema::hasTable('project_client_holdings') && VoucherEntry::holdsClientMoney());
        }

        return (bool) app(self::KEY);
    }

    /** For a script that builds the tables after the first look. */
    public static function forget(): void
    {
        app()->offsetUnset(self::KEY);
        VoucherEntry::forgetHolding();
    }

    /** What each balance holds now. @param int[] $holdingIds @return array<int, float> */
    public function held(array $holdingIds): array
    {
        $out = array_fill_keys(array_map('intval', $holdingIds), 0.0);
        if (! $out || ! self::ready()) {
            return $out;
        }
        $rows = DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id')
            ->join('project_client_holdings as h', 'h.id', '=', 'e.project_holding_id')->join('project_client_accounts as a', function ($j) {
                $j->on('a.id', '=', 'h.account_id')->on('a.ledger_id', '=', 'e.ledger_id');
            })->where('v.status', 'posted')->whereIn('e.project_holding_id', array_keys($out))->groupBy('e.project_holding_id')
            ->selectRaw("e.project_holding_id as h, SUM(CASE WHEN e.side = 'D' THEN e.amount ELSE -e.amount END) as n")->pluck('n', 'h');
        foreach ($rows as $h => $n) {
            $out[(int) $h] = round((float) $n, 2);
        }

        return $out;
    }

    /** After a voucher's lines are written (new or edited). */
    public function afterPosting(int $voucherId): void
    {
        $this->check($voucherId, 1);
    }

    /** After a voucher is marked cancelled: its lines no longer count. */
    public function afterCancelling(int $voucherId): void
    {
        $this->check($voucherId, -1);
    }

    /** @param int $sign 1: the voucher's lines were just added; -1: they were just taken away */
    private function check(int $voucherId, int $sign): void
    {
        if (! self::ready()) {
            return;
        }
        $guarded = DB::table('project_client_accounts')->where('guard_on', 1)->get(['id', 'ledger_id', 'name'])->keyBy('ledger_id');
        if ($guarded->isEmpty()) {
            return;
        }
        $lines = DB::table('voucher_entries')->where('voucher_id', $voucherId)->whereIn('ledger_id', $guarded->keys())->get(['ledger_id', 'side', 'amount', 'project_holding_id']);
        if ($lines->isEmpty()) {
            return;
        }
        $change = [];
        foreach ($lines as $l) {
            $account = $guarded[$l->ledger_id];
            if (! $l->project_holding_id) {
                if ($sign === 1 && $l->side === 'C' && (float) $l->amount > 0) {
                    throw new BooksException("\"{$account->name}\" holds clients' money, and its guard is on: money leaving it must come out of a client's balance. Pay it from Projects, Client money.");
                }
                continue;
            }
            $h = (int) $l->project_holding_id;
            if ((int) DB::table('project_client_holdings')->where('id', $h)->value('account_id') !== (int) $account->id) {
                throw new BooksException("That client balance is not in \"{$account->name}\".");
            }
            $change[$h] = ($change[$h] ?? 0.0) + $sign * ($l->side === 'D' ? 1 : -1) * (float) $l->amount;
        }
        $falling = array_keys(array_filter($change, fn ($c) => $c < -0.004));
        if (! $falling) {
            return;
        }
        DB::table('project_client_holdings')->whereIn('id', $falling)->lockForUpdate()->get(['id']);
        foreach ($this->held($falling) as $h => $now) {
            if ($now < -0.004) {
                $label = DB::table('project_client_holdings')->where('id', $h)->value('label');
                $had = round($now - $change[$h], 2);
                throw new BooksException("This would take the client balance \"{$label}\" below zero: it holds " . number_format(max($had, 0), 2) . ' and ' . number_format(-$change[$h], 2) . ' would leave it. Client money is never paid out of other clients\' balances.');
            }
        }
    }
}
