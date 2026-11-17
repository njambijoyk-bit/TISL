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

    /** Take retention and advances off a billed stage's invoice, when that could not be done as it was billed. */
    public function deduct(Request $request, int $project, int $stage): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $stage) {
            $p = $this->project($request, $project);
            $this->needBill($request, $p);
            $taken = $this->billing->deduct($p, $stage, $request->user());

            return response()->json(['taken' => $taken, 'billing' => $this->billing->plan($p, $request->user())]);
        });
    }

    // ------------------------------------------------------------------ time and costs (5.8, 5.9)

    public function unbilled(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json(app(\App\Services\Projects\ProjectTimeBilling::class)->unbilled($this->project($request, $project), $request->user(), $request->query('up_to'))));
    }

    public function billTime(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->project($request, $project);
            $t = app(\App\Services\Projects\ProjectTimeBilling::class);
            $done = fn () => null;
            if (app(ProjectSettings::class)->get('money')['bill_mode'] === 'post') {
                $done = app(ProjectSerious::class)->gate($request, 'bill.post', $p, ['time_to' => (string) $request->input('up_to'), 'ids' => $request->input('ids')], "post a bill for time on {$p->number}");
            }
            $out = $t->bill($p, $request->user(), $request->input('up_to'), $request->has('ids') ? (array) $request->input('ids') : null);
            $done();

            return response()->json($out + ['unbilled' => $t->unbilled($p, $request->user())], $out['mode'] === 'post' ? 201 : 200);
        });
    }

    public function dropTimeBill(Request $request, int $project, int $stage): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $stage) {
            $p = $this->project($request, $project);
            $t = app(\App\Services\Projects\ProjectTimeBilling::class);
            $t->drop($p, $stage, $request->user());

            return response()->json($t->unbilled($p, $request->user()));
        });
    }

    public function writeOffTime(Request $request, int $entry): JsonResponse
    {
        return $this->guard(function () use ($request, $entry) {
            $pid = (int) \Illuminate\Support\Facades\DB::table('project_time')->where('id', $entry)->value('project_id') ?: throw new ProjectException('Not found.', 404);
            $p = $this->project($request, $pid);
            $minutes = (int) $request->input('minutes', 0);
            $done = $minutes > 0 ? app(ProjectSerious::class)->gate($request, 'time.writeoff', $p, ['entry' => $entry, 'minutes' => $minutes], "write off {$minutes} minutes of time on {$p->number}") : fn () => null;
            app(\App\Services\Projects\ProjectTimeBilling::class)->writeOff($entry, $minutes, (string) $request->input('reason'), $request->user());
            $done();

            return response()->json(app(\App\Services\Projects\ProjectTimeBilling::class)->unbilled($p, $request->user()));
        });
    }

    public function rates(Request $request, ?int $project = null): JsonResponse
    {
        return $this->guard(fn () => response()->json(app(\App\Services\Projects\ProjectRates::class)->card($request->user(), $project ? $this->project($request, $project) : null)));
    }

    public function saveRate(Request $request, ?int $project = null): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $project ? $this->project($request, $project) : null;
            $r = app(\App\Services\Projects\ProjectRates::class);
            $r->save($p, $request->all(), $request->user());

            return response()->json($r->card($request->user(), $p), 201);
        });
    }

    public function deleteRate(Request $request, int $rate, ?int $project = null): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $rate) {
            $p = $project ? $this->project($request, $project) : null;
            $r = app(\App\Services\Projects\ProjectRates::class);
            $r->delete($p, $rate, $request->user());

            return response()->json($r->card($request->user(), $p));
        });
    }

    public function deleteProjectRate(Request $request, int $project, int $rate): JsonResponse
    {
        return $this->deleteRate($request, $rate, $project);
    }

    public function disbursements(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json(app(\App\Services\Projects\ProjectDisbursements::class)->list($this->project($request, $project), $request->user())));
    }

    public function markDisbursement(Request $request, int $project, int $entry): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $entry) {
            $p = $this->project($request, $project);
            $d = app(\App\Services\Projects\ProjectDisbursements::class);
            if ($request->has('write_off')) {
                $done = app(ProjectSerious::class)->gate($request, 'time.writeoff', $p, ['cost' => $entry], "write off a cost on {$p->number}");
                $d->writeOff($p, $entry, (string) $request->input('reason'), $request->user());
                $done();
            } else {
                $d->mark($p, $entry, $request->boolean('on'), $request->user());
            }

            return response()->json($d->list($p, $request->user()));
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
            $time = \Illuminate\Support\Facades\DB::table('project_billing_stages')->where('id', $stage)->value('kind') === 'time';

            return response()->json(['bill' => $time ? app(\App\Services\Projects\ProjectTimeBilling::class)->form($p, $stage) : $this->billing->prepare($p, $stage)]);
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
