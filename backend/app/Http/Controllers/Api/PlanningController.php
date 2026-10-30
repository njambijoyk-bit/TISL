<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\BudgetControl;
use App\Services\Books\BudgetService;
use App\Services\Books\BudgetTemplateService;
use App\Services\Books\BudgetTransferService;
use App\Services\Books\ForecastService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Books -> Budgets and Configuration -> Budget settings: budgets, and the cash forecast's recurring items. Seeing them needs books.view; changing them needs books.planning (routes).
 * The forecast's assumptions (collection delay, supplier terms ...) are Reports settings, section "Cash forecast assumptions".
 */
class PlanningController extends Controller
{
    public function __construct(private BudgetService $budgets, private ForecastService $forecast, private BudgetTemplateService $templates, private BudgetControl $control, private BudgetTransferService $transfers) {}

    public function show(Request $request): JsonResponse
    {
        $in = $request->validate(['from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d|after_or_equal:from', 'version_id' => 'nullable|integer']);
        $from = $in['from'] ?? now()->startOfYear()->toDateString();
        $to = $in['to'] ?? now()->endOfYear()->toDateString();

        $version = BudgetService::ready() ? $this->budgets->resolveVersion($in['version_id'] ?? null) : null;

        return response()->json([
            'version_id' => $version, 'budgets' => $this->budgets->budgets(), 'approvals' => $version ? $this->budgets->approvalLog($version) : [], 'budget_types' => BudgetService::TYPES, 'transfers' => $version ? $this->transfers->forVersion($version) : [], 'transfers_ready' => BudgetTransferService::ready(), 'controls' => ['ready' => BudgetControl::ready(), 'rules' => $this->control->rules(), 'overrides' => $this->control->overrides(), 'settings' => $this->control->settings(), 'modes' => BudgetControl::MODES],
            'templates' => $this->templates->templates(), 'templates_ready' => BudgetTemplateService::ready(), 'assumptions_ready' => BudgetTemplateService::hasAssumptions(),
            'budgets_ready' => BudgetService::ready(), 'forecast_ready' => ForecastService::ready(), 'from' => $from, 'to' => $to, 'months' => BudgetService::months($from, $to),
            'choices' => $this->budgets->choices(), 'lines' => $this->budgets->lines($from, $to, $version), 'items' => $this->forecast->items(),
            'kinds' => ForecastService::KINDS, 'frequencies' => ForecastService::FREQUENCIES, 'certainty' => ForecastService::CERTAINTY,
        ]);
    }

    public function saveBudgets(Request $request): JsonResponse
    {
        $rows = $request->validate([
            'rows' => 'required|array|max:300', 'rows.*.type' => 'required|string', 'rows.*.target_id' => 'required|integer', 'rows.*.row_id' => 'nullable|integer', 'rows.*.months' => 'nullable|array',
            'rows.*.cost_centre_id' => 'nullable|integer', 'rows.*.department_id' => 'nullable|integer', 'rows.*.location_id' => 'nullable|integer', 'rows.*.initiative_id' => 'nullable|integer',
            'version_id' => 'nullable|integer', 'rows.*.is_recovery' => 'nullable|boolean', 'rows.*.method' => 'nullable|string|max:20', 'rows.*.method_params' => 'nullable|array', 'rows.*.note' => 'nullable|string|max:160',
        ]);

        return response()->json(['ok' => true, 'ids' => $this->budgets->save($rows['rows'], $request->user(), $rows['version_id'] ?? null)]);
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

    public function requestTransfer(Request $request): JsonResponse
    {
        return response()->json(['id' => $this->transfers->request($request->all(), $request->user())]);
    }

    public function withdrawTransfer(Request $request, int $id): JsonResponse
    {
        $this->transfers->withdraw($id, $request->user());

        return response()->json(['ok' => true]);
    }

    /** Accept or turn down a waiting transfer (needs books.budget.approve: the route). */
    public function decideTransfer(Request $request, int $id, string $action): JsonResponse
    {
        $in = $request->validate(['note' => 'nullable|string|max:255']);

        return response()->json(['status' => $this->transfers->decide($id, $action, $request->user(), $in['note'] ?? null)]);
    }

    public function compare(int $id): JsonResponse
    {
        return response()->json(['versions' => $this->budgets->compareVersions($id)]);
    }

    /** The initiatives a voucher can be posted to (the entry form's list): in use, nested. Seeing them needs books.view. */
    public function initiativeOptions(): JsonResponse
    {
        return response()->json(['ready' => \App\Observers\VoucherDimensionsObserver::initiativesReady(), 'data' => array_values(array_filter($this->budgets->initiatives(), fn ($i) => $i['is_active']))]);
    }

    public function saveRule(Request $request): JsonResponse
    {
        return response()->json(['id' => $this->control->saveRule($request->all(), $request->user())]);
    }

    public function removeRule(int $id): JsonResponse
    {
        $this->control->removeRule($id);

        return response()->json(['ok' => true]);
    }

    /** Accept or turn down an overspend that is waiting (needs books.budget.approve: the route). */
    public function decideOverride(Request $request, int $id, string $action): JsonResponse
    {
        $in = $request->validate(['note' => 'nullable|string|max:255']);

        return response()->json(['status' => $this->control->decide($id, $action, $request->user(), $in['note'] ?? null)]);
    }

    public function createBudget(Request $request): JsonResponse
    {
        $b = $this->budgets->createBudget($request->all(), $request->user());

        return response()->json(['id' => $b, 'version_id' => $this->budgets->currentVersion($b)]);
    }

    public function template(int $id): JsonResponse
    {
        return response()->json(['lines' => $this->templates->lines($id)]);
    }

    public function saveTemplate(Request $request): JsonResponse
    {
        $in = $request->validate(['version_id' => 'required|integer', 'name' => 'required|string|max:120', 'description' => 'nullable|string|max:255']);

        return response()->json(['id' => $this->templates->saveFromVersion((int) $in['version_id'], $in, $request->user())]);
    }

    public function updateTemplate(Request $request, int $id): JsonResponse
    {
        $this->templates->update($id, $request->validate(['name' => 'required|string|max:120', 'description' => 'nullable|string|max:255']));

        return response()->json(['ok' => true]);
    }

    public function saveTemplateAssumptions(Request $request, int $id): JsonResponse
    {
        $in = $request->validate(['assumptions' => 'nullable|array', 'assumptions.*.label' => 'required|string|max:60', 'assumptions.*.value' => 'required|numeric']);

        return response()->json(['assumptions' => $this->templates->saveAssumptions($id, $in['assumptions'] ?? [])]);
    }

    public function setTemplateLineAssumption(Request $request, int $id, int $line): JsonResponse
    {
        $this->templates->setLineAssumption($id, $line, $request->validate(['key' => 'nullable|string|max:80'])['key'] ?? null);

        return response()->json(['ok' => true]);
    }

    public function deleteTemplate(int $id): JsonResponse
    {
        $this->templates->delete($id);

        return response()->json(['ok' => true]);
    }

    public function deleteTemplateLine(int $id, int $line): JsonResponse
    {
        $this->templates->removeLine($id, $line);

        return response()->json(['ok' => true]);
    }

    public function budgetFromTemplate(Request $request, int $id): JsonResponse
    {
        $in = $request->validate(['name' => 'required|string|max:120', 'from_month' => 'required|string', 'to_month' => 'required|string', 'assumptions' => 'nullable|array', 'assumptions.*' => 'numeric']);
        $b = $this->templates->createBudget($id, $in, $request->user());

        return response()->json(['id' => $b, 'version_id' => $this->budgets->currentVersion($b)]);
    }

    public function createVersion(Request $request, int $id): JsonResponse
    {
        return response()->json(['version_id' => $this->budgets->createVersion($id, $request->all(), $request->user())]);
    }

    /** Submit a version (needs books.planning) or approve, send back, lock or reopen it (needs books.budget.approve): the route decides which. */
    public function transition(Request $request, int $id, string $action): JsonResponse
    {
        $in = $request->validate(['note' => 'nullable|string|max:255']);

        return response()->json(['status' => $this->budgets->transition($id, $action, $request->user(), $in['note'] ?? null)]);
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
