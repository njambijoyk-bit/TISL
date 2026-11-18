<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectFollows;
use App\Services\Projects\ProjectInbox;
use App\Services\Projects\ProjectService;
use App\Services\Projects\ProjectThreads;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Messages, meetings, working together (stage 6): conversations on a piece of work, the inbox and following. Later builds add meetings and handing over. */
class MessagesController extends Controller
{
    public function __construct(private ProjectThreads $threads) {}

    public function index(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->threads->list($this->project($request, $project), $request->user(), $request->only(['state']))));
    }

    public function show(Request $request, int $project, int $thread): JsonResponse
    {
        return $this->guard(fn () => response()->json(['thread' => $this->threads->show($this->project($request, $project), $thread, $request->user())]));
    }

    public function start(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->project($request, $project);
            $id = $this->threads->start($p, $request->all(), $request->user());

            return response()->json(['thread' => $this->threads->show($p, $id, $request->user())], 201);
        });
    }

    public function post(Request $request, int $project, int $thread): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $thread) {
            $p = $this->project($request, $project);
            $this->threads->post($p, $thread, (string) $request->input('body'), $request->user(), (array) $request->input('mentions', []));

            return response()->json(['thread' => $this->threads->show($p, $thread, $request->user())], 201);
        });
    }

    public function update(Request $request, int $project, int $thread): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $thread) {
            $p = $this->project($request, $project);
            $this->threads->update($p, $thread, $request->all(), $request->user());

            return response()->json(['thread' => $this->threads->show($p, $thread, $request->user())]);
        });
    }

    public function editMessage(Request $request, int $project, int $thread, int $message): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $thread, $message) {
            $p = $this->project($request, $project);
            $request->isMethod('delete') ? $this->threads->remove($p, $thread, $message, $request->user()) : $this->threads->edit($p, $thread, $message, (string) $request->input('body'), $request->user());

            return response()->json(['thread' => $this->threads->show($p, $thread, $request->user())]);
        });
    }

    public function makeTask(Request $request, int $project, int $thread, int $message): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $thread, $message) {
            $p = $this->project($request, $project);
            $task = $this->threads->makeTask($p, $thread, $message, $request->user());

            return response()->json(['task_id' => $task, 'thread' => $this->threads->show($p, $thread, $request->user())], 201);
        });
    }

    public function tag(Request $request, int $project, int $thread): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $thread) {
            $p = $this->project($request, $project);
            $this->threads->tag($p, $thread, (array) $request->input('tags', []), $request->user());

            return response()->json(['thread' => $this->threads->show($p, $thread, $request->user())]);
        });
    }

    public function tags(Request $request): JsonResponse
    {
        return response()->json(['tags' => $this->threads->tags(true), 'can' => ['change' => $request->user()->hasPermission('projects.config.manage')]]);
    }

    public function saveTag(Request $request, ?int $tag = null): JsonResponse
    {
        return $this->guard(function () use ($request, $tag) {
            $this->threads->saveTag($tag, $request->all(), $request->user());

            return $this->tags($request);
        });
    }

    public function inbox(Request $request): JsonResponse
    {
        return response()->json(app(ProjectInbox::class)->page($request->user(), $request->only(['state', 'unread', 'mentions', 'mine', 'tag', 'project_id', 'audience'])));
    }

    public function inboxCount(Request $request): JsonResponse
    {
        return response()->json(['unread' => app(ProjectInbox::class)->count($request->user())]);
    }

    /** Follow or stop following the work, one of its conversations or one of its tasks. */
    public function follow(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json(['following' => app(ProjectFollows::class)->set($request->user(), $this->project($request, $project),
            (string) $request->input('type'), (int) $request->input('id'), (bool) $request->input('on'))]));
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
