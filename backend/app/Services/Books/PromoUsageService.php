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
