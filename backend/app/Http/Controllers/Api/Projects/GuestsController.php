<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectAccess;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectGuestLinks;
use App\Services\Projects\ProjectSerious;
use App\Services\Projects\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Guest links (stage 9, build 9.6): given on the Files tab, opened by the guest with no sign-in. */
class GuestsController extends Controller
{
    public function __construct(private ProjectGuestLinks $guests) {}

    public function index(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->guests->list($this->project($request, $project), $request->user())));
    }

    public function store(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->project($request, $project);
            app(ProjectAccess::class)->authorize($request->user(), 'guests', $p);   // allowed first, then the serious action is asked
            $d = $request->only(['name', 'email', 'ends_on']);
            $done = app(ProjectSerious::class)->gate($request, 'guest.link', $p, $d, 'give a guest link to ' . trim((string) ($d['name'] ?? '')) . " on {$p->number}");
            $this->guests->give($p, $d, $request->user());
            $done();

            return response()->json($this->guests->list($p, $request->user()), 201);
        });
    }

    public function end(Request $request, int $project, int $link): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $link) {
            $p = $this->project($request, $project);
            $this->guests->end($p, $link, $request->user());

            return response()->json($this->guests->list($p, $request->user()));
        });
    }

    public function visits(Request $request, int $project, int $link): JsonResponse
    {
        return $this->guard(fn () => response()->json(['visits' => $this->guests->visits($this->project($request, $project), $link, $request->user())]));
    }

    // ------------------------------------------------------------------ the guest's page

    public function publicShow(string $token): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->guests->page($token)));
    }

    public function publicFile(string $token, int $file): Response
    {
        try {
            return $this->guests->file($token, $file);
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()], $e->status);
        }
    }

    private function project(Request $request, int $id): object
    {
        return app(ProjectService::class)->findFor($request->user(), $id);
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
