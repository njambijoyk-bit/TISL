<?php

namespace App\Observers;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherEntry;
use App\Models\Books\VoucherType;
use App\Services\CostCentres\CostCentreService;

/**
 * Every voucher and every entry leaves posting with a cost centre and a branch, whichever screen or job created it. A voucher without a chosen
 * cost centre gets the default for its kind (else its branch's, else General); an entry takes its voucher's, or its own when the settings let a
 * line differ. Until script 102 has run the columns do not exist, so nothing is written to them.
 */
class VoucherDimensionsObserver
{
    public function __construct(private CostCentreService $cc) {}

    public function creating(Voucher|VoucherEntry $model): void
    {
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

        $voucher = Voucher::query()->select(['id', 'cost_centre_id', 'location_id'])->find($model->voucher_id);
        if (! $model->location_id) {
            $model->location_id = $voucher?->location_id;
        }
        if (! $model->cost_centre_id || ! $this->cc->lineOverride()) {
            $model->cost_centre_id = $voucher?->cost_centre_id;
        }
    }
}
