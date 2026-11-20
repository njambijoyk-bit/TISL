<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectDateRules;
use App\Services\Projects\ProjectException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Date rules in Configuration (stage 11, build 11.3). */
class DateRulesController extends Controller
{
    public function __construct(private ProjectDateRules $rules) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->rules->config((string) $request->query('industry', ''), $request->user()));
    }

    public function save(Request $request, ?int $rule = null): JsonResponse
    {
        try {
            $this->rules->save($rule, $request->all(), $request->user());
            $industry = $rule ? (string) \Illuminate\Support\Facades\DB::table('project_date_rules')->where('id', $rule)->value('industry_key') : (string) $request->input('industry');

            return response()->json($this->rules->config($industry, $request->user()), $rule ? 200 : 201);
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()] + $e->extra, $e->status);
        }
    }
}
