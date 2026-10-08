<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\Ledger;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\PettyCashService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The petty cash screen: the boxes and what they hold, spending with a receipt, top-ups to the float, and each box's float and custodian. */
class PettyCashController extends Controller
{
    public function __construct(private PettyCashService $svc) {}

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function index(Request $request): JsonResponse
    {
        $u = $request->user();
        $boxes = collect($this->svc->overview())->map(fn ($b) => $b + ['can_spend' => $this->svc->canSpend($u, $b['ledger_id'])])->values();
        // a custodian sees only the box they look after; finance and admins see all
        if (! PettyCashService::isManager($u)) {
            $boxes = $boxes->filter(fn ($b) => $b['can_spend'])->values();
        }
        $ids = $boxes->pluck('ledger_id')->all();
        $history = collect($this->svc->history())->filter(fn ($h) => in_array($h['ledger_id'], $ids, true))->values();

        return response()->json(['table_ready' => PettyCashService::ready(), 'is_manager' => PettyCashService::isManager($u), 'boxes' => $boxes, 'history' => $history]);
    }

    /** What the screen's pickers need: expense accounts, the accounts a top-up can come from, and staff who can be custodian. */
    public function options(): JsonResponse
    {
        $ledgers = Ledger::with('group:id,name,nature')->where('is_active', true)->orderBy('name')->get();
        $svc = app(\App\Services\Books\LedgerService::class);

        return response()->json([
            'expense' => $ledgers->filter(fn ($l) => $l->group?->nature === 'expense')->map(fn ($l) => ['id' => $l->id, 'name' => $l->name])->values(),
            'sources' => $ledgers->filter(fn ($l) => $l->cash_kind !== 'petty' && ($svc->isUnderGroup($l, 'Bank Accounts') || $svc->isUnderGroup($l, 'Cash-in-hand')))->map(fn ($l) => ['id' => $l->id, 'name' => $l->name, 'balance' => $svc->balance($l->id)])->values(),
            'staff' => User::whereHas('employee')->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function spend(Request $request): JsonResponse
    {
        $d = $request->validate(['ledger_id' => 'required|integer|exists:ledgers,id', 'expense_ledger_id' => 'required|integer|exists:ledgers,id', 'amount' => 'required|numeric|min:0.01', 'payee' => 'required|string|max:120',
            'purpose' => 'required|string|max:255', 'spent_on' => 'nullable|date', 'receipt' => 'nullable|image|max:6144']);
        if ($request->hasFile('receipt')) {
            $d['receipt_path'] = $request->file('receipt')->store('petty-receipts', 'public');
        }

        return $this->guard(function () use ($request, $d) {
            $s = $this->svc->spend($d, $request->user());

            return response()->json(['id' => $s->id, 'number' => $s->number, 'message' => "{$s->number} recorded."], 201);
        });
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $s = $this->svc->cancelSpend($id, $request->user());

            return response()->json(['message' => "{$s->number} cancelled — the money is back in the box."]);
        });
    }

    public function topUp(Request $request): JsonResponse
    {
        abort_unless(PettyCashService::isManager($request->user()), 403, 'You do not have the permission to top up petty cash.');
        $d = $request->validate(['ledger_id' => 'required|integer|exists:ledgers,id', 'from_ledger_id' => 'required|integer|exists:ledgers,id', 'amount' => 'nullable|numeric|min:0.01', 'date' => 'nullable|date']);

        return $this->guard(function () use ($request, $d) {
            $v = $this->svc->topUp((int) $d['ledger_id'], (int) $d['from_ledger_id'], isset($d['amount']) ? (float) $d['amount'] : null, $d['date'] ?? null, $request->user());

            return response()->json(['message' => "Topped up — {$v->voucher_number}.", 'voucher_id' => $v->id], 201);
        });
    }

    public function setFloat(Request $request): JsonResponse
    {
        abort_unless(PettyCashService::isManager($request->user()), 403, 'You do not have the permission to set the float.');
        $d = $request->validate(['ledger_id' => 'required|integer|exists:ledgers,id', 'float_amount' => 'required|numeric|min:0', 'custodian_user_id' => 'nullable|integer|exists:users,id']);

        return $this->guard(function () use ($request, $d) {
            $this->svc->setFloat((int) $d['ledger_id'], (float) $d['float_amount'], $d['custodian_user_id'] ?? null, $request->user());

            return response()->json(['message' => 'Saved.']);
        });
    }
}
