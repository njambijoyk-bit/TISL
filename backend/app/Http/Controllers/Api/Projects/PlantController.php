<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectPlant;
use App\Services\Projects\ProjectService;
use App\Services\Projects\ProjectVendors;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Plant on a piece of work (stage 10, build 10.2): owned equipment through Inventory, bookings ahead, hired plant. */
class PlantController extends Controller
{
    public function __construct(private ProjectPlant $plant) {}

    public function index(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->plant->page($this->project($request, $project), $request->user())));
    }

    public function book(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->project($request, $project);
            $made = $this->plant->book($p, $request->all(), $request->user());

            return response()->json($this->plant->page($p, $request->user()) + ['clashes' => $made['clashes']], 201);
        });
    }

    public function cancelBooking(Request $request, int $project, int $booking): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->plant->cancelBooking($p, $booking, $request->user()));
    }

    public function issue(Request $request, int $project): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->plant->issue($p, $request->all(), $request->user()));
    }

    public function giveBack(Request $request, int $project, int $assignment): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->plant->giveBack($p, $assignment, $request->input('condition'), $request->input('note'), $request->user()));
    }

    public function hire(Request $request, int $project): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->plant->hire($p, $request->all(), $request->user()), 201);
    }

    public function offHire(Request $request, int $project, int $hire): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->plant->offHire($p, $hire, $request->input('on'), $request->boolean('cancel'), $request->user()));
    }

    public function find(Request $request): JsonResponse
    {
        return response()->json(['items' => $this->plant->find((string) $request->query('q', ''))]);
    }

    public function vendors(Request $request): JsonResponse
    {
        return response()->json(['vendors' => app(ProjectVendors::class)->find((string) $request->query('q', ''))]);
    }

    private function after(Request $request, int $project, callable $do, int $status = 200): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $do, $status) {
            $p = $this->project($request, $project);
            $do($p);

            return response()->json($this->plant->page(app(ProjectService::class)->find($p->id), $request->user()), $status);
        });
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
