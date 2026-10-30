<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\BudgetService;
use App\Services\Books\ForecastService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Books -> Configuration -> Budgeting: budgets and the cash forecast's recurring items. Seeing them needs books.view; changing them needs books.planning (routes).
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
        $rows = $request->validate([
            'rows' => 'required|array|max:300', 'rows.*.type' => 'required|string', 'rows.*.target_id' => 'required|integer', 'rows.*.row_id' => 'nullable|integer', 'rows.*.months' => 'nullable|array',
            'rows.*.cost_centre_id' => 'nullable|integer', 'rows.*.department_id' => 'nullable|integer', 'rows.*.location_id' => 'nullable|integer', 'rows.*.initiative_id' => 'nullable|integer',
            'rows.*.is_recovery' => 'nullable|boolean', 'rows.*.method' => 'nullable|string|max:20', 'rows.*.method_params' => 'nullable|array', 'rows.*.note' => 'nullable|string|max:160',
        ])['rows'];

        return response()->json(['ok' => true, 'ids' => $this->budgets->save($rows, $request->user())]);
    }

    public function removeBudget(int $id): JsonResponse
    {
        return response()->json(['removed' => $this->budgets->remove($id)]);
    }

    /** Last year's actual figures for an account and dimensions, month by month, to start "last year plus growth" from. */
    public function history(Request $request): JsonResponse
    {
        $in = $request->validate(['type' => 'required|in:group,ledger', 'target_id' => 'required|integer', 'year' => 'required|integer|min:2000|max:2100', 'cost_centre_id' => 'nullable|integer', 'department_id' => 'nullable|integer', 'location_id' => 'nullable|integer']);

        return response()->json(['months' => $this->budgets->history($in, (int) $in['year'])]);
    }

    public function saveInitiative(Request $request, ?int $id = null): JsonResponse
    {
        return response()->json(['id' => $this->budgets->saveInitiative($request->all(), $request->user(), $id)]);
    }

    public function removeInitiative(int $id): JsonResponse
    {
        return response()->json(['result' => $this->budgets->removeInitiative($id)]);
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
