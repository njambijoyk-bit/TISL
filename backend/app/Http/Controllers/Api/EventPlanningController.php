<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\GuardsEventErrors;
use App\Http\Controllers\Api\Concerns\ScopesEvents;
use App\Http\Controllers\Controller;
use App\Models\Events\Event;
use App\Services\Events\EventPlanning;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The planning workspace of one event (tasks, milestones, programme, budget, team, templates). Reading needs events.view, changing events.edit; an outside organiser reaches only their own events. */
class EventPlanningController extends Controller
{
    use GuardsEventErrors;
    use ScopesEvents;

    public function __construct(private EventPlanning $plan)
    {
    }

    private function event(int $id): Event
    {
        abort_unless(EventPlanning::ready(), 409, 'Run script 255 to turn on event planning.');

        return $this->scopedEvent($id);
    }

    private function budgetEvent(int $id): Event
    {
        $e = $this->event($id);
        abort_unless($this->plan->canSeeBudget($e, request()->user()), 403, 'The budget is not shared with you on this event.');

        return $e;
    }

    public function overview(int $id): JsonResponse
    {
        return response()->json($this->plan->overview($this->event($id), request()->user()));
    }

    // tasks
    public function tasks(int $id): JsonResponse
    {
        return response()->json(['data' => $this->plan->tasks($this->event($id)), 'statuses' => EventPlanning::TASK_STATUS]);
    }

    private function taskBody(Request $r): array
    {
        return $r->validate(['title' => 'sometimes|string|max:200', 'notes' => 'nullable|string|max:5000', 'department' => 'nullable|string|max:60', 'assignee_id' => 'nullable|integer|exists:users,id', 'priority' => 'nullable|string|max:8',
            'status' => 'nullable|string|max:12', 'starts_on' => 'nullable|date', 'due_on' => 'nullable|date', 'effort_hours' => 'nullable|numeric|min:0|max:9999', 'evidence' => 'nullable|string|max:300', 'client_visible' => 'nullable|boolean',
            'parent_id' => 'nullable|integer', 'depends_on_id' => 'nullable|integer', 'sort_order' => 'nullable|integer']);
    }

    public function saveTask(Request $request, int $id, ?int $taskId = null): JsonResponse
    {
        $e = $this->event($id);

        return response()->json(['data' => $this->plan->saveTask($e, $this->taskBody($request), $taskId, $request->user())], $taskId ? 200 : 201);
    }

    public function deleteTask(int $id, int $taskId): JsonResponse
    {
        $this->plan->deleteTask($this->event($id), $taskId);

        return response()->json(['message' => 'Removed.']);
    }

    public function comments(int $id, int $taskId): JsonResponse
    {
        return response()->json(['data' => $this->plan->comments($this->event($id), $taskId)]);
    }

    public function addComment(Request $request, int $id, int $taskId): JsonResponse
    {
        $d = $request->validate(['body' => 'required|string|max:1000']);

        return response()->json(['data' => $this->plan->addComment($this->event($id), $taskId, $d['body'], $request->user())], 201);
    }

    // milestones
    public function milestones(int $id): JsonResponse
    {
        return response()->json(['data' => $this->plan->milestones($this->event($id))]);
    }

    public function saveMilestone(Request $request, int $id, ?int $mid = null): JsonResponse
    {
        $d = $request->validate(['title' => 'sometimes|string|max:160', 'due_on' => 'nullable|date', 'client_visible' => 'nullable|boolean', 'done' => 'nullable|boolean', 'sort_order' => 'nullable|integer']);

        return response()->json(['data' => $this->plan->saveMilestone($this->event($id), $d, $mid)], $mid ? 200 : 201);
    }

    public function deleteMilestone(int $id, int $mid): JsonResponse
    {
        $this->plan->deleteMilestone($this->event($id), $mid);

        return response()->json(['message' => 'Removed.']);
    }

    // programme
    public function programme(int $id): JsonResponse
    {
        return response()->json(['data' => $this->plan->programme($this->event($id))]);
    }

    public function saveProgramme(Request $request, int $id, ?int $pid = null): JsonResponse
    {
        $d = $request->validate(['day_on' => 'nullable|date', 'starts_at' => 'nullable|string|max:5', 'ends_at' => 'nullable|string|max:5', 'title' => 'sometimes|string|max:200', 'location' => 'nullable|string|max:160',
            'responsible' => 'nullable|string|max:160', 'equipment' => 'nullable|string|max:300', 'notes' => 'nullable|string|max:500', 'sort_order' => 'nullable|integer']);

        return response()->json(['data' => $this->plan->saveProgramme($this->event($id), $d, $pid)], $pid ? 200 : 201);
    }

    public function deleteProgramme(int $id, int $pid): JsonResponse
    {
        $this->plan->deleteProgramme($this->event($id), $pid);

        return response()->json(['message' => 'Removed.']);
    }

    // budget (hidden from people who were not given it)
    public function budget(int $id): JsonResponse
    {
        return response()->json($this->plan->budget($this->budgetEvent($id)));
    }

    public function saveBudgetLine(Request $request, int $id, ?int $lid = null): JsonResponse
    {
        $d = $request->validate(['category' => 'sometimes|string|max:80', 'item' => 'sometimes|string|max:200', 'supplier' => 'nullable|string|max:160', 'estimated' => 'nullable|numeric|min:0', 'approved' => 'nullable|numeric|min:0',
            'committed' => 'nullable|numeric|min:0', 'actual' => 'nullable|numeric|min:0', 'notes' => 'nullable|string|max:300']);

        return response()->json(['data' => $this->plan->saveBudgetLine($this->budgetEvent($id), $d, $lid)], $lid ? 200 : 201);
    }

    public function deleteBudgetLine(int $id, int $lid): JsonResponse
    {
        $this->plan->deleteBudgetLine($this->budgetEvent($id), $lid);

        return response()->json(['message' => 'Removed.']);
    }

    // team
    public function team(int $id): JsonResponse
    {
        return response()->json(['data' => $this->plan->team($this->event($id))]);
    }

    public function saveTeam(Request $request, int $id, ?int $tid = null): JsonResponse
    {
        $d = $request->validate(['name' => 'sometimes|string|max:160', 'role' => 'sometimes|string|max:80', 'phone' => 'nullable|string|max:40', 'email' => 'nullable|email', 'sees_budget' => 'nullable|boolean']);

        return response()->json(['data' => $this->plan->saveTeam($this->event($id), $d, $tid)], $tid ? 200 : 201);
    }

    public function deleteTeam(int $id, int $tid): JsonResponse
    {
        $this->plan->deleteTeam($this->event($id), $tid);

        return response()->json(['message' => 'Removed.']);
    }

    // templates
    public function templates(): JsonResponse
    {
        return response()->json(['data' => $this->plan->templates()]);
    }

    public function applyTemplate(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['template_id' => 'required|integer', 'event_date' => 'nullable|date']);

        return response()->json(['made' => $this->plan->applyTemplate($this->event($id), (int) $d['template_id'], $d['event_date'] ?? null, $request->user()), 'message' => 'The checklist, budget lines and running order were added.']);
    }

    // templates (events.admin)
    public function adminTemplates(): JsonResponse
    {
        return response()->json(['data' => $this->plan->templates(true)]);
    }

    public function saveTemplate(Request $request, ?int $tid = null): JsonResponse
    {
        $d = $request->validate(['name' => 'required|string|max:120', 'description' => 'nullable|string|max:300', 'category_id' => 'nullable|integer', 'body' => 'nullable|array', 'is_active' => 'nullable|boolean']);

        return response()->json(['data' => $this->plan->saveTemplate($d, $tid)], $tid ? 200 : 201);
    }

    public function deleteTemplate(int $tid): JsonResponse
    {
        $this->plan->deleteTemplate($tid);

        return response()->json(['message' => 'Deleted.']);
    }

    public function standardTemplates(): JsonResponse
    {
        return response()->json(['made' => $this->plan->addStandardTemplates(), 'data' => $this->plan->templates(true)]);
    }
}
