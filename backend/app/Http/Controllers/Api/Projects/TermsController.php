<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectSerious;
use App\Services\Projects\ProjectService;
use App\Services\Projects\ProjectTerms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Advances and retention on a piece of work (stage 4, build 4.7). */
class TermsController extends Controller
{
    public function __construct(private ProjectTerms $terms) {}

    public function show(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json(['terms' => $this->terms->of($this->project($request, $project), $request->user())]));
    }

    public function save(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->project($request, $project);
            $this->terms->save($p, $request->only(['retention_percent', 'retention_ledger_id', 'advance_ledger_id']), $request->user());

            return response()->json(['terms' => $this->terms->of($p, $request->user())]);
        });
    }

    public function advance(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->project($request, $project);
            if (! $request->user()->hasPermission('projects.money.bill')) {
                throw new ProjectException('Receiving an advance needs the permission to bill.', 403);
            }
            $voucher = $this->terms->receiveAdvance($p, $request->all(), $request->user());

            return response()->json(['voucher_id' => $voucher, 'terms' => $this->terms->of($p, $request->user())], 201);
        });
    }

    public function release(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->project($request, $project);
            if (! $request->user()->hasPermission('projects.money.retention')) {
                throw new ProjectException('Releasing retention needs the permission to manage retention.', 403);
            }
            $amount = round((float) $request->input('amount', 0), 2);
            $done = app(ProjectSerious::class)->gate($request, 'retention.release', $p, ['amount' => $amount], 'release ' . number_format($amount, 2) . " of retention to the client on {$p->number}");
            $voucher = $this->terms->release($p, $amount, $request->user(), $request->input('date'));
            $done();

            return response()->json(['voucher_id' => $voucher, 'terms' => $this->terms->of($p, $request->user())], 201);
        });
    }

    private function project(Request $request, int $id): object
    {
        return app(ProjectService::class)->findFor($request->user(), $id, 'money');
    }

    private function guard(callable $do): JsonResponse
    {
        try {
            return $do();
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()] + $e->extra, $e->status);
        }
    }
}
