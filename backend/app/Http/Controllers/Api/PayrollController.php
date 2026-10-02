<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\Ledger;
use App\Models\PayrollComponent;
use App\Models\PayrollEmployeeItem;
use App\Models\PayrollRun;
use App\Models\PayrollSetting;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\LedgerService;
use App\Services\Payroll\PayrollService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Payroll (admin, super admin, finance): runs and their payslips, and the editable components, ledgers and per-person items. See PayrollService. */
class PayrollController extends Controller
{
    public function __construct(private PayrollService $svc) {}

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function index(): JsonResponse
    {
        if (! PayrollService::ready()) {
            return response()->json(['table_ready' => false, 'runs' => [], 'active_components' => 0]);
        }

        return response()->json(['table_ready' => true, 'active_components' => PayrollComponent::where('is_active', true)->count(), 'payees' => $this->svc->payees()->count(),
            'runs' => PayrollRun::orderByDesc('period_start')->orderByDesc('id')->limit(36)->get()->map(fn ($r) => ['id' => $r->id, 'number' => $r->number, 'period_start' => $r->period_start->toDateString(), 'status' => $r->status,
                'total_gross' => $r->total_gross, 'total_net' => $r->total_net, 'total_employer' => $r->total_employer])->values()]);
    }

    public function create(Request $request): JsonResponse
    {
        $d = $request->validate(['month' => ['required', 'regex:/^\d{4}-\d{2}$/'], 'notes' => 'nullable|string|max:255']);

        return $this->guard(fn () => response()->json(['id' => $this->svc->create($d['month'], $d['notes'] ?? null, $request->user())->id, 'message' => 'Payroll worked out — check it, then approve.'], 201));
    }

    public function show(int $id): JsonResponse
    {
        $run = PayrollRun::findOrFail($id);

        return response()->json($this->svc->runPayload($run) + ['active_components' => PayrollComponent::where('is_active', true)->count()]);
    }

    public function refresh(int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->svc->runPayload($this->svc->refresh(PayrollRun::findOrFail($id))) + ['message' => 'Worked out again.']));
    }

    public function adjust(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['user_id' => 'required|integer', 'adjustments' => 'present|array|max:20', 'adjustments.*.description' => 'nullable|string|max:120', 'adjustments.*.amount' => 'nullable|numeric|min:0',
            'adjustments.*.kind' => 'nullable|in:earning,deduction', 'adjustments.*.ledger_id' => 'nullable|integer|exists:ledgers,id', 'accept_unverified' => 'nullable|boolean']);

        return $this->guard(function () use ($request, $id, $d) {
            $run = PayrollRun::findOrFail($id);
            $this->svc->adjust($run, (int) $d['user_id'], $d['adjustments'], $d['accept_unverified'] ?? null, $request->user());

            return response()->json($this->svc->runPayload($run->fresh()) + ['message' => 'Saved.']);
        });
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->svc->runPayload($this->svc->approve(PayrollRun::findOrFail($id), $request->user())) + ['message' => 'Approved and posted to the books.']));
    }

    public function pay(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['from_ledger_id' => 'required|integer|exists:ledgers,id', 'date' => 'nullable|date']);

        return $this->guard(fn () => response()->json($this->svc->runPayload($this->svc->pay(PayrollRun::findOrFail($id), (int) $d['from_ledger_id'], $d['date'] ?? null, $request->user())) + ['message' => 'Marked as paid.']));
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->svc->runPayload($this->svc->cancel(PayrollRun::findOrFail($id), $request->user())) + ['message' => 'Cancelled.']));
    }

    public function csv(int $id)
    {
        $run = PayrollRun::findOrFail($id);

        return response($this->svc->csv($run), 200, ['Content-Type' => 'text/csv', 'Content-Disposition' => "attachment; filename=\"{$run->number}-bank-list.csv\""]);
    }

    // ── settings, components, items ────────────────────────────────────────

    public function settings(): JsonResponse
    {
        $ledgers = Ledger::with('group:id,name,nature')->where('is_active', true)->orderBy('name')->get();
        $svc = app(LedgerService::class);
        $s = PayrollSetting::current();

        return response()->json([
            'table_ready' => PayrollService::ready(), 'kinds' => PayrollComponent::KINDS, 'calcs' => PayrollComponent::CALCS, 'bases' => PayrollComponent::BASES,
            'settings' => $s->only(['overtime_multiplier', 'deduct_absence', 'salaries_expense_ledger_id', 'salaries_payable_ledger_id']),
            'components' => PayrollService::ready() ? PayrollComponent::orderBy('sort_order')->orderBy('id')->get() : [],
            'ledgers' => $ledgers->map(fn ($l) => ['id' => $l->id, 'name' => $l->name, 'nature' => $l->group?->nature])->values(),
            'sources' => $ledgers->filter(fn ($l) => $svc->isUnderGroup($l, 'Bank Accounts') || $svc->isUnderGroup($l, 'Cash-in-hand'))->map(fn ($l) => ['id' => $l->id, 'name' => $l->name, 'balance' => $svc->balance($l->id)])->values(),
            'staff' => $this->svc->payees()->map(fn ($u) => ['id' => $u->id, 'name' => $u->name, 'salary' => (float) $u->employee->base_salary,
                'items' => \Illuminate\Support\Facades\Schema::hasTable('payroll_employee_items') ? PayrollEmployeeItem::where('user_id', $u->id)->get(['component_id', 'amount', 'exempt', 'note']) : []])->values(),
        ]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        $d = $request->validate(['overtime_multiplier' => 'required|numeric|min:1|max:5', 'deduct_absence' => 'required|boolean', 'salaries_expense_ledger_id' => 'nullable|integer|exists:ledgers,id', 'salaries_payable_ledger_id' => 'nullable|integer|exists:ledgers,id']);
        if (! PayrollService::ready()) {
            return response()->json(['message' => 'Run script 64_payroll.sql first.'], 422);
        }
        PayrollSetting::current()->update($d + ['updated_by' => $request->user()->id]);

        return response()->json(['message' => 'Saved.']);
    }

    private function componentRules(?int $id = null): array
    {
        return ['code' => ['required', 'string', 'max:30', 'regex:/^[A-Za-z0-9_]+$/', Rule::unique('payroll_components', 'code')->ignore($id)], 'name' => 'required|string|max:80', 'kind' => 'required|in:' . implode(',', array_keys(PayrollComponent::KINDS)),
            'calc' => 'required|in:' . implode(',', array_keys(PayrollComponent::CALCS)), 'base' => 'required|in:' . implode(',', array_keys(PayrollComponent::BASES)), 'value' => 'nullable|numeric|min:0',
            'bands' => 'nullable|array|max:20', 'bands.*.upto' => 'nullable|numeric|min:0', 'bands.*.rate' => 'required_with:bands|numeric|min:0|max:100', 'base_cap' => 'nullable|numeric|min:0', 'min_amount' => 'nullable|numeric|min:0',
            'max_amount' => 'nullable|numeric|min:0', 'relief' => 'nullable|numeric|min:0', 'reduces_taxable' => 'nullable|boolean', 'applies_to' => 'required|in:all,selected', 'ledger_id' => 'nullable|integer|exists:ledgers,id',
            'expense_ledger_id' => 'nullable|integer|exists:ledgers,id', 'jurisdiction' => 'nullable|string|max:40', 'notes' => 'nullable|string|max:255', 'sort_order' => 'nullable|integer|min:0|max:9999', 'is_active' => 'nullable|boolean'];
    }

    private function clean(array $d): array
    {
        $d['value'] = (float) ($d['value'] ?? 0);
        if (($d['calc'] ?? '') === 'bands') {
            $b = array_values(array_map(fn ($x) => ['upto' => isset($x['upto']) && $x['upto'] !== '' ? (float) $x['upto'] : null, 'rate' => (float) $x['rate']], $d['bands'] ?? []));
            $last = null;
            foreach ($b as $i => $x) {
                if ($x['upto'] === null && $i !== count($b) - 1) {
                    throw new BooksException('Only the last band can have no upper limit.');
                }
                if ($x['upto'] !== null && $last !== null && $x['upto'] <= $last) {
                    throw new BooksException('Each band must end higher than the one before.');
                }
                $last = $x['upto'] ?? $last;
            }
            if (! $b) {
                throw new BooksException('Add at least one band.');
            }
            $d['bands'] = $b;
        } else {
            $d['bands'] = null;
        }
        if ($d['kind'] === 'employer' && empty($d['expense_ledger_id']) && ! empty($d['is_active'])) {
            throw new BooksException('An employer contribution needs the expense ledger it is charged to.');
        }
        if ($d['kind'] !== 'earning' && empty($d['ledger_id']) && ! empty($d['is_active'])) {
            throw new BooksException('Choose the ledger this posts to before switching it on.');
        }
        if ($d['kind'] === 'earning') {
            $d['reduces_taxable'] = false;
        }

        return $d;
    }

    public function saveComponent(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate($this->componentRules($id));

        return $this->guard(function () use ($d, $id) {
            $d = $this->clean($d);
            $c = $id ? tap(PayrollComponent::findOrFail($id))->update($d) : PayrollComponent::create($d);

            return response()->json(['id' => $c->id, 'message' => 'Saved.'], $id ? 200 : 201);
        });
    }

    public function deleteComponent(int $id): JsonResponse
    {
        if (PayrollRun::exists()) {
            return response()->json(['message' => 'Payroll has been run — switch this off instead of deleting it, so past payslips keep their meaning.'], 422);
        }
        PayrollComponent::findOrFail($id)->delete();
        PayrollEmployeeItem::where('component_id', $id)->delete();

        return response()->json(['message' => 'Deleted.']);
    }

    /** Replace one person's items: [{component_id, amount|null, exempt, note}]. */
    public function saveItems(Request $request, int $userId): JsonResponse
    {
        $d = $request->validate(['items' => 'present|array|max:50', 'items.*.component_id' => 'required|integer|exists:payroll_components,id', 'items.*.amount' => 'nullable|numeric|min:0', 'items.*.exempt' => 'nullable|boolean', 'items.*.note' => 'nullable|string|max:160']);
        User::findOrFail($userId);
        PayrollEmployeeItem::where('user_id', $userId)->delete();
        foreach (collect($d['items'])->unique('component_id') as $i) {
            PayrollEmployeeItem::create(['user_id' => $userId, 'component_id' => $i['component_id'], 'amount' => ($i['amount'] ?? '') === '' ? null : $i['amount'], 'exempt' => (bool) ($i['exempt'] ?? false), 'note' => $i['note'] ?? null]);
        }

        return response()->json(['message' => 'Saved.']);
    }
}
