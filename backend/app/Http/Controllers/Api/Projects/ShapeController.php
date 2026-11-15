<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectSettings;
use App\Services\Projects\ProjectShape;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Configuration of the shape of the work: kinds of work and their number series, stages, and extra fields. */
class ShapeController extends Controller
{
    public function __construct(private ProjectShape $shape) {}

    public function show(Request $request): JsonResponse
    {
        $industry = (string) $request->query('industry', app(ProjectSettings::class)->defaultIndustry());
        $user = $request->user();

        return response()->json($this->shape->forIndustry($industry) + [
            'industry' => $industry, 'field_kinds' => ProjectShape::FIELD_KINDS, 'statuses' => ProjectShape::STATUS_TOKENS, 'stage_states' => ProjectShape::STAGE_STATES,
            'requirable' => array_keys(ProjectShape::REQUIRABLE),
            'can' => ['stages' => $user->hasPermission('projects.config.stages'), 'fields' => $user->hasPermission('projects.config.fields')],
        ]);
    }

    public function addType(Request $request): JsonResponse
    {
        return $this->then($request, fn () => $this->shape->addType($request->only(['industry_key', 'name', 'prefix']), $request->user()), (string) $request->input('industry_key'), 201);
    }

    public function changeType(Request $request, int $type): JsonResponse
    {
        return $this->then($request, fn () => $this->shape->changeType($type, $request->only(['name', 'prefix', 'is_active']), $request->user()));
    }

    public function addStage(Request $request, int $type): JsonResponse
    {
        return $this->then($request, fn () => $this->shape->addStage($type, $request->only(['name', 'state', 'status', 'required_fields']), $request->user()), null, 201);
    }

    public function changeStage(Request $request, int $stage): JsonResponse
    {
        return $this->then($request, fn () => $this->shape->changeStage($stage, $request->only(['name', 'state', 'status', 'required_fields', 'move']), $request->user()));
    }

    public function removeStage(Request $request, int $stage): JsonResponse
    {
        return $this->then($request, fn () => $this->shape->removeStage($stage, $request->user()));
    }

    public function addField(Request $request): JsonResponse
    {
        return $this->then($request, fn () => $this->shape->addField($request->only(['label', 'kind', 'options', 'scope', 'industry_key', 'type_id', 'required', 'sensitive']), $request->user()), null, 201);
    }

    public function changeField(Request $request, int $field): JsonResponse
    {
        return $this->then($request, fn () => $this->shape->changeField($field, $request->only(['label', 'options', 'required', 'sensitive', 'is_active']), $request->user()));
    }

    /** Do it, then answer the whole shape of the industry being looked at, so the page shows exactly what is now there. */
    private function then(Request $request, callable $do, ?string $industry = null, int $status = 200): JsonResponse
    {
        try {
            $do();
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()], $e->status);
        }
        $request->query->set('industry', $industry ?: (string) $request->input('viewing', $request->query('industry', app(ProjectSettings::class)->defaultIndustry())));

        return $this->show($request)->setStatusCode($status);
    }
}
