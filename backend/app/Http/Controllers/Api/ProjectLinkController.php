<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Traits\LogsProjectActivity;
use App\Models\Order;
use App\Models\Project;
use App\Models\ProjectLink;
use App\Models\Quote;
use App\Models\QuoteRequest;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectLinkController extends Controller
{
    use LogsProjectActivity;

    /**
     * GET /admin/projects/{project}/links
     * GET /customer/projects/{project}/links
     */
    public function index(Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $links = ProjectLink::where('project_id', $project->id)
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($link) {
                $link->linked_model_summary = $this->resolveSummary($link->link_type, $link->link_id);
                return $link;
            });

        return response()->json(['data' => $links]);
    }

    /**
     * POST /admin/projects/{project}/links
     */
    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorize('manageLinks', $project);

        $validated = $request->validate([
            'link_type' => 'required|in:quote_request,quote,order',
            'link_id'   => 'required|integer|min:1',
            'relation'  => 'nullable|in:primary,addendum,revision,phase',
            'notes'     => 'nullable|string|max:1000',
            'name'      => 'nullable|string|max:255',
        ]);

        // Verify target exists
        if (!$this->targetExists($validated['link_type'], $validated['link_id'])) {
            return response()->json([
                'message' => ucfirst(str_replace('_', ' ', $validated['link_type'])) . ' not found.',
            ], 404);
        }

        // Enforce: document must belong to the project's customer
        if (!$this->targetBelongsToCustomer($validated['link_type'], $validated['link_id'], $project->customer_id)) {
            return response()->json([
                'message' => 'This document does not belong to the project\'s customer.',
            ], 422);
        }

        // Check if already linked to another project
        $alreadyLinked = ProjectLink::where('link_type', $validated['link_type'])
            ->where('link_id', $validated['link_id'])
            ->where('project_id', '!=', $project->id)
            ->first();

        if ($alreadyLinked) {
            return response()->json([
                'message'           => 'This ' . str_replace('_', ' ', $validated['link_type']) . ' is already linked to another project.',
                'linked_project_id' => $alreadyLinked->project_id,
            ], 422);
        }

        // Check if already linked to THIS project
        $existingOnThis = ProjectLink::where('project_id', $project->id)
            ->where('link_type', $validated['link_type'])
            ->where('link_id', $validated['link_id'])
            ->first();

        if ($existingOnThis) {
            return response()->json(['message' => 'Already linked to this project.'], 422);
        }

        try {
            // Resolve the name from the linked document if not explicitly provided
            $resolvedName = $validated['name'] ?? $this->resolveName($validated['link_type'], $validated['link_id']);

            $link = ProjectLink::create([
                'project_id' => $project->id,
                'link_type'  => $validated['link_type'],
                'link_id'    => $validated['link_id'],
                'name'       => $resolvedName,
                'relation'   => $validated['relation'] ?? 'primary',
                'notes'      => $validated['notes'] ?? null,
            ]);
        } catch (UniqueConstraintViolationException $e) {
            return response()->json([
                'message' => 'This ' . str_replace('_', ' ', $validated['link_type']) . ' is already linked to a project.',
            ], 422);
        }

        // Attach resolved summary to the response so the frontend can display immediately
        $link->linked_model_summary = $this->resolveSummary($link->link_type, $link->link_id);

        $this->logActivity($project, 'LINK_ADDED', 'project_link', $link->id, [
            'link_type'       => $link->link_type,
            'link_id'         => $link->link_id,
            'document_number' => $link->linked_model_summary['document_number'] ?? null,
        ]);

        return response()->json([
            'message' => 'Link created successfully.',
            'data'    => $link,
        ], 201);
    }

    /**
     * DELETE /admin/projects/{project}/links/{link}
     */
    public function destroy(Project $project, ProjectLink $link): JsonResponse
    {
        $this->authorize('manageLinks', $project);

        if ($link->project_id !== $project->id) {
            return response()->json(['message' => 'Link does not belong to this project.'], 404);
        }

        $meta = ['link_type' => $link->link_type, 'link_id' => $link->link_id];
        $link->delete();

        $this->logActivity($project, 'LINK_REMOVED', null, null, $meta);

        return response()->json(['message' => 'Link removed successfully.']);
    }

    // ─────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────

    private function targetExists(string $type, int $id): bool
    {
        return match ($type) {
            'quote_request' => QuoteRequest::where('id', $id)->exists(),
            'quote'         => Quote::where('id', $id)->exists(),
            'order'         => Order::where('id', $id)->exists(),
            default         => false,
        };
    }

    /**
     * Ensure the document belongs to the project's customer before linking.
     */
    private function targetBelongsToCustomer(string $type, int $id, int $customerId): bool
    {
        return match ($type) {
            'quote_request' => QuoteRequest::where('id', $id)->where('customer_id', $customerId)->exists(),
            'quote'         => Quote::where('id', $id)->where('customer_id', $customerId)->exists(),
            'order'         => Order::where('id', $id)->where('customer_id', $customerId)->exists(),
            default         => false,
        };
    }

    /**
     * Resolve the linked document: include its document number, status, and customer name.
     * Returns a consistent shape regardless of type:
     * {
     *   id, document_number, status,
     *   customer_id, customer_name
     * }
     */
    private function resolveSummary(string $type, int $id): ?array
    {
        $model = match ($type) {
            'quote_request' => QuoteRequest::with('customer:id,first_name,last_name')
                ->select('id', 'request_number', 'request_title', 'status', 'customer_id')
                ->find($id),
            'quote'  => Quote::with('customer:id,first_name,last_name')
                ->select('id', 'quote_number', 'reference_number', 'status', 'customer_id')
                ->find($id),
            'order'  => Order::with('customer:id,first_name,last_name')
                ->select('id', 'order_number', 'project_name', 'status', 'customer_id')
                ->find($id),
            default  => null,
        };

        if (!$model) return null;

        $documentNumber = match ($type) {
            'quote_request' => $model->request_number,
            'quote'         => $model->quote_number,
            'order'         => $model->order_number,
            default         => null,
        };

        // Derive a human-readable name from the fields that actually exist
        $name = match ($type) {
            'quote_request' => $model->request_title ?: $model->request_number,
            'quote'         => $model->reference_number ?: $model->quote_number,
            'order'         => $model->project_name ?: $model->order_number,
            default         => null,
        };

        return [
            'id'              => $model->id,
            'document_number' => $documentNumber,
            'name'            => $name,
            'status'          => $model->status,
            'customer_id'     => $model->customer_id,
            'customer_name'   => $model->customer
                ? trim($model->customer->first_name . ' ' . $model->customer->last_name)
                : null,
        ];
    }

    /**
     * Pull a human-readable name from the linked document to persist on the link row.
     * Falls back to null if the model doesn't have a name column.
     */
    private function resolveName(string $type, int $id): ?string
    {
        $model = match ($type) {
            'quote_request' => QuoteRequest::select('id', 'request_number', 'request_title')->find($id),
            'quote'         => Quote::select('id', 'quote_number', 'reference_number')->find($id),
            'order'         => Order::select('id', 'order_number', 'project_name')->find($id),
            default         => null,
        };

        if (!$model) return null;

        return match ($type) {
            'quote_request' => $model->request_title ?: $model->request_number,
            'quote'         => $model->reference_number ?: $model->quote_number,
            'order'         => $model->project_name ?: $model->order_number,
            default         => null,
        };
    }
}