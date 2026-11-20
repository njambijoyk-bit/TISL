<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectKpis;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Insights (stage 12): KPIs in Configuration (12.1); scorecards, people, forecasts come build by build. */
class InsightsController extends Controller
{
    public function __construct(private ProjectKpis $kpis) {}

    public function kpis(Request $request): JsonResponse
    {
        return response()->json($this->kpis->config($request->user()));
    }

    public function saveKpi(Request $request, ?int $kpi = null): JsonResponse
    {
        return $this->guard(function () use ($request, $kpi) {
            $this->kpis->save($kpi, $request->all(), $request->user());

            return response()->json($this->kpis->config($request->user()), $kpi ? 200 : 201);
        });
    }

    public function scorecard(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->kpis->scorecard(app(\App\Services\Projects\ProjectService::class)->findFor($request->user(), $project), $request->user())));
    }

    protected function guard(callable $do): JsonResponse
    {
        try {
            return $do();
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()] + $e->extra, $e->status);
        }
    }
}
