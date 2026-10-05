<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ActivityFeedService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The merged activity timeline: every log kept on the site, each shown only to the roles allowed to see it. See ActivityFeedService. */
class ActivityFeedController extends Controller
{
    public function __construct(private ActivityFeedService $svc) {}

    public function index(Request $request): JsonResponse
    {
        $f = $request->validate(['source' => 'nullable|array', 'source.*' => 'string|max:40', 'from' => 'nullable|date', 'to' => 'nullable|date', 'q' => 'nullable|string|max:80', 'page' => 'nullable|integer|min:1', 'per_page' => 'nullable|integer|min:10|max:100']);

        return response()->json($this->svc->feed($request->user(), $f));
    }
}
