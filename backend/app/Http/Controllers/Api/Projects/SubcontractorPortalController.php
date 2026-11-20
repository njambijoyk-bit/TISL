<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectFiles;
use App\Services\Projects\ProjectsSetup;
use App\Services\Projects\ProjectSubcontracts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The subcontractor's view (stage 10, build 10.4): a vendor signed in to their portal sees their subcontracts on every piece of work, what was
 * claimed and certified and the bills, and makes a claim with a file. Only their own; nothing else about the work.
 */
class SubcontractorPortalController extends Controller
{
    public function __construct(private ProjectSubcontracts $subs) {}

    public function index(Request $request): JsonResponse
    {
        return $this->guard(fn () => response()->json(['ready' => ProjectsSetup::site(), 'subcontracts' => $this->subs->forVendor($this->vendor($request))]));
    }

    public function claim(Request $request, int $sub): JsonResponse
    {
        $request->validate(['file' => 'nullable|file|max:' . ProjectFiles::MAX_KB]);

        return $this->guard(function () use ($request, $sub) {
            $vendor = $this->vendor($request);
            $s = DB::table('project_subcontracts')->where('id', $sub)->where('vendor_id', $vendor)->whereNull('deleted_at')->first() ?? throw new ProjectException('Not found.', 404);
            $project = DB::table('projects')->where('id', $s->project_id)->whereNull('deleted_at')->first() ?? throw new ProjectException('Not found.', 404);
            $fileId = $request->file('file') && ProjectsSetup::documents() ? app(ProjectFiles::class)->receive($project, $request->file('file'), null, $request->user()->id, 'claim') : null;
            $this->subs->claim($project, $sub, $request->only(['claimed_pct', 'period_to', 'note']), $request->user(), true, $fileId);

            return response()->json(['ready' => true, 'subcontracts' => $this->subs->forVendor($vendor)], 201);
        });
    }

    private function vendor(Request $request): int
    {
        $v = DB::table('vendors')->where('user_id', $request->user()->id)->whereNull('deleted_at')->first(['id', 'status']);
        if (! $v) {
            throw new ProjectException('This page is for subcontractors signed in to their vendor account.', 403);
        }
        if (($v->status ?? null) === 'suspended') {
            throw new ProjectException('Your vendor account is suspended. Please contact us.', 403);
        }

        return (int) $v->id;
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
