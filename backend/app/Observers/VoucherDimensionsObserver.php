<?php

namespace App\Observers;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherEntry;
use App\Models\Books\VoucherType;
use App\Services\CostCentres\CostCentreService;
use Illuminate\Support\Facades\Schema;

/**
 * Every voucher and every entry leaves posting with a cost centre and a branch, whichever screen or job created it. A voucher without a chosen
 * cost centre gets the default for its kind (else its branch's, else General); an entry takes its voucher's, or its own when the settings let a
 * line differ. Until script 102 has run the columns do not exist, so nothing is written to them.
 */
class VoucherDimensionsObserver
{
    public function __construct(private CostCentreService $cc) {}

    /** Have the books been given the initiative columns (script 244)? Until then nothing is written to them. */
    public static function initiativesReady(): bool
    {
        return self::$initiativesReady ??= Schema::hasColumn('voucher_entries', 'initiative_id') && Schema::hasColumn('vouchers', 'initiative_id');
    }

    private static ?bool $initiativesReady = null;

    /** Look again at the next call (a test adds the columns). */
    public static function forgetInitiativesReady(): void
    {
        self::$initiativesReady = null;
    }

    public function creating(Voucher|VoucherEntry $model): void
    {
        if (! self::initiativesReady()) {
            $model->offsetUnset('initiative_id');
        } elseif ($model instanceof VoucherEntry) {
            $voucher = Voucher::query()->select(['id', 'initiative_id', 'meta'])->find($model->voucher_id);
            // like the cost centre: a line keeps its own initiative only when the settings let a line differ
            if (! $model->initiative_id || ! (($this->cc->booksReady() && $this->cc->lineOverride()) || ! empty($voucher?->meta['lines_own_cost_centre']))) {
                $model->initiative_id = $voucher?->initiative_id;
            }
        }

        if (! $this->cc->booksReady()) {
            foreach (['cost_centre_id', 'location_id'] as $k) {
                if ($model instanceof VoucherEntry || $k === 'cost_centre_id') {
                    $model->offsetUnset($k);
                }
            }

            return;
        }

        if ($model instanceof Voucher) {
            if (! $model->cost_centre_id) {
                $base = VoucherType::whereKey($model->voucher_type_id)->value('base_type');
                $model->cost_centre_id = $this->cc->forVoucher($base, $model->location_id ? (int) $model->location_id : null);
            }

            return;
        }

        $voucher = Voucher::query()->select(['id', 'cost_centre_id', 'location_id', 'meta'])->find($model->voucher_id);
        if (! $model->location_id) {
            $model->location_id = $voucher?->location_id;
        }
        // lines may keep their own cost centre when the settings allow it, or when the system split the voucher itself (payroll)
        $own = $this->cc->lineOverride() || ! empty($voucher?->meta['lines_own_cost_centre']);
        if (! $model->cost_centre_id || ! $own) {
            $model->cost_centre_id = $voucher?->cost_centre_id;
        }
    }
}
