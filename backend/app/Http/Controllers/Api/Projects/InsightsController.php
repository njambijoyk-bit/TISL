<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectKpis;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Insights (stage 12): KPIs (12.1), scorecards (12.2), people (12.3), forecasts (12.4) and rules (12.5). */
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

    public function person(Request $request, int $user): JsonResponse
    {
        return $this->guard(fn () => response()->json(app(\App\Services\Projects\ProjectPeopleInsights::class)->scorecard($request->user(), $user)));
    }

    public function capacity(Request $request): JsonResponse
    {
        return response()->json(app(\App\Services\Projects\ProjectPeopleInsights::class)->capacity($request->user()));
    }

    public function forecasts(Request $request): JsonResponse
    {
        $f = app(\App\Services\Projects\ProjectForecasts::class);

        return response()->json(['pipeline' => $f->pipeline($request->user()), 'finish' => $f->finish($request->user()), 'billing' => $f->billing($request->user())]);
    }

    public function odds(Request $request, int $stage): JsonResponse
    {
        return $this->guard(function () use ($request, $stage) {
            app(\App\Services\Projects\ProjectForecasts::class)->setOdds($stage, $request->input('chance') === null || $request->input('chance') === '' ? null : (float) $request->input('chance'), $request->user());

            return response()->json(['pipeline' => app(\App\Services\Projects\ProjectForecasts::class)->pipeline($request->user())]);
        });
    }

    public function rules(Request $request): JsonResponse
    {
        return response()->json(app(\App\Services\Projects\ProjectRules::class)->config($request->user()));
    }

    public function saveRule(Request $request, ?int $rule = null): JsonResponse
    {
        return $this->guard(function () use ($request, $rule) {
            $r = app(\App\Services\Projects\ProjectRules::class);
            $r->save($rule, $request->all(), $request->user());

            return response()->json($r->config($request->user()), $rule ? 200 : 201);
        });
    }

    public function tryRule(Request $request, int $rule): JsonResponse
    {
        return $this->guard(fn () => response()->json(app(\App\Services\Projects\ProjectRules::class)->trial($rule, $request->user())));
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
