<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\FinancialYear;
use App\Services\Books\BooksException;
use App\Services\Books\YearCloseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Books → Configuration → Period control → Year-end close. Reading needs books.view; preparing books.close.prepare; approving, locking and reopening books.period (routes). */
class YearCloseController extends Controller
{
    public function __construct(private YearCloseService $closes) {}

    public function index(): JsonResponse
    {
        return response()->json(['ready' => YearCloseService::ready(), 'years' => $this->closes->years(), 'second_approver' => $this->closes->secondApproverRequired(), 'confirmations' => YearCloseService::CONFIRMATIONS]);
    }

    public function show($yearId): JsonResponse
    {
        $year = FinancialYear::findOrFail($yearId);
        $c = $this->closes->current($year->id);

        return response()->json(['year' => ['id' => $year->id, 'name' => $year->name, 'start_date' => $year->start_date->toDateString(), 'end_date' => $year->end_date->toDateString(), 'is_closed' => (bool) $year->is_closed],
            'checklist' => $this->closes->checklist($year), 'close' => $c ? $this->closes->years()[array_search($year->id, array_column($this->closes->years(), 'id'))]['close'] : null,
            'log' => $c ? $this->closes->log_for((int) $c->id) : [], 'second_approver' => $this->closes->secondApproverRequired(), 'confirmations' => YearCloseService::CONFIRMATIONS]);
    }

    private function run(callable $f): JsonResponse
    {
        try {
            $f();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['ok' => true]);
    }

    public function prepare(Request $request, $yearId): JsonResponse
    {
        $d = $request->validate(['confirmed' => 'array', 'confirmed.*' => 'string', 'note' => 'nullable|string|max:255']);

        return $this->run(fn () => $this->closes->prepare(FinancialYear::findOrFail($yearId), $request->user(), $d['confirmed'] ?? [], $d['note'] ?? null));
    }

    public function approve(Request $request, $closeId): JsonResponse
    {
        return $this->run(fn () => $this->closes->approve((int) $closeId, $request->user()));
    }

    public function lock(Request $request, $closeId): JsonResponse
    {
        return $this->run(fn () => $this->closes->lock((int) $closeId, $request->user()));
    }

    public function reopen(Request $request, $closeId): JsonResponse
    {
        $d = $request->validate(['reason' => 'required|string|max:255']);

        return $this->run(fn () => $this->closes->reopen((int) $closeId, $request->user(), $d['reason']));
    }
}
