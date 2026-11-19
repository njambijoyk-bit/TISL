<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectFiles;
use App\Services\Projects\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** The files of a piece of work (stage 9). The bytes live in the Core vault; Projects decides who sees them on the work. */
class FilesController extends Controller
{
    public function __construct(private ProjectFiles $files) {}

    public function index(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->files->page($this->project($request, $project), $request->user(), $request->boolean('removed'))));
    }

    public function upload(Request $request, int $project): JsonResponse
    {
        $request->validate(['file' => 'required|file|max:' . ProjectFiles::MAX_KB, 'folder_id' => 'nullable|integer']);

        return $this->guard(function () use ($request, $project) {
            $p = $this->project($request, $project);
            $this->files->upload($p, $request->file('file'), $request->input('folder_id') ? (int) $request->input('folder_id') : null, $request->user());

            return response()->json($this->files->page($p, $request->user()), 201);
        });
    }

    public function version(Request $request, int $project, int $file): JsonResponse
    {
        $request->validate(['file' => 'required|file|max:' . ProjectFiles::MAX_KB, 'note' => 'nullable|string|max:250']);

        return $this->guard(function () use ($request, $project, $file) {
            $p = $this->project($request, $project);
            $this->files->newVersion($p, $file, $request->file('file'), $request->input('note'), $request->user());

            return response()->json($this->files->page($p, $request->user()), 201);
        });
    }

    public function versions(Request $request, int $project, int $file): JsonResponse
    {
        return $this->guard(fn () => response()->json(['versions' => $this->files->versions($this->project($request, $project), $file, $request->user())]));
    }

    public function download(Request $request, int $project, int $file): Response
    {
        try {
            return $this->files->download($this->project($request, $project), $file, $request->user(), $request->filled('version') ? (int) $request->query('version') : null, $request->boolean('inline'));
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()], $e->status);
        }
    }

    public function change(Request $request, int $project, int $file): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $file) {
            $p = $this->project($request, $project);
            $request->has('shared') ? $this->files->share($p, $file, $request->boolean('shared'), $request->user()) : $this->files->change($p, $file, $request->only(['name', 'folder_id', 'expires_on']), $request->user());

            return response()->json($this->files->page($p, $request->user()));
        });
    }

    public function remove(Request $request, int $project, int $file): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $file) {
            $p = $this->project($request, $project);
            $this->files->remove($p, $file, $request->user());

            return response()->json($this->files->page($p, $request->user()));
        });
    }

    public function restore(Request $request, int $project, int $file): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $file) {
            $p = $this->project($request, $project);
            $this->files->restore($p, $file, $request->user());

            return response()->json($this->files->page($p, $request->user()));
        });
    }

    public function folder(Request $request, int $project, ?int $folder = null): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $folder) {
            $p = $this->project($request, $project);
            match (true) {
                $request->isMethod('delete') => $this->files->removeFolder($p, (int) $folder, $request->user()),
                $folder !== null => $this->files->renameFolder($p, $folder, (string) $request->input('name'), $request->user()),
                default => $this->files->addFolder($p, (string) $request->input('name'), $request->input('parent_id') ? (int) $request->input('parent_id') : null, $request->user()),
            };

            return response()->json($this->files->page($p, $request->user()));
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
