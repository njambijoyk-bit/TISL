<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectCasebook;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectSerious;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The casebook (stage 8, build 8.5). Revealing a hidden name is a serious action. */
class CasebookController extends Controller
{
    public function __construct(private ProjectCasebook $book) {}

    public function index(Request $request): JsonResponse
    {
        $reports = $request->user()->hasPermission('projects.casebook.report');

        return $this->guard(fn () => response()->json($this->book->list($request->user(), $request->only(['state'])) + ['kinds' => $reports ? $this->book->kinds() : []] + ($reports ? $this->book->subjects($request->user()) : ['people' => [], 'clients' => []])));
    }

    public function show(Request $request, int $case, bool $logView = true): JsonResponse
    {
        return $this->guard(fn () => response()->json(['case' => $this->book->show($request->user(), $case, $logView)]));
    }

    public function store(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $id = $this->book->report($request->user(), $request->all());

            return response()->json(['case' => $this->book->show($request->user(), $id, false)], 201);
        });
    }

    public function update(Request $request, int $case): JsonResponse
    {
        return $this->guard(function () use ($request, $case) {
            $this->book->update($request->user(), $case, $request->only(['state', 'take', 'outcome']));

            return $this->show($request, $case, false);
        });
    }

    public function message(Request $request, int $case): JsonResponse
    {
        return $this->guard(function () use ($request, $case) {
            $this->book->message($request->user(), $case, (string) $request->input('body'), $request->boolean('internal'));

            return $this->show($request, $case, false);
        });
    }

    public function reveal(Request $request, int $case): JsonResponse
    {
        return $this->guard(function () use ($request, $case) {
            $this->book->show($request->user(), $case, false);   // it must be theirs to handle before anything is asked
            $done = app(ProjectSerious::class)->gate($request, 'case.reveal', null, ['case' => $case], "reveal the hidden name on a casebook report");
            $reason = trim(rawurldecode((string) $request->headers->get('X-Projects-Reason', ''))) ?: ($request->input('reason') ?: null);
            $this->book->reveal($request->user(), $case, $reason);
            $done();

            return $this->show($request, $case, false);
        });
    }

    public function flag(Request $request, int $case): JsonResponse
    {
        return $this->guard(function () use ($request, $case) {
            $this->book->flagClient($request->user(), $case, (int) $request->input('client_id'), (int) $request->input('flag_id'), (string) $request->input('reason'));

            return $this->show($request, $case, false);
        });
    }

    public function kinds(Request $request): JsonResponse
    {
        return $this->guard(fn () => response()->json(['kinds' => $this->book->kinds(true), 'routes' => ProjectCasebook::ROUTES,
            'staff' => app(\App\Services\Notify\Staff::class)->holding('projects.use')->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name])->sortBy('name')->values()->all(),
            'departments' => \Illuminate\Support\Facades\Schema::hasTable('departments') ? \Illuminate\Support\Facades\DB::table('departments')->orderBy('name')->get(['id', 'name'])->map(fn ($d) => ['id' => (int) $d->id, 'name' => $d->name])->all() : [],
            'can' => ['change' => $request->user()->hasPermission('projects.casebook.configure')]]));
    }

    public function saveKind(Request $request, ?int $kind = null): JsonResponse
    {
        return $this->guard(function () use ($request, $kind) {
            $this->book->saveKind($kind, $request->all(), $request->user());

            return $this->kinds($request);
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
