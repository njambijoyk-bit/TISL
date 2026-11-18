<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectService;
use App\Services\Projects\ProjectThreads;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Messages, meetings, working together (stage 6): conversations on a piece of work. Later builds add the inbox, meetings and handing over. */
class MessagesController extends Controller
{
    public function __construct(private ProjectThreads $threads) {}

    public function index(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->threads->list($this->project($request, $project), $request->user(), $request->only(['state']))));
    }

    public function show(Request $request, int $project, int $thread): JsonResponse
    {
        return $this->guard(fn () => response()->json(['thread' => $this->threads->show($this->project($request, $project), $thread, $request->user())]));
    }

    public function start(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->project($request, $project);
            $id = $this->threads->start($p, $request->all(), $request->user());

            return response()->json(['thread' => $this->threads->show($p, $id, $request->user())], 201);
        });
    }

    public function post(Request $request, int $project, int $thread): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $thread) {
            $p = $this->project($request, $project);
            $this->threads->post($p, $thread, (string) $request->input('body'), $request->user());

            return response()->json(['thread' => $this->threads->show($p, $thread, $request->user())], 201);
        });
    }

    public function update(Request $request, int $project, int $thread): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $thread) {
            $p = $this->project($request, $project);
            $this->threads->update($p, $thread, $request->all(), $request->user());

            return response()->json(['thread' => $this->threads->show($p, $thread, $request->user())]);
        });
    }

    private function project(Request $request, int $id): object
    {
        return app(ProjectService::class)->findFor($request->user(), $id);
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
