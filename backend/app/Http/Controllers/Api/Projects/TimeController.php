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

    private function guard(callable $do): JsonResponse
    {
        try {
            return $do();
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()] + $e->extra, $e->status);
        }
    }
}
