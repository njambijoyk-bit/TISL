<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Traits\LogsProjectActivity;
use App\Http\Controllers\Api\Traits\ResolvesTaskRelations;
use App\Models\Project;
use App\Models\ProjectTask;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectTaskController extends Controller
{
    use LogsProjectActivity, ResolvesTaskRelations;

    /**
     * GET /admin/projects/{project}/tasks
     * GET /customer/projects/{project}/tasks
     */
    public function index(Request $request, Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $tasks = ProjectTask::where('project_id', $project->id)
            ->with(['assignedTo:id,name,email'])
            ->when($request->filled('status'),      fn($q) => $q->where('status',      $request->status))
            ->when($request->filled('priority'),    fn($q) => $q->where('priority',    $request->priority))
            ->when($request->filled('assigned_to'), fn($q) => $q->where('assigned_to', $request->assigned_to))
            ->orderByRaw("FIELD(priority, 'urgent','high','medium','low')")
            ->orderBy('due_date')
            ->get();

        $tasks = $this->attachRelatedSummaries($tasks);

        return response()->json(['data' => $tasks]);
    }

    /**
     * POST /admin/projects/{project}/tasks
     */
    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorize('manageWork', $project);

        $validated = $request->validate([
            'title'        => 'required|string|max:255',
            'description'  => 'nullable|string',
            'status'       => 'nullable|in:todo,doing,blocked,done',
            'priority'     => 'nullable|in:low,medium,high,urgent',
            'assigned_to'  => 'nullable|integer|exists:users,id',
            'due_date'     => 'nullable|date',
            'related_type' => 'nullable|in:project_item,quote_request,quote,order,milestone',
            'related_id'   => 'nullable|integer|min:1',
        ]);

        if (isset($validated['related_type']) xor isset($validated['related_id'])) {
            return response()->json([
                'message' => 'Both related_type and related_id must be provided together.',
            ], 422);
        }

        $validated['project_id'] = $project->id;

        $task = ProjectTask::create($validated);
        $task->load('assignedTo:id,name');

        $this->logActivity($project, 'TASK_CREATED', 'project_task', $task->id, [
            'title' => $task->title,
        ]);

        $tasks = $this->attachRelatedSummaries(collect([$task]));

        return response()->json([
            'message' => 'Task created successfully.',
            'data'    => $tasks->first(),
        ], 201);
    }

    /**
     * PUT /admin/projects/{project}/tasks/{task}
     */
    public function update(Request $request, Project $project, ProjectTask $task): JsonResponse
    {
        $this->authorize('manageWork', $project);

        if ($task->project_id !== $project->id) {
            return response()->json(['message' => 'Task does not belong to this project.'], 404);
        }

        $validated = $request->validate([
            'title'        => 'sometimes|string|max:255',
            'description'  => 'nullable|string',
            'status'       => 'sometimes|in:todo,doing,blocked,done',
            'priority'     => 'sometimes|in:low,medium,high,urgent',
            'assigned_to'  => 'nullable|integer|exists:users,id',
            'due_date'     => 'nullable|date',
            'related_type' => 'nullable|in:project_item,quote_request,quote,order,milestone',
            'related_id'   => 'nullable|integer|min:1',
        ]);

        $oldStatus = $task->status;
        $task->update($validated);

        $action = isset($validated['status']) && $validated['status'] !== $oldStatus
            ? 'TASK_STATUS_CHANGED'
            : 'TASK_UPDATED';

        $this->logActivity($project, $action, 'project_task', $task->id,
            $action === 'TASK_STATUS_CHANGED'
                ? ['from' => $oldStatus, 'to' => $validated['status']]
                : []
        );

        $fresh = $task->fresh(['assignedTo:id,name']);
        $tasks = $this->attachRelatedSummaries(collect([$fresh]));

        return response()->json([
            'message' => 'Task updated successfully.',
            'data'    => $tasks->first(),
        ]);
    }

    /**
     * DELETE /admin/projects/{project}/tasks/{task}
     */
    public function destroy(Project $project, ProjectTask $task): JsonResponse
    {
        $this->authorize('manageWork', $project);

        if ($task->project_id !== $project->id) {
            return response()->json(['message' => 'Task does not belong to this project.'], 404);
        }

        $this->logActivity($project, 'TASK_DELETED', 'project_task', $task->id, [
            'title' => $task->title,
        ]);

        $task->delete();

        return response()->json(['message' => 'Task deleted successfully.']);
    }
}