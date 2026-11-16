<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectLeads;
use App\Services\Projects\ProjectPipeline;
use App\Services\Projects\ProjectsSetup;
use App\Services\Projects\ProjectWins;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The pipeline (stage 3): opportunities, their stages, and winning. */
class PipelineController extends Controller
{
    public function __construct(private ProjectPipeline $pipeline, private ProjectWins $wins, private ProjectLeads $leads) {}

    public function board(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json($this->pipeline->board($user, $request->only(['scope', 'q'])) + ['ready' => ProjectsSetup::relationships(),
            'can' => ['change' => $user->hasPermission('projects.pipeline'), 'start' => $user->hasPermission('projects.create'), 'make_client' => $user->hasPermission('projects.clients.manage')]]);
    }

    public function options(Request $request): JsonResponse
    {
        return response()->json($this->pipeline->options() + ['can' => ['books' => $request->user()->hasPermission('books.view')]]);
    }

    public function quotations(Request $request): JsonResponse
    {
        return response()->json(['vouchers' => $this->pipeline->findQuotations((string) $request->query('q', ''), $request->user())]);
    }

    public function show(Request $request, int $opportunity): JsonResponse
    {
        return $this->guard(fn () => $this->one($request, $opportunity));
    }

    public function store(Request $request): JsonResponse
    {
        return $this->guard(fn () => $this->one($request, $this->pipeline->create($request->all(), $request->user()), 201));
    }

    public function update(Request $request, int $opportunity): JsonResponse
    {
        return $this->guard(function () use ($request, $opportunity) {
            $o = $this->pipeline->find($opportunity, $request->user(), true);
            if ($request->has('stage_id')) {
                $this->pipeline->move($o, (int) $request->input('stage_id'), $request->input('lost_reason_id'), $request->user());
            } else {
                $this->pipeline->update($o, $request->all(), $request->user());
            }

            return $this->one($request, $opportunity);
        });
    }

    public function win(Request $request, int $opportunity): JsonResponse
    {
        $data = $request->validate(['start_project' => 'sometimes|boolean', 'title' => 'nullable|string|max:160', 'type_id' => 'nullable|integer']);

        return $this->guard(function () use ($request, $opportunity, $data) {
            $r = $this->wins->win($this->pipeline->find($opportunity, $request->user(), true), $data, $request->user());

            return response()->json($r + ['opportunity' => $this->pipeline->show($this->pipeline->find($opportunity, $request->user()), $request->user())]);
        });
    }

    /** Start the work of an opportunity won earlier. */
    public function start(Request $request, int $opportunity): JsonResponse
    {
        $data = $request->validate(['title' => 'nullable|string|max:160', 'type_id' => 'nullable|integer']);

        return $this->guard(function () use ($request, $opportunity, $data) {
            $id = $this->wins->startProject($this->pipeline->find($opportunity, $request->user(), true), $data, $request->user());

            return response()->json(['project_id' => $id, 'opportunity' => $this->pipeline->show($this->pipeline->find($opportunity, $request->user()), $request->user())], 201);
        });
    }

    /** Make a lead a client without an opportunity. */
    public function makeClient(Request $request, int $lead): JsonResponse
    {
        return $this->guard(function () use ($request, $lead) {
            $id = $this->wins->makeClient($this->leads->find($lead, $request->user(), true), $request->user());

            return response()->json(['customer_id' => $id, 'lead' => $this->leads->show($this->leads->find($lead, $request->user()), $request->user())]);
        });
    }

    public function of(Request $request, string $type, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $type, $id) {
            if ($type === 'lead') {
                $this->leads->find($id, $request->user());
            }

            return response()->json(['opportunities' => $this->pipeline->of($type === 'lead' ? 'lead' : 'client', $id, $request->user())]);
        });
    }

    // ------------------------------------------------------------------ the stages, in Configuration

    public function stages(Request $request): JsonResponse
    {
        return response()->json(['stages' => $this->pipeline->stages(), 'ready' => ProjectsSetup::relationships(), 'can' => ['change' => $request->user()->hasPermission('projects.config.manage')]]);
    }

    public function addStage(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $this->pipeline->addStage((string) $request->input('name', ''), $request->user());

            return $this->stages($request)->setStatusCode(201);
        });
    }

    public function changeStage(Request $request, int $stage): JsonResponse
    {
        return $this->guard(function () use ($request, $stage) {
            $this->pipeline->changeStage($stage, $request->only(['name', 'is_active', 'move']), $request->user());

            return $this->stages($request);
        });
    }

    private function one(Request $request, int $id, int $status = 200): JsonResponse
    {
        return response()->json(['opportunity' => $this->pipeline->show($this->pipeline->find($id, $request->user()), $request->user())], $status);
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
