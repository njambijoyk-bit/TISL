<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectDaily;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectFiles;
use App\Services\Projects\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The daily record (stage 10, build 10.5): one a day per piece of work, signed to lock it. */
class DailyController extends Controller
{
    public function __construct(private ProjectDaily $daily) {}

    public function show(Request $request, int $project, string $day): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->daily->day($this->project($request, $project), $day, $request->user())));
    }

    public function save(Request $request, int $project, string $day): JsonResponse
    {
        return $this->after($request, $project, $day, fn ($p) => $this->daily->save($p, $day, $request->only(['weather', 'work_done', 'delays', 'notes']), $request->user()));
    }

    public function line(Request $request, int $project, string $day): JsonResponse
    {
        return $this->after($request, $project, $day, fn ($p) => $this->daily->addLine($p, $day, $request->all(), $request->user()), 201);
    }

    public function removeLine(Request $request, int $project, string $day, int $line): JsonResponse
    {
        return $this->after($request, $project, $day, fn ($p) => $this->daily->removeLine($p, $line, $request->user()));
    }

    public function photo(Request $request, int $project, string $day): JsonResponse
    {
        $request->validate(['photo' => 'required|file|max:' . ProjectFiles::MAX_KB]);

        return $this->after($request, $project, $day, fn ($p) => $this->daily->photo($p, $day, $request->file('photo'), $request->input('caption'), $request->user()), 201);
    }

    public function sign(Request $request, int $project, string $day): JsonResponse
    {
        return $this->after($request, $project, $day, fn ($p) => $this->daily->sign($p, $day, (string) $request->input('name'), $request->user()));
    }

    public function keeps(Request $request, int $project): JsonResponse
    {
        return $this->after($request, $project, now()->toDateString(), fn ($p) => $this->daily->keepsDaily($p, $request->boolean('keeps_daily'), $request->user()));
    }

    private function after(Request $request, int $project, string $day, callable $do, int $status = 200): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $day, $do, $status) {
            $p = $this->project($request, $project);
            $do($p);

            return response()->json($this->daily->day($p, $day, $request->user()), $status);
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
