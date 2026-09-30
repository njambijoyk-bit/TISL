<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\GiftVoucher;
use App\Models\Books\GiftVoucherTransaction;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\LoyaltyPointTransaction;
use App\Services\Books\PointLotService;
use App\Services\CurrencyConversionService;
use App\Services\LoyaltyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The customer's wallet: gift vouchers and loyalty points in one place, every movement with the
 * order it came from (when there is one). Journals the books post behind the scenes are not shown.
 */
class CustomerWalletController extends Controller
{
    private const VOUCHER_LABEL = [
        'issue' => 'Gift voucher received', 'redeem' => 'Spent on an order', 'restore' => 'Returned — order changed or cancelled',
        'expire' => 'Expired', 'adjust' => 'Adjusted by us', 'cancel' => 'Cancelled',
    ];

    private array $orderMemo = [];

    public function show(Request $request, LoyaltyService $loyalty, PointLotService $lots, CurrencyConversionService $money): JsonResponse
    {
        $customer = $request->user()->customer;
        abort_unless($customer, 404);

        // points: what they are worth, and when the next ones lapse
        $lots->ensureLots($customer);
        $lotRows = LoyaltyPointTransaction::where('customer_id', $customer->id)->where('points', '>', 0)->where('remaining', '>', 0)->whereNull('expired_at')
            ->orderByRaw('expires_at IS NULL')->orderBy('expires_at')->orderBy('id')->get(['id', 'remaining', 'unit_value', 'expires_at', 'created_at']);
        $value = round((float) $lotRows->sum(fn ($l) => $l->remaining * (float) $l->unit_value), 2);
        $soon = $lotRows->first(fn ($l) => $l->expires_at !== null);

        $vouchers = GiftVoucher::with('currency:id,code,symbol')->where('customer_id', $customer->id)->orderByRaw("status = 'active' DESC")->orderBy('expires_at')->orderByDesc('id')->get();
        $vTx = GiftVoucherTransaction::whereIn('gift_voucher_id', $vouchers->pluck('id'))->whereNotIn('type', ['fx', 'redeem_reversed'])->orderByDesc('id')->get()->groupBy('gift_voucher_id');
        $pTx = LoyaltyPointTransaction::where('customer_id', $customer->id)->orderByDesc('id')->limit(100)->get();

        $movement = fn ($t, $label, $order) => [
            'id' => $t->id, 'date' => optional($t->created_at)->toDateString(), 'label' => $label, 'order' => $order,
        ];
        $voucherRows = $vouchers->map(function ($g) use ($vTx, $movement) {
            return [
                'id' => $g->id, 'code' => $g->code, 'currency' => $g->currency?->only(['code', 'symbol']), 'initial_amount' => (float) $g->initial_amount,
                'balance' => (float) $g->balance, 'expires_at' => $g->expires_at?->toDateString(), 'status' => $g->status, 'note' => $g->note, 'source' => $g->source,
                'movements' => ($vTx[$g->id] ?? collect())->map(fn ($t) => $movement($t, self::VOUCHER_LABEL[$t->type] ?? ucfirst($t->type), $this->orderFor($t->voucher_id, $g->customer_id))
                    + ['amount' => (float) $t->amount, 'balance_after' => (float) $t->balance_after])->values(),
            ];
        });
        $history = collect();
        foreach ($voucherRows as $g) {
            foreach ($g['movements'] as $m) {
                $history->push(['kind' => 'voucher', 'date' => $m['date'], 'id' => 'v' . $m['id'], 'label' => $m['label'], 'detail' => $g['code'], 'amount' => $m['amount'],
                    'unit' => $g['currency']['code'] ?? '', 'balance_after' => $m['balance_after'], 'order' => $m['order']]);
            }
        }
        foreach ($pTx as $t) {
            $order = $t->reference_type === Voucher::class ? $this->orderFor((int) $t->reference_id, $customer->id) : null;
            $history->push(['kind' => 'points', 'date' => optional($t->created_at)->toDateString(), 'id' => 'p' . $t->id, 'label' => $t->type_label, 'detail' => $t->note, 'amount' => (int) $t->points,
                'unit' => 'points', 'balance_after' => (int) $t->balance_after, 'order' => $order]);
        }

        return response()->json([
            'credits' => app(\App\Services\Books\OpenBillsService::class)->forCustomer($customer->id),   // overpayments / advances we hold for them
            'base' => $money->getBaseCurrency()->only(['code', 'symbol']),
            'points' => [
                'balance' => (int) $customer->loyalty_points, 'value' => $value,
                'expiring_soon' => $soon ? ['points' => (int) $soon->remaining, 'on' => $soon->expires_at->toDateString()] : null,
                'rules' => $loyalty->getRedemptionRules(activeOnly: true), 'min_redemption_points' => (int) $loyalty->getSetting('min_redemption_points', 500),
            ],
            'vouchers' => $voucherRows,
            'history' => $history->sortByDesc(fn ($h) => $h['date'] . str_pad(substr((string) $h['id'], 1), 10, '0', STR_PAD_LEFT))->values()->take(60),
        ]);
    }

    /** The customer's Sales Order that a voucher belongs to (walking up the chain), if any. */
    private function orderFor(?int $voucherId, ?int $customerId): ?array
    {
        if (! $voucherId) {
            return null;
        }
        $key = "{$voucherId}:{$customerId}";
        if (array_key_exists($key, $this->orderMemo)) {
            return $this->orderMemo[$key];
        }
        $id = $voucherId;
        $found = null;
        for ($hops = 0; $id && $hops < 6; $hops++) {
            $v = Voucher::with('type:id,base_type')->find($id, ['id', 'voucher_number', 'customer_id', 'voucher_type_id', 'source_voucher_id']);
            if (! $v || ($customerId && (int) $v->customer_id !== (int) $customerId)) {
                break;
            }
            if ($v->type?->base_type === VoucherType::SALES_ORDER) {
                $found = ['id' => $v->id, 'number' => $v->voucher_number];
                break;
            }
            $id = $v->source_voucher_id;
        }

        return $this->orderMemo[$key] = $found;
    }
}
