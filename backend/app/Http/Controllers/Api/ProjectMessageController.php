<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Traits\LogsProjectActivity;
use App\Models\Project;
use App\Models\ProjectMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectMessageController extends Controller
{
    use LogsProjectActivity;

    // ─────────────────────────────────────────────────────────────
    // READ
    // ─────────────────────────────────────────────────────────────

    /**
     * GET /admin/projects/{project}/messages
     * GET /customer/projects/{project}/messages
     */
    public function index(Request $request, Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $query = ProjectMessage::where('project_id', $project->id)
            ->with(['sender:id,name,email,role'])
            ->orderBy('created_at', 'asc');

        if (!$this->isStaff()) {
            $query->where('visibility', 'customer');
        } else {
            if ($request->filled('visibility')) {
                $query->where('visibility', $request->visibility);
            }
        }

        return response()->json(['data' => $query->get()]);
    }

    // ─────────────────────────────────────────────────────────────
    // CREATE — ADMIN
    // ─────────────────────────────────────────────────────────────

    /**
     * POST /admin/projects/{project}/messages
     */
    public function storeAdminMessage(Request $request, Project $project): JsonResponse
    {
        $this->authorize('comment', $project);

        $validated = $request->validate([
            'message'    => 'nullable|string',
            'visibility' => 'nullable|in:customer,admin,internal',
            'files'      => 'nullable|array',
            'files.*'    => 'file|max:10240',
            'url'        => 'nullable|string',
        ]);

        $attachments = $this->processAttachments($request, $validated);

        $message = ProjectMessage::create([
            'project_id'     => $project->id,
            'visibility'     => $validated['visibility'] ?? 'customer',
            'sender_user_id' => auth()->id(),
            'message'        => $validated['message'] ?? '',
            'attachments'    => !empty($attachments) ? $attachments : null,
        ]);

        $this->logActivity($project, 'MESSAGE_POSTED', 'project_message', $message->id, [
            'visibility' => $message->visibility,
        ]);

        return response()->json([
            'message' => 'Message sent successfully.',
            'data'    => $message->load('sender:id,name,role'),
        ], 201);
    }

    // ─────────────────────────────────────────────────────────────
    // CREATE — CUSTOMER
    // ─────────────────────────────────────────────────────────────

    /**
     * POST /customer/projects/{project}/messages
     */
    public function storeCustomerMessage(Request $request, Project $project): JsonResponse
    {
        $this->authorize('comment', $project);

        $validated = $request->validate([
            'message' => 'nullable|string',
            'files'   => 'nullable|array',
            'files.*' => 'file|max:10240',
            'url'     => 'nullable|string',
        ]);

        $attachments = $this->processAttachments($request, $validated);

        $message = ProjectMessage::create([
            'project_id'     => $project->id,
            'visibility'     => 'customer',
            'sender_user_id' => auth()->id(),
            'message'        => $validated['message'] ?? '',
            'attachments'    => !empty($attachments) ? $attachments : null,
        ]);

        $this->logActivity($project, 'MESSAGE_POSTED', 'project_message', $message->id);

        return response()->json([
            'message' => 'Message sent successfully.',
            'data'    => $message->load('sender:id,name,role'),
        ], 201);
    }

    // ─────────────────────────────────────────────────────────────
    // UPDATE — shared route, permission logic enforced here
    // ─────────────────────────────────────────────────────────────

    /**
     * PUT /admin/projects/{project}/messages/{message}
     * PUT /customer/projects/{project}/messages/{message}
     *
     * Permission rules:
     *   super_admin  → edit any message
     *   other staff  → edit only own messages
     *   customer     → edit only own messages
     */
    public function update(Request $request, Project $project, ProjectMessage $message): JsonResponse
    {
        $this->authorize('view', $project);

        if ($message->project_id !== $project->id) {
            return response()->json(['message' => 'Message not found.'], 404);
        }

        $user = auth()->user();

        // Permission check
        $isSuperAdmin = $user->role === 'super_admin';
        $isOwner      = $message->sender_user_id === $user->id;

        if (!$isSuperAdmin && !$isOwner) {
            return response()->json(['message' => 'You do not have permission to edit this message.'], 403);
        }

        $validated = $request->validate([
            'message' => 'required|string|max:5000',
        ]);

        $message->update([
            'message'   => $validated['message'],
            'edited_at' => now(),
        ]);

        $this->logActivity($project, 'MESSAGE_EDITED', 'project_message', $message->id);

        return response()->json([
            'message' => 'Message updated.',
            'data'    => $message->fresh('sender:id,name,role'),
        ]);
    }

    // ─────────────────────────────────────────────────────────────
    // DELETE ONE
    // ─────────────────────────────────────────────────────────────

    /**
     * DELETE /admin/projects/{project}/messages/{message}
     * DELETE /customer/projects/{project}/messages/{message}
     *
     * Permission rules:
     *   super_admin  → delete any message
     *   admin/staff  → delete own + customer messages
     *   customer     → delete own messages only
     */
    public function destroy(Project $project, ProjectMessage $message): JsonResponse
    {
        $this->authorize('view', $project);

        if ($message->project_id !== $project->id) {
            return response()->json(['message' => 'Message not found.'], 404);
        }

        $user         = auth()->user();
        $isSuperAdmin = $user->role === 'super_admin';
        $isStaff      = $this->isStaff();
        $isOwner      = $message->sender_user_id === $user->id;

        // Staff roles who are not super_admin
        $senderIsCustomer = !in_array(
            optional($message->sender)->role,
            ['super_admin', 'admin', 'manager', 'sales_rep'],
            true
        );

        $canDelete = $isSuperAdmin
            || $isOwner
            || ($isStaff && $senderIsCustomer);

        if (!$canDelete) {
            return response()->json(['message' => 'You do not have permission to delete this message.'], 403);
        }

        $this->logActivity($project, 'MESSAGE_DELETED', 'project_message', $message->id);
        $message->delete();

        return response()->json(['message' => 'Message deleted.']);
    }

    // ─────────────────────────────────────────────────────────────
    // BULK DELETE
    // ─────────────────────────────────────────────────────────────

    /**
     * DELETE /admin/projects/{project}/messages
     * Body: { ids: [1, 2, 3] }
     *
     * Each message is subject to the same per-message permission as destroy().
     */
    public function destroyBulk(Request $request, Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $validated = $request->validate([
            'ids'   => 'required|array|min:1',
            'ids.*' => 'integer|min:1',
        ]);

        $user         = auth()->user();
        $isSuperAdmin = $user->role === 'super_admin';
        $isStaff      = $this->isStaff();
        $staffRoles   = ['super_admin', 'admin', 'manager', 'sales_rep'];

        $messages = ProjectMessage::whereIn('id', $validated['ids'])
            ->where('project_id', $project->id)
            ->with('sender:id,role')
            ->get();

        $denied = [];

        foreach ($messages as $msg) {
            $isOwner          = $msg->sender_user_id === $user->id;
            $senderIsCustomer = !in_array(optional($msg->sender)->role, $staffRoles, true);
            $canDelete        = $isSuperAdmin || $isOwner || ($isStaff && $senderIsCustomer);

            if (!$canDelete) {
                $denied[] = $msg->id;
            }
        }

        if (!empty($denied)) {
            return response()->json([
                'message' => 'You do not have permission to delete one or more of the selected messages.',
                'denied'  => $denied,
            ], 403);
        }

        ProjectMessage::whereIn('id', $messages->pluck('id'))->delete();

        $this->logActivity($project, 'MESSAGES_BULK_DELETED', null, null, [
            'count' => $messages->count(),
        ]);

        return response()->json(['message' => "{$messages->count()} messages deleted."]);
    }

    // ─────────────────────────────────────────────────────────────
    // CLEAR CHAT — super_admin only
    // ─────────────────────────────────────────────────────────────

    /**
     * DELETE /admin/projects/{project}/messages/clear
     */
    public function clearChat(Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        if (auth()->user()->role !== 'super_admin') {
            return response()->json(['message' => 'Only super admins can clear the chat.'], 403);
        }

        $count = ProjectMessage::where('project_id', $project->id)->count();
        ProjectMessage::where('project_id', $project->id)->delete();

        $this->logActivity($project, 'CHAT_CLEARED', null, null, [
            'deleted_count' => $count,
        ]);

        return response()->json(['message' => "Chat cleared ({$count} messages deleted)."]);
    }

    // ─────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────

    private function isStaff(): bool
    {
        return in_array(auth()->user()->role, ['super_admin', 'admin', 'manager', 'sales_rep'], true);
    }

    private function processAttachments(Request $request, array $validated): array
    {
        $attachments = [];

        if ($request->hasFile('files')) {
            foreach ($request->file('files') as $file) {
                $path = $file->store('projects', 'public');
                $attachments[] = [
                    'name' => $file->getClientOriginalName(),
                    'url'  => asset('storage/' . $path),
                ];
            }
        }

        if (!empty($validated['url'])) {
            $attachments[] = [
                'name' => $validated['url'],
                'url'  => $validated['url'],
            ];
        }

        return $attachments;
    }
}