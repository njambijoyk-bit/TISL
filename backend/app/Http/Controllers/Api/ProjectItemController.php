<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Traits\LogsProjectActivity;
use App\Models\Project;
use App\Models\ProjectItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectItemController extends Controller
{
    use LogsProjectActivity;

    /**
     * GET /admin/projects/{project}/items
     * GET /customer/projects/{project}/items
     */
    public function index(Request $request, Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $items = ProjectItem::where('project_id', $project->id)
            ->with([
                'product:id,name,sku',
                'service:id,name',
            ])
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->when($request->filled('item_type'), fn($q) => $q->where('item_type', $request->item_type))
            ->orderBy('display_order')
            ->orderBy('created_at')
            ->get();

        return response()->json(['data' => $items]);
    }

    /**
     * POST /admin/projects/{project}/items
     */
    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorize('manageWork', $project);

        $validated = $request->validate([
            'item_type'             => 'required|in:product,service,fee,custom_product,custom_service',
            'product_id'            => 'nullable|integer|exists:products,id',
            'service_id'            => 'nullable|integer|exists:services,id',
            'description'           => 'required|string',
            'quantity'              => 'nullable|numeric|min:0.01',
            'unit_of_measure'       => 'nullable|string|max:50',
            'currency'              => 'nullable|string|max:10',
            'unit_price'            => 'nullable|numeric|min:0',
            'line_total'            => 'nullable|numeric|min:0',
            'exchange_rate_to_kes'  => 'nullable|numeric',
            'unit_price_kes'        => 'nullable|numeric|min:0',
            'line_total_kes'        => 'nullable|numeric|min:0',
            'converted_currency_at' => 'nullable|date',
            'variant_details'       => 'nullable|array',
            'notes'                 => 'nullable|string',
            'status'                => 'nullable|in:planned,requested,quoted,approved,ordered,delivered,completed,cancelled',
            'source_type'           => 'nullable|in:manual,from_quote_request,from_quote,from_order',
            'source_id'             => 'nullable|integer',
            'metadata'              => 'nullable|array',
            'display_order'         => 'nullable|integer|min:0',
        ]);

        // Auto-calculate line_total if not provided
        if (!isset($validated['line_total']) && isset($validated['unit_price'], $validated['quantity'])) {
            $validated['line_total'] = round($validated['unit_price'] * $validated['quantity'], 2);
        }
        if (!isset($validated['line_total_kes']) && isset($validated['unit_price_kes'], $validated['quantity'])) {
            $validated['line_total_kes'] = round($validated['unit_price_kes'] * $validated['quantity'], 2);
        }

        $validated['project_id'] = $project->id;

        $item = ProjectItem::create($validated);

        $this->logActivity($project, 'ITEM_ADDED', 'project_item', $item->id, [
            'description' => $item->description,
            'item_type'   => $item->item_type,
        ]);

        return response()->json([
            'message' => 'Project item created successfully.',
            'data'    => $item,
        ], 201);
    }

    /**
     * PUT /admin/projects/{project}/items/{item}
     */
    public function update(Request $request, Project $project, ProjectItem $item): JsonResponse
    {
        $this->authorize('manageWork', $project);

        if ($item->project_id !== $project->id) {
            return response()->json(['message' => 'Item does not belong to this project.'], 404);
        }

        $validated = $request->validate([
            'description'           => 'sometimes|string',
            'quantity'              => 'sometimes|numeric|min:0.01',
            'unit_of_measure'       => 'sometimes|string|max:50',
            'currency'              => 'sometimes|string|max:10',
            'unit_price'            => 'sometimes|numeric|min:0',
            'line_total'            => 'nullable|numeric|min:0',
            'exchange_rate_to_kes'  => 'nullable|numeric',
            'unit_price_kes'        => 'nullable|numeric|min:0',
            'line_total_kes'        => 'nullable|numeric|min:0',
            'converted_currency_at' => 'nullable|date',
            'variant_details'       => 'nullable|array',
            'notes'                 => 'nullable|string',
            'status'                => 'sometimes|in:planned,requested,quoted,approved,ordered,delivered,completed,cancelled',
            'metadata'              => 'nullable|array',
            'display_order'         => 'sometimes|integer|min:0',
        ]);

        // Recalculate line_total on quantity or price change
        $qty   = $validated['quantity']   ?? $item->quantity;
        $price = $validated['unit_price'] ?? $item->unit_price;
        if (isset($validated['quantity']) || isset($validated['unit_price'])) {
            $validated['line_total'] = round($qty * $price, 2);
        }

        $item->update($validated);

        $this->logActivity($project, 'ITEM_UPDATED', 'project_item', $item->id);

        return response()->json([
            'message' => 'Project item updated successfully.',
            'data'    => $item->fresh(),
        ]);
    }

    /**
     * DELETE /admin/projects/{project}/items/{item}
     */
    public function destroy(Project $project, ProjectItem $item): JsonResponse
    {
        $this->authorize('manageWork', $project);

        if ($item->project_id !== $project->id) {
            return response()->json(['message' => 'Item does not belong to this project.'], 404);
        }

        $this->logActivity($project, 'ITEM_DELETED', 'project_item', $item->id, [
            'description' => $item->description,
        ]);

        $item->delete();

        return response()->json(['message' => 'Project item deleted successfully.']);
    }
}