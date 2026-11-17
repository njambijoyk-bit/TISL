<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectFollowUps;
use App\Services\Projects\ProjectInteractions;
use App\Services\Projects\ProjectRelations;
use App\Services\Projects\ProjectsSetup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The history of a relationship and its next actions (stage 3, build 3.4). */
class HistoryController extends Controller
{
    public function __construct(private ProjectRelations $relations, private ProjectInteractions $history, private ProjectFollowUps $followUps) {}

    /** Everything said and planned about one lead, client, party or opportunity. */
    public function show(Request $request, string $type, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $type, $id) {
            $this->relations->authorize($type, $id, $request->user(), false);

            return $this->page($request, $type, $id);
        });
    }

    public function add(Request $request, string $type, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $type, $id) {
            $this->relations->authorize($type, $id, $request->user(), true);
            $this->history->add($type, $id, $request->all(), $request->user());

            return $this->page($request, $type, $id, 201);
        });
    }

    public function change(Request $request, int $entry): JsonResponse
    {
        return $this->guard(function () use ($request, $entry) {
            $i = $this->history->find($entry, $request->user(), true);
            $request->isMethod('DELETE') ? $this->history->remove($i, $request->user()) : $this->history->change($i, $request->all(), $request->user());

            return $this->page($request, $i->subject_type, (int) $i->subject_id);
        });
    }

    public function setNext(Request $request, string $type, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $type, $id) {
            $this->relations->authorize($type, $id, $request->user(), true);
            $this->followUps->add($type, $id, $request->all(), $request->user());

            return $this->page($request, $type, $id, 201);
        });
    }

    public function changeNext(Request $request, int $followUp): JsonResponse
    {
        return $this->guard(function () use ($request, $followUp) {
            $f = $this->followUps->find($followUp, $request->user(), true);
            $this->followUps->change($f, $request->only(['what', 'due_on', 'owner_id']), $request->user());

            return $this->page($request, $f->subject_type, (int) $f->subject_id);
        });
    }

    public function done(Request $request, int $followUp): JsonResponse
    {
        return $this->guard(function () use ($request, $followUp) {
            $f = $this->followUps->find($followUp, $request->user(), true);
            $this->followUps->done($f, $request->all(), $request->user());

            return $request->boolean('from_list') ? $this->mine($request) : $this->page($request, $f->subject_type, (int) $f->subject_id);
        });
    }

    /** My follow-ups. */
    public function mine(Request $request): JsonResponse
    {
        return response()->json($this->followUps->page($request->user(), (string) $request->query('scope', 'mine')) + ['ready' => ProjectsSetup::relationships(),
            'kinds' => ProjectInteractions::KINDS, 'owners' => $this->owners()]);
    }

    private function page(Request $request, string $type, int $id, int $status = 200): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'entries' => $this->history->of($type, $id, $user),
            'next' => $this->followUps->openFor($type, $id),
            'kinds' => ProjectInteractions::KINDS,
            'owners' => $this->owners(),
            'can' => ['write' => $user->hasPermission('projects.interactions'), 'next' => $type !== 'party'],
        ], $status);
    }

    /** @return array<int, array{id: int, name: string}> */
    private function owners(): array
    {
        return app(\App\Services\Notify\Staff::class)->holding('projects.interactions')->filter(fn ($u) => $u->hasPermission('projects.use'))->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name])->sortBy('name')->values()->all();
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
