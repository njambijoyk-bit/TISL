<?php

namespace App\Services\Pos;

use App\Models\Books\GiftVoucher;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\CurrencyConversionService;
use App\Services\Books\GiftVoucherService;
use App\Services\Books\PromoUsageService;
use App\Services\Books\RewardService;
use App\Services\Books\VoucherService;
use Illuminate\Support\Facades\DB;

/**
 * What a POS return takes back from the customer's side of the sale, and what cancelling that return gives back.
 *
 * A POS credit note always returns the whole cash sale or invoice, so the sale's loyalty points, promo code use and gift voucher use are undone
 * together with it, each with its own journal where money is involved:
 *   points       Dr Loyalty Points Liability / Cr Rewards & Referral Expense   (the points released)
 *   promo code   the use is taken off the code's counters
 *   gift voucher the balance goes back on the voucher; a journal moves that part of the refund from the cash ledger to the Gift Vouchers Liability,
 *                because the till only hands back what the customer paid in cash
 * Everything done is written to the note's meta (pos_reversal). Cancelling the note undoes it once, and only then: the points go back with a journal that
 * reverses the one that released them, the promo use is counted again, the gift voucher is spent again. A sale whose return was cancelled and that is
 * later cancelled itself has its rewards undone once more by the ordinary cancel, because the meta stamps were put back.
 */
class ReturnRewardsService
{
    public function __construct(private RewardService $rewards, private PromoUsageService $promos, private GiftVoucherService $gifts, private VoucherService $vouchers, private CurrencyConversionService $money) {}

    /**
     * Undo the sale's rewards for this return. Call inside the return's transaction, after the note exists.
     *
     * @return array{gift_base: float} what was written to the note's meta
     */
    public function reverse(Voucher $note, Voucher $source, User $by, ?int $refundLedgerId): array
    {
        $rec = ['source_id' => $source->id, 'at' => now()->toIso8601String()];

        if ($points = $this->rewards->onCancel($source->fresh(), 'returned')) {
            $rec['points'] = $points;
        }
        if ($promo = $this->promos->reverse($source)) {
            $rec['promo'] = $promo;
        }
        $giftBase = 0.0;
        if ($gift = $this->gifts->restoreFor($source, $by, "returned on {$note->voucher_number}")) {
            $rec['gift'] = $gift;
            $giftBase = round((float) array_sum(array_column($gift, 'base')), 2);
            if ($refundLedgerId && $giftBase > 0) {
                $rec['gift_journal_id'] = $this->journal($note, $refundLedgerId, $this->gifts->liabilityLedger(), $giftBase, "Gift voucher value of {$source->voucher_number} kept as a balance, not refunded in cash", $by)->id;
            }
        }
        $rec['gift_base'] = $giftBase;
        $note->update(['meta' => array_merge($note->meta ?? [], ['pos_reversal' => $rec])]);

        return ['gift_base' => $giftBase];
    }

    /**
     * The return was cancelled, so the sale stands again: give back what reverse() took, once. Call inside the cancel's transaction, before the note
     * is marked cancelled (a gift voucher that can no longer cover the sale stops the cancel).
     */
    public function restore(Voucher $note, ?User $by): void
    {
        $rec = $note->meta['pos_reversal'] ?? null;
        if (! is_array($rec) || ! empty($rec['restored_at'])) {
            return;   // not a POS return, or already given back
        }
        $source = Voucher::whereKey($rec['source_id'] ?? 0)->lockForUpdate()->first();
        if (! $source || $source->status !== Voucher::POSTED) {
            $rec['restored_at'] = now()->toIso8601String();
            $rec['skipped'] = 'sale is not live';
            $note->update(['meta' => array_merge($note->meta ?? [], ['pos_reversal' => $rec])]);

            return;   // a cancelled sale has already had its rewards undone; nothing to put back
        }

        // gift vouchers first: they can refuse, and then nothing else has moved
        foreach ((array) ($rec['gift'] ?? []) as $g) {
            $gv = GiftVoucher::find($g['gift_voucher_id'] ?? 0);
            if (! $gv) {
                continue;
            }
            $this->gifts->redeem($gv, (float) $g['amount'], $source, $by, (float) ($g['base'] ?? 0) ?: null);
        }
        if (! empty($rec['gift_journal_id']) && ($j = Voucher::find($rec['gift_journal_id']))) {
            $refund = $note->meta['pos_refund']['ledger_id'] ?? null;
            if ($refund) {
                $rec['gift_unjournal_id'] = $this->journal($note, $this->gifts->liabilityLedger(), (int) $refund, (float) $j->base_total, "Gift voucher value of {$source->voucher_number} spent again, return {$note->voucher_number} cancelled", $by)->id;
            }
        }
        if (! empty($rec['promo'])) {
            $rec['promo_reinstated'] = $this->promos->reinstate((array) $rec['promo']);
        }
        if (! empty($rec['points']) && is_array($rec['points'])) {
            $rec['points_reinstated'] = $this->rewards->onReinstate($source, $rec['points']);
        }
        $rec['restored_at'] = now()->toIso8601String();
        $note->update(['meta' => array_merge($note->meta ?? [], ['pos_reversal' => $rec])]);
    }

    /** A two-line journal in the base currency, debiting one ledger and crediting another. */
    private function journal(Voucher $note, int $debit, int $credit, float $amount, string $narration, ?User $by): Voucher
    {
        $type = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');

        return DB::transaction(fn () => $this->vouchers->create([
            'voucher_type_id' => $type->id, 'date' => today()->toDateString(), 'currency_id' => $this->money->getBaseCurrency()->id,
            'narration' => $narration, 'location_id' => $note->location_id, 'meta' => ['pos_return' => $note->id],
            'entries' => [['ledger_id' => $debit, 'side' => 'D', 'amount' => $amount], ['ledger_id' => $credit, 'side' => 'C', 'amount' => $amount]],
        ], $by));
    }
}
