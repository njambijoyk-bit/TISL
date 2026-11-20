<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectMaterials;
use App\Services\Projects\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Materials on a piece of work (stage 10, build 10.1): planned, asked for, issued and returned through Stock jobs. */
class MaterialsController extends Controller
{
    public function __construct(private ProjectMaterials $materials) {}

    public function index(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->materials->page($this->project($request, $project), $request->user())));
    }

    public function plan(Request $request, int $project): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->materials->plan($p, (int) $request->input('variant_id'), (float) $request->input('quantity'), $request->input('note'), $request->user()));
    }

    public function ask(Request $request, int $project): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->materials->ask($p, $request->all(), $request->user()), 201);
    }

    public function close(Request $request, int $project, int $req): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->materials->cancel($p, $req, $request->user()));
    }

    public function issue(Request $request, int $project): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->materials->issue($p, (int) $request->input('location_id'), (array) $request->input('items', []), $request->input('request_id') ? (int) $request->input('request_id') : null, $request->user()));
    }

    public function giveBack(Request $request, int $project, int $line): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->materials->giveBack($p, $line, $request->filled('quantity') ? (float) $request->input('quantity') : null, $request->user()));
    }

    public function find(Request $request): JsonResponse
    {
        return response()->json(['products' => $this->materials->find((string) $request->query('q', ''))]);
    }

    public function waiting(Request $request): JsonResponse
    {
        return response()->json(['requests' => $this->materials->waiting($request->user())]);
    }

    private function after(Request $request, int $project, callable $do, int $status = 200): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $do, $status) {
            $p = $this->project($request, $project);
            $do($p);

            return response()->json($this->materials->page(app(ProjectService::class)->find($p->id), $request->user()), $status);
        });
    }

    private function project(Request $request, int $id): object
    {
        // whoever keeps the store may issue to work they are not on (checked inside), so the work is found without asking for a place on it
        $p = app(ProjectService::class)->find($id);
        if (! $this->materials->mayIssue($request->user(), $p)) {
            app(\App\Services\Projects\ProjectAccess::class)->authorize($request->user(), 'open', $p);
        }

        return $p;
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
