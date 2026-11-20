<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectFiles;
use App\Services\Projects\ProjectInspections;
use App\Services\Projects\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Inspections (stage 10, build 10.6): kinds in Configuration, inspections on a work, failed answers raising snags. */
class InspectionsController extends Controller
{
    public function __construct(private ProjectInspections $inspections) {}

    public function kinds(Request $request): JsonResponse
    {
        return response()->json($this->inspections->kinds($request->user()));
    }

    public function saveKind(Request $request, ?int $kind = null): JsonResponse
    {
        return $this->guard(function () use ($request, $kind) {
            $this->inspections->saveKind($kind, $request->only(['name', 'questions', 'is_active']), $request->user());

            return response()->json($this->inspections->kinds($request->user()), $kind ? 200 : 201);
        });
    }

    public function index(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->inspections->page($this->project($request, $project), $request->user())));
    }

    public function start(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->project($request, $project);
            $id = $this->inspections->start($p, (int) $request->input('kind_id'), $request->input('area'), $request->input('done_on'), $request->user());

            return response()->json($this->inspections->show($p, $id, $request->user()), 201);
        });
    }

    public function show(Request $request, int $project, int $inspection): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->inspections->show($this->project($request, $project), $inspection, $request->user())));
    }

    public function answer(Request $request, int $project, int $inspection, int $no): JsonResponse
    {
        return $this->after($request, $project, $inspection, fn ($p) => $this->inspections->answer($p, $inspection, $no, $request->input('answer'), $request->input('note'), $request->user()));
    }

    public function photo(Request $request, int $project, int $inspection, int $no): JsonResponse
    {
        $request->validate(['photo' => 'required|file|max:' . ProjectFiles::MAX_KB]);

        return $this->after($request, $project, $inspection, fn ($p) => $this->inspections->photo($p, $inspection, $no, $request->file('photo'), $request->user()));
    }

    public function finish(Request $request, int $project, int $inspection): JsonResponse
    {
        return $this->after($request, $project, $inspection, fn ($p) => $this->inspections->finish($p, $inspection, (string) $request->input('name'), $request->user()));
    }

    private function after(Request $request, int $project, int $inspection, callable $do): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $inspection, $do) {
            $p = $this->project($request, $project);
            $do($p);

            return response()->json($this->inspections->show($p, $inspection, $request->user()));
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
