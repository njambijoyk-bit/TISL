<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectFileRequests;
use App\Services\Projects\ProjectFiles;
use App\Services\Projects\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Asking for files and sign-off (stage 9, build 9.3), in the app and on an outsider's link. */
class RequestsController extends Controller
{
    public function __construct(private ProjectFileRequests $requests) {}

    public function index(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->requests->list($this->project($request, $project), $request->user())));
    }

    public function store(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->project($request, $project);
            $this->requests->ask($p, $request->all(), $request->user());

            return response()->json($this->requests->list($p, $request->user()), 201);
        });
    }

    public function answer(Request $request, int $project, int $req): JsonResponse
    {
        $request->validate(['file' => 'nullable|file|max:' . ProjectFiles::MAX_KB]);

        return $this->guard(function () use ($request, $project, $req) {
            $p = $this->project($request, $project);
            $this->requests->answerInApp($p, $req, $request->user(), $request->file('file'), $request->only(['decision', 'name', 'note']));

            return response()->json($this->requests->list($p, $request->user()));
        });
    }

    public function cancel(Request $request, int $project, int $req): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $req) {
            $p = $this->project($request, $project);
            $this->requests->cancel($p, $req, $request->user());

            return response()->json($this->requests->list($p, $request->user()));
        });
    }

    // ------------------------------------------------------------------ the outsider's link (no sign-in; the long code is the key)

    public function publicShow(string $token): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->requests->byToken($token)));
    }

    public function publicAnswer(Request $request, string $token): JsonResponse
    {
        $request->validate(['file' => 'nullable|file|max:' . ProjectFiles::MAX_KB]);

        return $this->guard(fn () => response()->json($this->requests->answerByToken($token, $request->file('file'), $request->only(['decision', 'name', 'note']))));
    }

    public function publicFile(string $token): Response
    {
        try {
            return $this->requests->fileByToken($token);
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
