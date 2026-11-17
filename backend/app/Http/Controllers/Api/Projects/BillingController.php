<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectBilling;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectLog;
use App\Services\Projects\ProjectSerious;
use App\Services\Projects\ProjectService;
use App\Services\Projects\ProjectSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Billing plans (stage 4, build 4.6): the plan on the Money tab, billing a stage, and the filled form Books opens for a drafted bill. */
class BillingController extends Controller
{
    public function __construct(private ProjectBilling $billing) {}

    public function show(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json(['billing' => $this->billing->plan($this->project($request, $project), $request->user())]));
    }

    public function save(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->project($request, $project);
            $this->needBill($request, $p);
            $this->billing->save($p, (array) $request->input('stages', []), $request->integer('income_ledger_id') ?: null, $request->user());

            return response()->json(['billing' => $this->billing->plan($p, $request->user())]);
        });
    }

    public function bill(Request $request, int $project, int $stage): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $stage) {
            $p = $this->project($request, $project);
            $this->needBill($request, $p);
            $done = fn () => null;
            if (app(ProjectSettings::class)->get('money')['bill_mode'] === 'post') {
                $bill = $this->billing->prepare($p, $stage);
                $done = app(ProjectSerious::class)->gate($request, 'bill.post', $p, ['stage' => $stage, 'amount' => $bill['amount']],
                    "post the bill \"{$bill['stage']}\" for " . number_format($bill['amount'], 2) . " on {$p->number}");
            } elseif (! $request->user()->hasPermission('books.post')) {
                throw new ProjectException('A drafted bill is finished and posted on the Books sales form, which needs the permission to post in Books.', 403);
            }
            $out = $this->billing->bill($p, $stage, $request->user(), $request->input('date'));
            $done();

            return response()->json($out + ['billing' => $this->billing->plan($p, $request->user())], $out['mode'] === 'post' ? 201 : 200);
        });
    }

    /** For the Books sales form opened from a drafted bill: what to fill it with. */
    public function form(Request $request, int $stage): JsonResponse
    {
        return $this->guard(function () use ($request, $stage) {
            $projectId = (int) \Illuminate\Support\Facades\DB::table('project_billing_stages')->where('id', $stage)->value('project_id');
            if (! $projectId) {
                throw new ProjectException('Not found.', 404);
            }
            $p = $this->project($request, $projectId);
            $this->needBill($request, $p);

            return response()->json(['bill' => $this->billing->prepare($p, $stage)]);
        });
    }

    private function project(Request $request, int $id): object
    {
        return app(ProjectService::class)->findFor($request->user(), $id, 'money');
    }

    private function needBill(Request $request, object $p): void
    {
        if (! $request->user()->hasPermission('projects.money.bill')) {
            ProjectLog::record((int) $p->id, $request->user(), 'billing.refused', 'project', (int) $p->id, null, null, ProjectLog::REFUSED, 'needs projects.money.bill');
            throw new ProjectException('Billing needs the permission to bill.', 403);
        }
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
