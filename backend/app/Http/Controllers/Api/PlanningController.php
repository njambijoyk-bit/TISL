<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\BudgetService;
use App\Services\Books\ForecastService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Books -> Configuration -> Planning: budgets and the cash forecast's recurring items. Seeing them needs books.view; changing them needs books.planning (routes).
 * The forecast's assumptions (collection delay, supplier terms ...) are Reports settings, section "Cash forecast assumptions".
 */
class PlanningController extends Controller
{
    public function __construct(private BudgetService $budgets, private ForecastService $forecast) {}

    public function show(Request $request): JsonResponse
    {
        $in = $request->validate(['from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d|after_or_equal:from']);
        $from = $in['from'] ?? now()->startOfYear()->toDateString();
        $to = $in['to'] ?? now()->endOfYear()->toDateString();

        return response()->json([
            'budgets_ready' => BudgetService::ready(), 'forecast_ready' => ForecastService::ready(), 'from' => $from, 'to' => $to, 'months' => BudgetService::months($from, $to),
            'choices' => $this->budgets->choices(), 'lines' => $this->budgets->lines($from, $to), 'items' => $this->forecast->items(),
            'kinds' => ForecastService::KINDS, 'frequencies' => ForecastService::FREQUENCIES, 'certainty' => ForecastService::CERTAINTY,
        ]);
    }

    public function saveBudgets(Request $request): JsonResponse
    {
        $rows = $request->validate(['rows' => 'required|array|max:300', 'rows.*.type' => 'required|string', 'rows.*.id' => 'required|integer', 'rows.*.months' => 'nullable|array'])['rows'];
        $this->budgets->save($rows, $request->user());

        return response()->json(['ok' => true]);
    }

    public function removeBudget(Request $request, string $type, int $id): JsonResponse
    {
        $in = $request->validate(['from' => 'required|date_format:Y-m-d', 'to' => 'required|date_format:Y-m-d|after_or_equal:from']);

        return response()->json(['removed' => $this->budgets->remove($type, $id, $in['from'], $in['to'])]);
    }

    public function saveItem(Request $request, ?int $id = null): JsonResponse
    {
        return response()->json(['id' => $this->forecast->saveItem($request->all(), $request->user(), $id)]);
    }

    public function deleteItem(int $id): JsonResponse
    {
        $this->forecast->deleteItem($id);

        return response()->json(['ok' => true]);
    }
}
