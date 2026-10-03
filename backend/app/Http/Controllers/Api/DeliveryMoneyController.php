<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Traits\LogsDeliveryActivity;
use App\Models\Books\Ledger;
use App\Models\Books\PaymentMethod;
use App\Models\DeliveryCost;
use App\Models\DeliveryItem;
use App\Models\DeliveryManifest;
use App\Services\Books\BooksException;
use App\Services\Delivery\DeliveryMoneyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Cash collected at the door (a Receipt) and what a trip cost (a Payment) — see DeliveryMoneyService. */
class DeliveryMoneyController extends Controller
{
    use LogsDeliveryActivity;

    public function __construct(private DeliveryMoneyService $money) {}

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /** The manifest's money, and what the forms need to choose from. */
    public function show(int $id): JsonResponse
    {
        $m = DeliveryManifest::with(['items' => fn ($q) => $q->orderBy('sort_order')])->findOrFail($id);
        $stops = $m->items->map(fn ($i) => [
            'id' => $i->id, 'status' => $i->status, 'collected' => $i->cod_amount !== null ? (float) $i->cod_amount : null, 'collected_voucher_id' => $i->cod_voucher_id,
            'owed' => collect($this->money->openInvoices($i))->sum('owed'),
        ]);

        $ledgers = Ledger::with('group:id,name,nature')->where('is_active', true)->get();
        $payFrom = $ledgers->filter(fn ($l) => in_array($l->group?->name, ['Cash-in-hand', 'Bank Accounts'], true))->map(fn ($l) => ['id' => $l->id, 'name' => $l->name, 'group' => $l->group->name])->values();
        $expense = $ledgers->filter(fn ($l) => $l->group?->nature === 'expense')->map(fn ($l) => ['id' => $l->id, 'name' => $l->name])->values();

        return response()->json(['data' => $this->money->summary($m) + [
            'stops' => $stops,
            'categories' => collect(DeliveryCost::CATEGORIES)->map(fn ($label, $key) => ['key' => $key, 'label' => $label])->values(),
            'payment_methods' => PaymentMethod::where('is_active', true)->orderBy('sort_order')->get(['id', 'name', 'kind']),
            'pay_from' => $payFrom, 'expense_ledgers' => $expense,
        ]]);
    }

    public function collect(Request $request, int $id, int $itemId): JsonResponse
    {
        return $this->guard(function () use ($request, $id, $itemId) {
            $stop = DeliveryItem::where('manifest_id', $id)->findOrFail($itemId);
            $stop = $this->money->collect($stop, $request->only(['amount', 'payment_method_id', 'reference_no', 'date']), $request->user());
            $this->logDeliveryItemActivity($stop->id, 'money_collected', 'info', ['amount' => (float) $stop->cod_amount, 'voucher_id' => $stop->cod_voucher_id, 'by' => $request->user()?->name]);

            return response()->json(['message' => 'Collection recorded.', 'data' => $stop]);
        });
    }

    public function cancelCollection(Request $request, int $id, int $itemId): JsonResponse
    {
        return $this->guard(function () use ($request, $id, $itemId) {
            $stop = $this->money->cancelCollection(DeliveryItem::where('manifest_id', $id)->findOrFail($itemId), $request->user());
            $this->logDeliveryItemActivity($stop->id, 'money_collection_cancelled', 'warning', ['by' => $request->user()?->name]);

            return response()->json(['message' => 'Collection cancelled.', 'data' => $stop]);
        });
    }

    public function addCost(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $c = $this->money->recordCost(DeliveryManifest::findOrFail($id), $request->only(['category', 'amount', 'paid_ledger_id', 'expense_ledger_id', 'payee', 'notes', 'paid_on']), $request->user());
            $this->logManifestActivity($id, 'cost_recorded', 'info', ['amount' => (float) $c->amount, 'category' => $c->category, 'voucher_id' => $c->voucher_id, 'by' => $request->user()?->name]);

            return response()->json(['message' => 'Cost recorded.', 'data' => $c], 201);
        });
    }

    public function cancelCost(Request $request, int $id, int $costId): JsonResponse
    {
        return $this->guard(function () use ($request, $id, $costId) {
            $c = $this->money->cancelCost(DeliveryCost::where('manifest_id', $id)->findOrFail($costId), $request->user());
            $this->logManifestActivity($id, 'cost_cancelled', 'warning', ['amount' => (float) $c->amount, 'by' => $request->user()?->name]);

            return response()->json(['message' => 'Cost cancelled.', 'data' => $c]);
        });
    }
}
