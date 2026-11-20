<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectFiles;
use App\Services\Projects\ProjectService;
use App\Services\Projects\ProjectSnags;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Snags (stage 10, build 10.7): raised, given, fixed, closed or opened again. */
class SnagsController extends Controller
{
    public function __construct(private ProjectSnags $snags) {}

    public function index(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->snags->page($this->project($request, $project), $request->user(), $request->query('state'))));
    }

    public function store(Request $request, int $project): JsonResponse
    {
        $request->validate(['photo' => 'nullable|file|max:' . ProjectFiles::MAX_KB]);

        return $this->after($request, $project, function ($p) use ($request) {
            $file = $request->file('photo') ? $this->snags->keepPhoto($p, $request->file('photo'), $request->user()->id, 'Snags') : null;
            $this->snags->raise($p, $request->only(['title', 'area', 'user_id', 'subcontract_id', 'due_on', 'shared']), $request->user(), null, $file);
        }, 201);
    }

    public function update(Request $request, int $project, int $snag): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->snags->update($p, $snag, $request->only(['title', 'area', 'user_id', 'subcontract_id', 'due_on', 'shared']), $request->user()));
    }

    public function fix(Request $request, int $project, int $snag): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->snags->fix($p, $snag, $request->input('note'), $request->user()));
    }

    public function close(Request $request, int $project, int $snag): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->snags->close($p, $snag, $request->user()));
    }

    public function reopen(Request $request, int $project, int $snag): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->snags->reopen($p, $snag, (string) $request->input('note'), $request->user()));
    }

    public function photo(Request $request, int $project, int $snag): JsonResponse
    {
        $request->validate(['photo' => 'required|file|max:' . ProjectFiles::MAX_KB]);

        return $this->after($request, $project, fn ($p) => $this->snags->photo($p, $snag, $request->file('photo'), $request->user()));
    }

    public function destroy(Request $request, int $project, int $snag): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->snags->remove($p, $snag, $request->user()));
    }

    private function after(Request $request, int $project, callable $do, int $status = 200): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $do, $status) {
            $p = $this->project($request, $project);
            $do($p);

            return response()->json($this->snags->page($p, $request->user(), $request->query('state')), $status);
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
