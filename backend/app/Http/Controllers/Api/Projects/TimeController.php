<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectService;
use App\Services\Projects\ProjectTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Time (stage 5, build 5.6): entries on a piece of work, and each person's timer. Weekly timesheets come with 5.7. */
class TimeController extends Controller
{
    public function __construct(private ProjectTime $time) {}

    public function index(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->time->forProject(app(ProjectService::class)->findFor($request->user(), $project), $request->user())));
    }

    public function store(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $r = $this->time->log($request->all(), $request->user());

            return response()->json($r + ['minutes' => (int) \Illuminate\Support\Facades\DB::table('project_time')->where('id', $r['id'])->value('minutes')], 201);
        });
    }

    public function update(Request $request, int $entry): JsonResponse
    {
        return $this->guard(fn () => response()->json(['warnings' => $this->time->update($entry, $request->all(), $request->user())]));
    }

    public function destroy(Request $request, int $entry): JsonResponse
    {
        return $this->guard(function () use ($request, $entry) {
            $this->time->delete($entry, $request->user(), $request->input('reason'));

            return response()->json(['message' => 'Deleted.']);
        });
    }

    public function timer(Request $request): JsonResponse
    {
        return response()->json(['timer' => $this->time->timer($request->user())]);
    }

    public function start(Request $request): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->time->start($request->all(), $request->user()), 201));
    }

    public function stop(Request $request): JsonResponse
    {
        return $this->guard(fn () => response()->json(['stopped' => $this->time->stop($request->user(), $request->input('note')), 'timer' => null]));
    }

    public function discard(Request $request): JsonResponse
    {
        $this->time->discard($request->user());

        return response()->json(['timer' => null]);
    }

    // ------------------------------------------------------------------ weekly timesheets (5.7)

    public function week(Request $request): JsonResponse
    {
        return $this->guard(fn () => response()->json(app(\App\Services\Projects\ProjectTimesheets::class)->week($request->user(), $request->query('week'), $request->integer('user_id') ?: null)));
    }

    public function submit(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $t = app(\App\Services\Projects\ProjectTimesheets::class);
            $n = $t->submit($request->user(), $request->input('week'));

            return response()->json(['submitted' => $n] + $t->week($request->user(), $request->input('week')));
        });
    }

    public function approvals(Request $request): JsonResponse
    {
        return $this->guard(fn () => response()->json(app(\App\Services\Projects\ProjectTimesheets::class)->toApprove($request->user())));
    }

    public function decide(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $t = app(\App\Services\Projects\ProjectTimesheets::class);
            $ids = array_map('intval', (array) $request->input('ids', []));
            $n = $request->input('step') === 'return' ? $t->sendBack($ids, (string) $request->input('note'), $request->user()) : $t->approve($ids, $request->user());

            return response()->json(['done' => $n] + $t->toApprove($request->user()));
        });
    }

    public function reopen(Request $request, int $entry): JsonResponse
    {
        return $this->guard(function () use ($request, $entry) {
            $pid = (int) \Illuminate\Support\Facades\DB::table('project_time')->where('id', $entry)->value('project_id');
            $p = $pid ? \Illuminate\Support\Facades\DB::table('projects')->where('id', $pid)->first() : null;
            $done = app(\App\Services\Projects\ProjectSerious::class)->gate($request, 'time.reopen', $p, ['entry' => $entry], "reopen approved time on {$p?->number}");
            app(\App\Services\Projects\ProjectTimesheets::class)->reopen($entry, (string) $request->input('reason'), $request->user());
            $done();

            return response()->json(['message' => 'Reopened.']);
        });
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
