<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectPortal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** The client portal (stage 9, build 9.5): a signed-in customer's own work, and only what was shared with them. */
class PortalController extends Controller
{
    public function __construct(private ProjectPortal $portal) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->portal->list($request->user()));
    }

    public function show(Request $request, int $project): JsonResponse
    {
        try {
            return response()->json($this->portal->show($request->user(), $project));
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()], $e->status);
        }
    }

    public function download(Request $request, int $project, int $file): Response
    {
        try {
            return $this->portal->download($request->user(), $project, $file);
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()], $e->status);
        }
    }
}
