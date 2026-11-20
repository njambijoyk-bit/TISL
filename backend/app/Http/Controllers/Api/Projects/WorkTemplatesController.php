<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectService;
use App\Services\Projects\ProjectWorkTemplates;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Work templates and the per-kind settings (stage 11, build 11.1). */
class WorkTemplatesController extends Controller
{
    public function __construct(private ProjectWorkTemplates $templates) {}

    public function forType(Request $request, int $type): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->templates->forType($type, $request->user())));
    }

    public function save(Request $request, ?int $template = null): JsonResponse
    {
        return $this->guard(function () use ($request, $template) {
            $id = $this->templates->save($template, $request->all(), $request->user());
            $type = (int) \Illuminate\Support\Facades\DB::table('project_work_templates')->where('id', $id)->value('type_id');

            return response()->json($this->templates->forType($type, $request->user()), $template ? 200 : 201);
        });
    }

    public function settings(Request $request, int $type): JsonResponse
    {
        return $this->guard(function () use ($request, $type) {
            $this->templates->saveSettings($type, $request->only(['confidential_default', 'opening_required']), $request->user());

            return response()->json($this->templates->forType($type, $request->user()));
        });
    }

    /** On a running work: the templates of its kind, and applying one (only what is missing is added). */
    public function offered(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = app(ProjectService::class)->findFor($request->user(), $project);

            return response()->json(['templates' => $this->templates->offered((int) $p->type_id)]);
        });
    }

    public function apply(Request $request, int $project, int $template): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $template) {
            $p = app(ProjectService::class)->findFor($request->user(), $project);

            return response()->json(['made' => $this->templates->apply($p, $template, $request->user())]);
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
