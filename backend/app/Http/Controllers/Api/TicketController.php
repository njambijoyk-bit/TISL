<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Ticket;
use App\Models\TicketReply;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TicketController extends Controller
{
    // =========================================================
    // HELPERS
    // =========================================================

    private function generateTicketNumber(): string
    {
        $year   = now()->format('Y');
        $prefix = "TKT-{$year}-";
        $last   = Ticket::withTrashed()
            ->where('ticket_number', 'like', $prefix . '%')
            ->orderByDesc('id')
            ->value('ticket_number');

        $next = $last ? ((int) substr($last, strlen($prefix))) + 1 : 1;
        return $prefix . str_pad($next, 5, '0', STR_PAD_LEFT);
    }

    private function ticketWithRelations()
    {
        return Ticket::with([
            'customer:id,first_name,last_name,email',
            'assignedTo:id,name,email',
            'replies.user:id,name,email',
            'replies.customer:id,first_name,last_name,email',
        ]);
    }

    // =========================================================
    // ADMIN ENDPOINTS
    // =========================================================

    /**
     * GET /admin/tickets
     * List all tickets with filters (admin/staff).
     */
    public function adminIndex(Request $request): JsonResponse
    {
        $query = Ticket::with([
            'customer:id,first_name,last_name,email',
            'assignedTo:id,name,email',
        ])->withCount('replies');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('priority')) {
            $query->where('priority', $request->priority);
        }
        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }
        if ($request->filled('assigned_to')) {
            $query->where('assigned_to', $request->assigned_to);
        }
        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }
        if ($request->filled('unassigned') && $request->unassigned) {
            $query->whereNull('assigned_to');
        }
        if ($request->filled('search')) {
            $s = '%' . $request->search . '%';
            $query->where(function ($q) use ($s) {
                $q->where('subject', 'like', $s)
                  ->orWhere('ticket_number', 'like', $s);
            });
        }

        $tickets = $query->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 20));

        return response()->json([
            'data' => $tickets->items(),
            'meta' => [
                'current_page' => $tickets->currentPage(),
                'last_page'    => $tickets->lastPage(),
                'per_page'     => $tickets->perPage(),
                'total'        => $tickets->total(),
            ]
        ]);
       
    }

    /**
     * GET /admin/tickets/statistics
     */
    public function statistics(): JsonResponse
    {
        $stats = [
            'total'            => Ticket::count(),
            'open'             => Ticket::where('status', 'open')->count(),
            'in_progress'      => Ticket::where('status', 'in_progress')->count(),
            'waiting_customer' => Ticket::where('status', 'waiting_customer')->count(),
            'resolved'         => Ticket::where('status', 'resolved')->count(),
            'closed'           => Ticket::where('status', 'closed')->count(),
            'unassigned'       => Ticket::whereNull('assigned_to')->whereNotIn('status', ['resolved', 'closed'])->count(),
            'urgent'           => Ticket::where('priority', 'urgent')->whereNotIn('status', ['resolved', 'closed'])->count(),
            'trashed'          => Ticket::onlyTrashed()->count(),
        ];

        return response()->json(['statistics' => $stats]);
    }

    /**
     * GET /admin/tickets/trash
     */
    public function trashIndex(Request $request): JsonResponse
    {
        $tickets = Ticket::onlyTrashed()
            ->with(['customer:id,first_name,last_name,email', 'assignedTo:id,name,email'])
            ->orderBy('deleted_at', 'desc')
            ->paginate($request->get('per_page', 20));

        return response()->json($tickets);
    }

    /**
     * GET /admin/tickets/{id}
     */
    public function adminShow(int $id): JsonResponse
    {
        $ticket = $this->ticketWithRelations()->findOrFail($id);

        // Attach sender info to each reply
        $ticket->replies->each(function ($reply) {
            $reply->append('sender');
        });

        return response()->json(['ticket' => $ticket]);
    }

    /**
     * PUT /admin/tickets/{id}
     * Update status, priority, category.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $ticket = Ticket::findOrFail($id);

        $validated = $request->validate([
            'status'   => 'sometimes|in:open,in_progress,waiting_customer,resolved,closed',
            'priority' => 'sometimes|in:low,medium,high,urgent',
            'category' => 'sometimes|in:general,billing,technical,shipping,returns,other',
        ]);

        if (isset($validated['status'])) {
            if ($validated['status'] === 'resolved' && !$ticket->resolved_at) {
                $validated['resolved_at'] = now();
            }
            if ($validated['status'] === 'closed' && !$ticket->closed_at) {
                $validated['closed_at'] = now();
            }
        }

        $ticket->update($validated);

        return response()->json([
            'message' => 'Ticket updated.',
            'ticket'  => $ticket->fresh(['customer:id,first_name,last_name,email', 'assignedTo:id,name,email']),
        ]);
    }

    /**
     * POST /admin/tickets/{id}/assign
     * Assign a staff member to the ticket.
     */
    public function assign(Request $request, int $id): JsonResponse
    {
        $ticket = Ticket::findOrFail($id);

        $validated = $request->validate([
            'assigned_to' => 'required|exists:users,id',
        ]);

        $ticket->update([
            'assigned_to' => $validated['assigned_to'],
            'status'      => $ticket->status === 'open' ? 'in_progress' : $ticket->status,
        ]);

        return response()->json([
            'message' => 'Ticket assigned.',
            'ticket'  => $ticket->fresh(['assignedTo:id,name,email']),
        ]);
    }

    /**
     * POST /admin/tickets/{id}/unassign
     */
    public function unassign(int $id): JsonResponse
    {
        $ticket = Ticket::findOrFail($id);
        $ticket->update(['assigned_to' => null]);

        return response()->json(['message' => 'Ticket unassigned.']);
    }

    /**
     * POST /admin/tickets/{id}/reply
     * Staff posts a reply (visible or internal note).
     */
    public function adminReply(Request $request, int $id): JsonResponse
    {
        $ticket = Ticket::findOrFail($id);

        $validated = $request->validate([
            'message'     => 'required|string|max:10000',
            'is_internal' => 'boolean',
        ]);

        $reply = DB::transaction(function () use ($ticket, $validated, $request) {
            $reply = TicketReply::create([
                'ticket_id'   => $ticket->id,
                'user_id'     => $request->user()->id,
                'message'     => $validated['message'],
                'is_internal' => $validated['is_internal'] ?? false,
            ]);

            // Mark first response time
            if (!$ticket->first_responded_at && !($validated['is_internal'] ?? false)) {
                $ticket->update(['first_responded_at' => now()]);
            }

            // Move to waiting_customer if not internal
            if (!($validated['is_internal'] ?? false) && $ticket->status === 'in_progress') {
                $ticket->update(['status' => 'waiting_customer']);
            }

            return $reply;
        });

        $reply->load(['user:id,name,email']);
        $reply->append('sender');

        return response()->json(['message' => 'Reply posted.', 'reply' => $reply], 201);
    }

    /**
     * DELETE /admin/tickets/{id}  → soft delete (admin)
     */
    public function destroy(int $id): JsonResponse
    {
        $ticket = Ticket::findOrFail($id);
        $ticket->delete();

        return response()->json(['message' => 'Ticket moved to trash.']);
    }

    /**
     * POST /admin/tickets/{id}/restore
     */
    public function restore(int $id): JsonResponse
    {
        $ticket = Ticket::onlyTrashed()->findOrFail($id);
        $ticket->restore();

        return response()->json(['message' => 'Ticket restored.']);
    }

    /**
     * DELETE /admin/tickets/{id}/force  → permanent delete (super_admin only)
     */
    public function forceDelete(int $id): JsonResponse
    {
        $ticket = Ticket::withTrashed()->findOrFail($id);
        $ticket->forceDelete(); // replies cascade via DB

        return response()->json(['message' => 'Ticket permanently deleted.']);
    }

    // =========================================================
    // CUSTOMER ENDPOINTS
    // =========================================================

    /**
     * GET /customer/tickets
     * Customer sees only their own tickets.
     */
    public function myTickets(Request $request): JsonResponse
    {
        $customer = $request->user()->customer;

        if (!$customer) {
            return response()->json(['message' => 'Customer profile not found.'], 403);
        }

        $query = Ticket::where('customer_id', $customer->id)
            ->withCount('replies');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $tickets = $query->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 15));

        return response()->json([
            'data' => $tickets->items(),
            'meta' => [
                'current_page' => $tickets->currentPage(),
                'last_page'    => $tickets->lastPage(),
                'per_page'     => $tickets->perPage(),
                'total'        => $tickets->total(),
            ]
        ]);
    }

    /**
     * GET /customer/tickets/{id}
     */
    public function customerShow(Request $request, int $id): JsonResponse
    {
        $customer = $request->user()->customer;

        $ticket = $this->ticketWithRelations()
            ->where('customer_id', $customer->id)
            ->findOrFail($id);

        // Filter out internal notes for customers
        $ticket->setRelation(
            'replies',
            $ticket->replies->filter(fn($r) => !$r->is_internal)->values()
        );

        $ticket->replies->each(fn($r) => $r->append('sender'));

        return response()->json(['ticket' => $ticket]);
    }

    /**
     * POST /customer/tickets
     * Customer opens a new ticket.
     */
    public function store(Request $request): JsonResponse
    {
        $customer = $request->user()->customer;

        if (!$customer) {
            return response()->json(['message' => 'Customer profile not found.'], 403);
        }

        $validated = $request->validate([
            'subject'     => 'required|string|max:255',
            'description' => 'required|string|max:10000',
            'priority'    => 'nullable|in:low,medium,high,urgent',
            'category'    => 'nullable|in:general,billing,technical,shipping,returns,other',
        ]);

        $ticket = Ticket::create([
            'ticket_number' => $this->generateTicketNumber(),
            'customer_id'   => $customer->id,
            'subject'       => $validated['subject'],
            'description'   => $validated['description'],
            'priority'      => $validated['priority'] ?? 'medium',
            'category'      => $validated['category'] ?? 'general',
            'status'        => 'open',
        ]);

        return response()->json([
            'message' => 'Ticket submitted successfully.',
            'ticket'  => $ticket,
        ], 201);
    }

    /**
     * POST /customer/tickets/{id}/reply
     * Customer adds a reply to their ticket.
     */
    public function customerReply(Request $request, int $id): JsonResponse
    {
        $customer = $request->user()->customer;

        $ticket = Ticket::where('customer_id', $customer->id)
            ->whereNotIn('status', ['closed'])
            ->findOrFail($id);

        $validated = $request->validate([
            'message' => 'required|string|max:10000',
        ]);

        $reply = DB::transaction(function () use ($ticket, $validated, $customer) {
            $reply = TicketReply::create([
                'ticket_id'   => $ticket->id,
                'customer_id' => $customer->id,
                'message'     => $validated['message'],
                'is_internal' => false,
            ]);

            // When customer responds, move back to in_progress if it was waiting
            if ($ticket->status === 'waiting_customer') {
                $ticket->update(['status' => 'in_progress']);
            } elseif ($ticket->status === 'resolved') {
                $ticket->update(['status' => 'open', 'resolved_at' => null]);
            }

            return $reply;
        });

        $reply->append('sender');

        return response()->json(['message' => 'Reply posted.', 'reply' => $reply], 201);
    }

    /**
     * POST /customer/tickets/{id}/close
     * Customer can close (resolve) their own ticket.
     */
    public function customerClose(Request $request, int $id): JsonResponse
    {
        $customer = $request->user()->customer;

        $ticket = Ticket::where('customer_id', $customer->id)
            ->whereNotIn('status', ['closed'])
            ->findOrFail($id);

        $ticket->update([
            'status'    => 'closed',
            'closed_at' => now(),
        ]);

        return response()->json(['message' => 'Ticket closed.']);
    }
}
