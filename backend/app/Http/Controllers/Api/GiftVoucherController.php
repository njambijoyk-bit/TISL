<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\GiftVoucher;
use App\Models\Books\Voucher;
use App\Services\Books\BooksException;
use App\Services\Books\GiftVoucherService;
use App\Services\Books\VoucherService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Gift vouchers: finance issues and watches them; customers see and spend their own. */
class GiftVoucherController extends Controller
{
    public function __construct(private GiftVoucherService $gifts) {}

    private function guard(callable $fn)
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function index(Request $request): JsonResponse
    {
        $q = GiftVoucher::with(['customer:id,first_name,last_name,email', 'currency:id,code,symbol'])
            ->when($request->filled('status'), fn ($w) => $w->where('status', $request->status))
            ->when($request->filled('customer_id'), fn ($w) => $w->where('customer_id', $request->customer_id))
            ->when($request->filled('search'), fn ($w) => $w->where('code', 'like', '%' . $request->search . '%'))
            ->orderByDesc('id');

        return response()->json($q->paginate(min((int) $request->get('per_page', 25), 100)));
    }

    public function show($id): JsonResponse
    {
        $gv = GiftVoucher::with(['customer:id,first_name,last_name,email', 'currency:id,code,symbol', 'transactions'])->findOrFail($id);

        return response()->json($gv);
    }

    public function store(Request $request): JsonResponse
    {
        $d = $request->validate([
            'amount' => 'required|numeric|min:0.01', 'currency_id' => 'nullable|integer|exists:currencies,id', 'customer_id' => 'nullable|integer|exists:customers,id',
            'source' => 'required|in:sale,customer_account,promo,manual', 'payment_method_id' => 'required_if:source,sale|nullable|integer|exists:payment_methods,id',
            'party_ledger_id' => 'required_if:source,customer_account|nullable|integer|exists:ledgers,id', 'expires_at' => 'nullable|date|after:today', 'note' => 'nullable|string|max:255',
        ]);

        return $this->guard(function () use ($d, $request) {
            $gv = $this->gifts->issue($d, $request->user());

            return response()->json(['message' => "Gift voucher {$gv->code} issued", 'data' => $gv->load('currency:id,code,symbol')], 201);
        });
    }

    /** Void an unspent voucher: the value goes back to where it came from. */
    public function cancel(Request $request, $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $gv = GiftVoucher::findOrFail($id);
            if ($gv->status !== GiftVoucher::ACTIVE) {
                throw new BooksException('Only an active gift voucher can be cancelled.');
            }
            $issued = $gv->issued_voucher_id ? Voucher::find($gv->issued_voucher_id) : null;
            $back = (float) $gv->balance;
            if ($issued && $back > 0) {
                // reverse the unspent part of the issue journal
                $source = $issued->entries()->where('side', 'D')->first();
                $liab = $issued->entries()->where('side', 'C')->first();
                if ($source && $liab) {
                    app(VoucherService::class)->create([
                        'voucher_type_id' => $issued->voucher_type_id, 'date' => today()->toDateString(), 'currency_id' => $gv->currency_id,
                        'narration' => "Gift voucher {$gv->code} cancelled", 'meta' => ['gift_voucher_id' => $gv->id],
                        'entries' => [['ledger_id' => $liab->ledger_id, 'side' => 'D', 'amount' => $back], ['ledger_id' => $source->ledger_id, 'side' => 'C', 'amount' => $back]],
                    ], $request->user());
                }
            }
            $gv->update(['status' => GiftVoucher::CANCELLED, 'balance' => 0]);

            return response()->json(['message' => "{$gv->code} cancelled", 'data' => $gv->fresh()]);
        });
    }

    public function reconcile(): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->gifts->reconcile()));
    }

    public function expireDue(Request $request): JsonResponse
    {
        return $this->guard(fn () => response()->json(['message' => 'Expired', 'count' => $this->gifts->expireDue($request->user())]));
    }

    /** Customer: my gift vouchers. */
    public function mine(Request $request): JsonResponse
    {
        $customerId = $request->user()?->customer?->id;

        return response()->json(GiftVoucher::with('currency:id,code,symbol')->where('customer_id', $customerId)->orderByDesc('id')->get(['id', 'code', 'currency_id', 'initial_amount', 'balance', 'expires_at', 'status']));
    }
}
