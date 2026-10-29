<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\BooksException;
use App\Services\Books\ReconService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Books → Reconciliation. Preparing needs books.reconcile; approving and locking books.reconcile.approve; reopening books.period (routes). */
class ReconController extends Controller
{
    public function __construct(private ReconService $recon) {}

    private function run(callable $f): JsonResponse
    {
        try {
            return response()->json($f() ?? ['ok' => true]);
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json(['ready' => ReconService::ready(), 'ledgers' => $this->recon->ledgers(), 'sessions' => ReconService::ready() ? $this->recon->sessions($request->integer('ledger_id') ?: null) : []]);
    }

    public function start(Request $request): JsonResponse
    {
        $d = $request->validate(['ledger_id' => 'required|integer|exists:ledgers,id', 'statement_from' => 'nullable|date', 'statement_to' => 'required|date', 'statement_opening' => 'nullable|numeric', 'statement_closing' => 'required|numeric', 'note' => 'nullable|string|max:255']);

        return $this->run(fn () => ['id' => $this->recon->start($d, $request->user())]);
    }

    public function show($id): JsonResponse
    {
        return $this->run(fn () => $this->recon->view((int) $id));
    }

    public function import(Request $request, $id): JsonResponse
    {
        $d = $request->validate(['csv' => 'required|string', 'map' => 'required|array', 'replace' => 'boolean']);

        return $this->run(fn () => $this->recon->import((int) $id, $d['csv'], $d['map'], $request->user(), (bool) ($d['replace'] ?? false)));
    }

    public function autoMatch(Request $request, $id): JsonResponse
    {
        return $this->run(fn () => ['matched' => $this->recon->autoMatch((int) $id, $request->user())]);
    }

    public function match(Request $request, $id): JsonResponse
    {
        $d = $request->validate(['line_id' => 'required|integer', 'entry_id' => 'required|integer']);

        return $this->run(fn () => $this->recon->match((int) $id, (int) $d['line_id'], (int) $d['entry_id'], $request->user()));
    }

    public function unmatch(Request $request, $id): JsonResponse
    {
        $d = $request->validate(['line_id' => 'required|integer']);

        return $this->run(fn () => $this->recon->unmatch((int) $id, (int) $d['line_id'], $request->user()));
    }

    public function clearBefore(Request $request, $id): JsonResponse
    {
        $d = $request->validate(['date' => 'required|date']);

        return $this->run(fn () => ['cleared' => $this->recon->clearBefore((int) $id, $d['date'], $request->user())]);
    }

    public function bookLine(Request $request, $id): JsonResponse
    {
        $d = $request->validate(['line_id' => 'required|integer', 'ledger_id' => 'required|integer|exists:ledgers,id', 'narration' => 'nullable|string|max:255']);

        return $this->run(fn () => $this->recon->bookLine((int) $id, (int) $d['line_id'], (int) $d['ledger_id'], $d['narration'] ?? null, $request->user()));
    }

    public function prepare(Request $request, $id): JsonResponse
    {
        return $this->run(fn () => $this->recon->prepare((int) $id, $request->user()));
    }

    public function approve(Request $request, $id): JsonResponse
    {
        return $this->run(fn () => $this->recon->approve((int) $id, $request->user()));
    }

    public function lock(Request $request, $id): JsonResponse
    {
        return $this->run(fn () => $this->recon->lock((int) $id, $request->user()));
    }

    public function reopen(Request $request, $id): JsonResponse
    {
        $d = $request->validate(['reason' => 'required|string|max:255']);

        return $this->run(fn () => $this->recon->reopen((int) $id, $request->user(), $d['reason']));
    }
}
