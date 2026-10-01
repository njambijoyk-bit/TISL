<?php

namespace App\Services\Books;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\ReferralCode;
use App\Models\ReferralCodeUsage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Promo code usage, kept in step with the vouchers. A code is used when the voucher that carries it is POSTED (an Invoice
 * or a Cash Sale — a Sales Order or a quotation only records it), one usage row per voucher, and the use is taken back when that
 * voucher is cancelled or edited. A document made from another that already logged the use does not log it again.
 */
class PromoUsageService
{
    private const TYPES = [VoucherType::SALES, VoucherType::CASH_SALE];   // a Sales Order is only a record: it holds the code, it does not use it

    /** Log the use of the promo code this voucher carries. */
    public function record(Voucher $v): void
    {
        $v->loadMissing('type');
        $codeId = $v->meta['promo_code_id'] ?? null;
        if (! $codeId || $v->status !== Voucher::POSTED || ! in_array($v->type->base_type, self::TYPES, true) || ! $this->ready()) {
            return;
        }
        if (ReferralCodeUsage::where('voucher_id', $v->id)->where('referral_code_id', $codeId)->where('status', 'completed')->exists() || $this->loggedUpstream($v, (int) $codeId)) {
            return;
        }
        $code = ReferralCode::find($codeId);
        if (! $code) {
            return;
        }
        $discount = (float) collect($v->meta['discounts'] ?? [])->where('source', 'promo')->sum('amount');
        $value = (float) $v->subtotal;
        $rate = (float) ($v->exchange_rate ?: 1);

        DB::transaction(function () use ($v, $code, $discount, $value, $rate) {
            ReferralCodeUsage::create([
                'referral_code_id' => $code->id, 'customer_id' => $v->customer_id, 'voucher_id' => $v->id, 'status' => 'completed',
                'discount_amount' => round($discount * $rate, 2), 'discount_type' => $code->reward_type, 'order_value' => round($value * $rate, 2),
                'final_price' => round(($value - $discount) * $rate, 2), 'source' => 'voucher', 'completed_at' => now(),
            ]);
            $code->recordSuccess($discount, $value, $rate);
        });
    }

    /**
     * Log the promo codes that live vouchers used but never logged (they were saved before the code was carried onto the
     * voucher). A promo line's discount names its code; the voucher is then given the code and logged like any other.
     *
     * @return int how many vouchers were logged
     */
    public function backfill(bool $dryRun = false): int
    {
        if (! $this->ready()) {
            return 0;
        }
        $done = 0;
        $rows = DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->where('i.discount_source', 'promo')->whereNotNull('i.discount_ref')->where('v.status', Voucher::POSTED)->whereIn('t.base_type', self::TYPES)
            ->groupBy('v.id', 'i.discount_ref')->orderBy('v.id')->get(['v.id as voucher_id', 'i.discount_ref as code', DB::raw('SUM(i.discount_amount) as discount')]);
        foreach ($rows as $r) {
            $v = Voucher::find($r->voucher_id);
            $code = ReferralCode::where('code', strtoupper(trim((string) $r->code)))->first();
            if (! $v || ! $code || ! empty($v->meta['promo_code_id']) || ReferralCodeUsage::where('voucher_id', $v->id)->where('status', 'completed')->exists()) {
                continue;
            }
            $done++;
            if ($dryRun) {
                continue;
            }
            $meta = (array) $v->meta;
            $meta['promo_code_id'] = $code->id;
            $meta['discounts'] = array_merge((array) ($meta['discounts'] ?? []), [['source' => 'promo', 'ref' => $code->code, 'amount' => round((float) $r->discount, 2)]]);
            $v->update(['meta' => $meta]);
            $this->record($v->fresh());
        }

        return $done;
    }

    /** Take back the use(s) logged for this voucher. */
    public function reverse(Voucher $v): void
    {
        if (! $this->ready()) {
            return;
        }
        $rows = ReferralCodeUsage::where('voucher_id', $v->id)->where('status', 'completed')->get();
        if ($rows->isEmpty()) {
            return;
        }
        DB::transaction(function () use ($rows) {
            foreach ($rows as $row) {
                $rate = 1.0;   // the row holds base-currency amounts already
                if ($code = ReferralCode::find($row->referral_code_id)) {
                    $code->reverseSuccess((float) $row->discount_amount, (float) $row->order_value, $rate);
                }
                $row->update(['status' => 'cancelled']);
            }
        });
    }

    /** True once script 35 has added the voucher link (until then nothing is logged, nothing breaks). */
    private function ready(): bool
    {
        static $ok = null;

        return $ok ??= Schema::hasTable('referral_code_usage') && Schema::hasColumn('referral_code_usage', 'voucher_id');
    }

    /** A document upstream that already logged the code (an older invoice this one was made from): do not log it again. */
    private function loggedUpstream(Voucher $v, int $codeId): bool
    {
        $src = $v->source_voucher_id;
        for ($i = 0; $src && $i < 6; $i++) {
            if (ReferralCodeUsage::where('voucher_id', $src)->where('referral_code_id', $codeId)->where('status', 'completed')->exists()) {
                return true;
            }
            $src = Voucher::whereKey($src)->value('source_voucher_id');
        }

        return false;
    }
}
