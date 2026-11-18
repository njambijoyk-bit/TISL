<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectHandover;
use App\Services\Projects\ProjectSerious;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Handing someone's work over (stage 6, build 6.8). Handing over someone else's work is a serious action. */
class HandoverController extends Controller
{
    public function __construct(private ProjectHandover $handover) {}

    public function people(Request $request): JsonResponse
    {
        return response()->json(['people' => $this->handover->people($request->user())]);
    }

    public function preview(Request $request): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->handover->preview($request->user(), (int) $request->query('from'), (int) $request->query('to'), $request->filled('project_id') ? (int) $request->query('project_id') : null)));
    }

    public function apply(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $by = $request->user();
            $from = (int) $request->input('from');
            $to = (int) $request->input('to');
            $projectId = $request->filled('project_id') ? (int) $request->input('project_id') : null;
            $only = $request->has('items') ? (array) $request->input('items') : null;
            $done = fn () => null;
            if ($from !== (int) $by->id) {
                $plan = $this->handover->preview($by, $from, $to, $projectId);
                $project = $projectId ? \Illuminate\Support\Facades\DB::table('projects')->where('id', $projectId)->first() : null;
                $items = $only === null ? 'all' : collect($only)->map(fn ($i) => ($i['kind'] ?? '') . ':' . (int) ($i['id'] ?? 0))->sort()->values()->all();
                $done = app(ProjectSerious::class)->gate($request, 'work.handover', $project, ['from' => $from, 'to' => $to, 'project' => $projectId, 'items' => $items],
                    "hand {$plan['from']['name']}'s work" . ($project ? " on {$project->number}" : '') . " to {$plan['to']['name']}");
            }
            $out = $this->handover->apply($by, $from, $to, $projectId, $only);
            $done();

            return response()->json($out + ['message' => "Handed over: {$out['moved']} " . ($out['moved'] === 1 ? 'item' : 'items') . '.']);
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
