<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectMeetings;
use App\Services\Projects\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** Meetings on a piece of work (stage 6, builds 6.6 and 6.7), and the answer link an outside person uses without signing in. */
class MeetingsController extends Controller
{
    public function __construct(private ProjectMeetings $meetings) {}

    public function index(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->meetings->list($this->project($request, $project), $request->user())));
    }

    public function show(Request $request, int $project, int $meeting): JsonResponse
    {
        return $this->guard(fn () => response()->json(['meeting' => $this->meetings->show($this->project($request, $project), $meeting, $request->user())]));
    }

    public function store(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->project($request, $project);
            $id = $this->meetings->create($p, $request->all(), $request->user());

            return response()->json(['meeting' => $this->meetings->show($p, $id, $request->user())], 201);
        });
    }

    public function update(Request $request, int $project, int $meeting): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $meeting) {
            $p = $this->project($request, $project);
            $this->meetings->update($p, $meeting, $request->all(), $request->user());

            return response()->json(['meeting' => $this->meetings->show($p, $meeting, $request->user())]);
        });
    }

    public function cancel(Request $request, int $project, int $meeting): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $meeting) {
            $p = $this->project($request, $project);
            $this->meetings->cancel($p, $meeting, $request->input('reason'), $request->user());

            return response()->json(['meeting' => $this->meetings->show($p, $meeting, $request->user())]);
        });
    }

    public function answer(Request $request, int $project, int $meeting): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $meeting) {
            $p = $this->project($request, $project);
            $this->meetings->answer($p, $meeting, (string) $request->input('answer'), $request->user());

            return response()->json(['meeting' => $this->meetings->show($p, $meeting, $request->user())]);
        });
    }

    public function freeTime(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->meetings->freeTime($this->project($request, $project), (array) $request->input('people', []), (int) $request->input('minutes', 60), $request->user(),
            $request->filled('except') ? (int) $request->input('except') : null)));
    }

    // ------------------------------------------------------------------ the answer link (no sign-in; the token in the link is the key)

    public function publicShow(string $token): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->meetings->byToken($token)));
    }

    public function publicAnswer(Request $request, string $token): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->meetings->answerByToken($token, (string) $request->input('answer'))));
    }

    public function publicIcs(string $token): Response|JsonResponse
    {
        try {
            return response($this->meetings->icsByToken($token), 200, ['Content-Type' => 'text/calendar; charset=utf-8', 'Content-Disposition' => 'attachment; filename="meeting.ics"']);
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()], $e->status);
        }
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
