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

        $limit = $this->limitFor($user->role, $voucherTypeId);
        $maxDays = $limit ? $limit->max_days_back : $settings->edit_window_days;

        if ($limit) {
            if ($action === 'cancel' && ! $limit->can_cancel) {
                throw new BooksException('Your role can not cancel vouchers.');
            }
            if ($action === 'edit' && ! $limit->can_edit) {
                throw new BooksException('Your role can not edit vouchers.');
            }
        }

        if ($maxDays !== null && $date->diffInDays(Carbon::today(), false) > (int) $maxDays) {
            throw new BooksException(
                "Your role can only " . ($action === 'create' ? 'post' : $action) . " vouchers dated within the last {$maxDays} day(s) — this one is dated {$date->format('d M Y')}."
            );
        }
    }

    public function assertVoucher(string $action, Voucher $voucher, ?User $user): void
    {
        $this->assert($action, $voucher->date, $user, $voucher->voucher_type_id);
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
