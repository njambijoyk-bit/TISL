<?php

namespace App\Services\Books;

use App\Models\Books\AccountingSetting;
use App\Models\Books\FinancialYear;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherEditLimit;
use App\Models\User;
use Carbon\Carbon;

/**
 * Who may create / edit / cancel a voucher of a given date: a hard lock date,
 * closed financial years, and the super-admin-set edit window with per-role limits.
 */
class PeriodGuard
{
    /**
     * @param  string  $action  create | edit | cancel
     * @throws BooksException
     */
    public function assert(string $action, $date, ?User $user, ?int $voucherTypeId = null): void
    {
        $date = Carbon::parse($date)->startOfDay();
        $settings = AccountingSetting::current();

        if ($settings->locked_before && $date->lte(Carbon::parse($settings->locked_before)->startOfDay())) {
            throw new BooksException('The books are locked up to ' . Carbon::parse($settings->locked_before)->format('d M Y') . ' — nothing dated on or before that can change.');
        }

        $year = FinancialYear::containing($date->toDateString());
        if ($year && $year->is_closed) {
            throw new BooksException("{$year->name} is closed — vouchers dated in it can't be changed.");
        }

        if (! $user) {
            return; // system actions (e.g. a customer's checkout) are not role-limited
        }

        $limit = $this->limitForUser($user, $voucherTypeId);
        $maxDays = $limit ? $limit['max_days_back'] : $settings->edit_window_days;

        if ($limit) {
            if ($action === 'cancel' && ! $limit['can_cancel']) {
                throw new BooksException('Your role can not cancel vouchers.');
            }
            if ($action === 'edit' && ! $limit['can_edit']) {
                throw new BooksException('Your role can not edit vouchers.');
            }
        }

        if ($maxDays !== null && $date->diffInDays(Carbon::today(), false) > (int) $maxDays) {
            throw new BooksException(
                "Your role can only " . ($action === 'create' ? 'post' : $action) . " vouchers dated within the last {$maxDays} day(s) — this one is dated {$date->format('d M Y')}."
            );
        }
    }

    /**
     * Is a voucher of this date sealed for every role (a closed financial year, or before the hard lock date)? The voucher screen uses this
     * to show why Edit and Cancel are off. Null when it is not sealed.
     *
     * @return array{kind: string, year?: string, until?: string}|null
     */
    public function sealFor($date): ?array
    {
        $date = Carbon::parse($date)->startOfDay();
        $year = FinancialYear::containing($date->toDateString());
        if ($year && $year->is_closed) {
            return ['kind' => 'year', 'year' => $year->name];
        }
        $settings = AccountingSetting::current();
        if ($settings->locked_before && $date->lte(Carbon::parse($settings->locked_before)->startOfDay())) {
            return ['kind' => 'locked_before', 'until' => Carbon::parse($settings->locked_before)->format('d M Y')];
        }

        return null;
    }

    public function assertVoucher(string $action, Voucher $voucher, ?User $user): void
    {
        $this->assert($action, $voucher->date, $user, $voucher->voucher_type_id);
    }

    /**
     * The edit window that applies to a person: the most generous of the limits set for the roles they hold (their main role and the extra
     * roles in force). Roles with no limit set fall back to the default window, so they are left out. Null when none of their roles has one.
     *
     * @return array{max_days_back: ?int, can_edit: bool, can_cancel: bool}|null
     */
    private function limitForUser(User $user, ?int $typeId): ?array
    {
        $keys = collect(app(\App\Services\Access\Authorizer::class)->roles($user))->pluck('key')->prepend($user->role)->filter()->unique();
        $best = null;
        foreach ($keys as $key) {
            $l = $this->limitFor($key, $typeId);
            if (! $l) {
                continue;
            }
            $row = ['max_days_back' => $l->max_days_back === null ? null : (int) $l->max_days_back, 'can_edit' => (bool) $l->can_edit, 'can_cancel' => (bool) $l->can_cancel];
            if (! $best) {
                $best = $row;
                continue;
            }
            $best['max_days_back'] = ($best['max_days_back'] === null || $row['max_days_back'] === null) ? null : max($best['max_days_back'], $row['max_days_back']);
            $best['can_edit'] = $best['can_edit'] || $row['can_edit'];
            $best['can_cancel'] = $best['can_cancel'] || $row['can_cancel'];
        }

        return $best;
    }

    private function limitFor(?string $role, ?int $typeId): ?VoucherEditLimit
    {
        if (! $role) {
            return null;
        }
        $q = VoucherEditLimit::where('role', $role);
        if ($typeId) {
            $specific = (clone $q)->where('voucher_type_id', $typeId)->first();
            if ($specific) {
                return $specific;
            }
        }

        return $q->whereNull('voucher_type_id')->first();
    }
}
