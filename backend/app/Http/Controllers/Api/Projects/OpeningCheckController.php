<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectOpeningCheck;
use App\Services\Projects\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The opening check (stage 11, build 11.2): on a work, and its questions in Configuration. */
class OpeningCheckController extends Controller
{
    public function __construct(private ProjectOpeningCheck $check) {}

    public function show(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->check->page($this->project($request, $project), $request->user())));
    }

    public function answer(Request $request, int $project): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->check->answer($p, (array) $request->input('answers', []), $request->user()));
    }

    public function sign(Request $request, int $project): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->check->sign($p, (string) $request->input('name'), $request->user()));
    }

    public function redo(Request $request, int $project): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->check->redo($p, (string) $request->input('reason'), $request->user()));
    }

    public function config(Request $request): JsonResponse
    {
        return response()->json($this->check->config((string) $request->query('industry', ''), $request->user()));
    }

    public function saveQuestion(Request $request, ?int $question = null): JsonResponse
    {
        return $this->guard(function () use ($request, $question) {
            $this->check->saveQuestion($question, $request->only(['industry', 'type_id', 'question', 'must_be_yes', 'is_active']), $request->user());

            return response()->json($this->check->config((string) $request->input('industry', ''), $request->user()), $question ? 200 : 201);
        });
    }

    private function after(Request $request, int $project, callable $do): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $do) {
            $p = $this->project($request, $project);
            $do($p);

            return response()->json($this->check->page($p, $request->user()));
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
