<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AssetDepreciation;
use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Books\Voucher;
use App\Models\Currency;
use App\Models\Inventory\InventoryCategory;
use App\Services\Books\BooksException;
use App\Services\Inventory\AssetAccountingService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Depreciation, the asset register and the ledgers a category posts to — see AssetAccountingService. */
class AssetAccountingController extends Controller
{
    public function __construct(private AssetAccountingService $svc) {}

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /** What the forms choose from: currencies, methods, ledgers, and whether script 71 has been run. */
    public function options(): JsonResponse
    {
        $ledgers = Ledger::with('group:id,name,nature')->where('is_active', true)->get();
        $pick = fn ($f) => $ledgers->filter($f)->map(fn ($l) => ['id' => $l->id, 'name' => $l->name, 'group' => $l->group?->name])->values();

        return response()->json(['ready' => AssetAccountingService::ready(),
            'methods' => collect(AssetAccountingService::METHODS)->map(fn ($label, $key) => ['key' => $key, 'label' => $label])->values(),
            'currencies' => Currency::where('is_active', true)->orderByDesc('is_base')->get(['id', 'code', 'name', 'is_base', 'conversion_rate']),
            'asset_ledgers' => $pick(fn ($l) => $l->group?->name === 'Fixed Assets'),
            'expense_ledgers' => $pick(fn ($l) => $l->group?->nature === 'expense'),
            'pay_from' => $pick(fn ($l) => in_array($l->group?->name, ['Cash-in-hand', 'Bank Accounts'], true))]);
    }

    public function setupCategoryLedgers(int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json(['data' => $this->svc->setupLedgers(InventoryCategory::findOrFail($id))]));
    }

    public function preview(Request $request): JsonResponse
    {
        $request->validate(['up_to' => 'required|date', 'category_id' => 'nullable|integer']);

        return $this->guard(fn () => response()->json(['data' => $this->svc->preview(Carbon::parse($request->up_to)->endOfMonth(), $request->category_id ? (int) $request->category_id : null)]));
    }

    public function post(Request $request): JsonResponse
    {
        $request->validate(['up_to' => 'required|date', 'category_id' => 'nullable|integer']);

        return $this->guard(function () use ($request) {
            $made = $this->svc->post(Carbon::parse($request->up_to)->endOfMonth(), $request->user(), $request->category_id ? (int) $request->category_id : null);

            return response()->json(['message' => count($made) . ' depreciation journal(s) posted.', 'data' => collect($made)->map(fn ($v) => ['id' => $v->id, 'voucher_number' => $v->voucher_number])->values()]);
        });
    }

    public function undo(Request $request, int $voucherId): JsonResponse
    {
        return $this->guard(function () use ($request, $voucherId) {
            $this->svc->undo($voucherId, $request->user());

            return response()->json(['message' => 'Depreciation undone.']);
        });
    }

    /** The Journals depreciation has posted, newest first. */
    public function history(): JsonResponse
    {
        $rows = AssetDepreciation::selectRaw('voucher_id, MIN(period_end) as period_end, SUM(amount) as amount, COUNT(*) as assets, MIN(currency_id) as currency_id')->whereNotNull('voucher_id')
            ->groupBy('voucher_id')->orderByDesc('period_end')->limit(120)->get();
        $v = Voucher::whereIn('id', $rows->pluck('voucher_id'))->get(['id', 'voucher_number', 'narration', 'status'])->keyBy('id');
        $cur = Currency::pluck('code', 'id');

        return response()->json(['data' => $rows->map(fn ($r) => ['voucher_id' => $r->voucher_id, 'voucher_number' => $v[$r->voucher_id]->voucher_number ?? null, 'narration' => $v[$r->voucher_id]->narration ?? null,
            'status' => $v[$r->voucher_id]->status ?? null, 'period_end' => Carbon::parse($r->period_end)->toDateString(), 'amount' => (float) $r->amount, 'assets' => (int) $r->assets, 'currency' => $cur[$r->currency_id] ?? null])->values()]);
    }

    /** Register against the ledgers, per category. */
    public function reconcile(): JsonResponse
    {
        return response()->json(['data' => $this->svc->reconcile()]);
    }

    public function register(): JsonResponse
    {
        return response()->json(['data' => $this->svc->register()]);
    }

    /** One asset's book value and the months depreciated so far. */
    public function show(int $instanceId): JsonResponse
    {
        $a = \App\Models\Inventory\InventoryInstance::with('item:id,name,category_id')->findOrFail($instanceId);
        $months = AssetDepreciation::where('instance_id', $a->id)->orderBy('period_end')->get(['period_end', 'amount', 'voucher_id']);

        return response()->json(['data' => ['cost' => $this->svc->cost($a), 'floor' => (float) $a->floor_value, 'accumulated' => $this->svc->accumulated($a), 'book_value' => $this->svc->bookValue($a),
            'currency' => Currency::find($a->currency_id)?->code ?? Currency::where('is_base', true)->value('code'), 'method' => $a->depreciation_method, 'months' => $months]]);
    }
}
