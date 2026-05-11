<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\QuoteRequest;
use App\Models\Customer;
use App\Models\Quote;
use App\Services\Mail\QuoteRequestMailService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Auth;

class QuoteRequestController extends Controller
{
    public function __construct(private QuoteRequestMailService $mailer) {}
    // ========================================
    // CUSTOMER ROUTES
    // ========================================

    /**
     * Get customer's quote requests
     */
    public function myQuoteRequests(Request $request)
    {
        $customer = Auth::user()->customer;
        
        $query = QuoteRequest::with(['quote', 'assignedTo'])
            ->where('customer_id', $customer->id);

        // Filter by status
        if ($request->has('status')) {
            $query->byStatus($request->status);
        }

        // Sort
        $sortBy = $request->get('sort_by', 'created_at');
        $sortOrder = $request->get('sort_order', 'desc');
        $query->orderBy($sortBy, $sortOrder);

        $requests = $query->paginate($request->get('per_page', 20));

        return response()->json($requests, 200);
    }

    /**
     * Create new quote request (customer)
     * FIXED: Now handles FormData with JSON strings and file uploads
     */
    public function store(Request $request)
    {
        // Decode requested_items if it's a JSON string (from FormData)
        $requestData = $request->all();
        if (isset($requestData['requested_items']) && is_string($requestData['requested_items'])) {
            $requestData['requested_items'] = json_decode($requestData['requested_items'], true);
        }

        $validator = Validator::make($requestData, [
            'request_title' => 'required|string|max:255',
            'request_description' => 'required|string',
            'request_type' => 'required|in:product,service,mixed,not_sure',
            'requested_items' => 'nullable|array',
            'requested_items.*.item_type' => 'required|in:product,service,custom_product,custom_service',
            'requested_items.*.description' => 'nullable|string',
            'requested_items.*.quantity' => 'nullable|numeric|min:0.01',
            'requested_items.*.specifications' => 'nullable|string',
            'requested_items.*.unit_of_measure' => 'nullable|string|max:50',
            'requested_items.*.lead_time' => 'nullable|string|max:255',
            'requested_items.*.estimated_hours' => 'nullable|numeric|min:0',
            'requested_items.*.budget_per_unit' => 'nullable|numeric|min:0',
            'requested_items.*.product_id' => 'nullable|exists:products,id',
            'requested_items.*.service_id' => 'nullable|exists:services,id',
            'requested_items.*.notes' => 'nullable|string',
            'budget_range' => 'nullable|string|max:100',
            'timeline_needed' => 'nullable|string|max:100',
            'delivery_location' => 'nullable|string',
            'customer_notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Handle file uploads for attachments
        $attachments = [];
        if ($request->hasFile('attachment_files')) {
            foreach ($request->file('attachment_files') as $file) {
                $path = $file->store('quote-requests', 'public');
                $attachments[] = [
                    'path' => $path,
                    'name' => $file->getClientOriginalName(),
                    'size' => $file->getSize(),
                    'mime_type' => $file->getMimeType(),
                ];
            }
        }

        $customer = Auth::user()->customer;

        $quoteRequest = QuoteRequest::create([
            'customer_id' => $customer->id,
            'request_title' => $requestData['request_title'],
            'request_description' => $requestData['request_description'],
            'request_type' => $requestData['request_type'],
            'requested_items' => $requestData['requested_items'] ?? [],
            'budget_range' => $requestData['budget_range'] ?? null,
            'timeline_needed' => $requestData['timeline_needed'] ?? null,
            'delivery_location' => $requestData['delivery_location'] ?? null,
            'attachments' => $attachments,
            'customer_notes' => $requestData['customer_notes'] ?? null,
            'status' => 'pending',
        ]);

        try {
            $quoteRequest->load('customer');
            $this->mailer->sendQuoteRequestSubmitted($quoteRequest);
        } catch (\Exception $e) {
            Log::error('Quote request submitted email failed: ' . $e->getMessage());
        }

        return response()->json([
            'message' => 'Quote request submitted successfully',
            'quote_request' => $quoteRequest
        ], 201);
    }

    /**
     * Get single quote request (customer)
     */
    public function show($id)
    {
        $quoteRequest = QuoteRequest::with(['quote', 'assignedTo', 'customer'])
            ->findOrFail($id);

        $customer = Auth::user()->customer;

        // Check ownership
        if ($customer->id !== $quoteRequest->customer_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json($quoteRequest, 200);
    }

    /**
     * Update quote request (customer - only if pending)
     */
    public function update(Request $request, $id)
{
    $quoteRequest = QuoteRequest::findOrFail($id);
    $customer = Auth::user()->customer;

    if ($customer->id !== $quoteRequest->customer_id) {
        return response()->json(['message' => 'Unauthorized'], 403);
    }

    if ($quoteRequest->status !== 'pending') {
        return response()->json([
            'message' => 'Can only update pending quote requests'
        ], 422);
    }

    // 🔥 Decode requested_items if JSON string from FormData
    $requestData = $request->all();
    if (isset($requestData['requested_items']) && is_string($requestData['requested_items'])) {
        $requestData['requested_items'] = json_decode($requestData['requested_items'], true);
    }

    $validator = Validator::make($requestData, [
        'request_title' => 'sometimes|required|string|max:255',
        'request_description' => 'sometimes|required|string',
        'requested_items' => 'nullable|array',
        'budget_range' => 'nullable|string|max:100',
        'timeline_needed' => 'nullable|string|max:100',
        'delivery_location' => 'nullable|string',
        'customer_notes' => 'nullable|string',
    ]);

    if ($validator->fails()) {
        return response()->json(['errors' => $validator->errors()], 422);
    }

    // 🔥 HANDLE ATTACHMENTS - Merge new + existing
    $currentAttachments = $quoteRequest->attachments ?? [];
    $newAttachments = [];

    // 1. Add NEW files
    if ($request->hasFile('attachment_files')) {
        foreach ($request->file('attachment_files') as $file) {
            $path = $file->store('quote-requests', 'public');
            $newAttachments[] = [
                'path' => $path,
                'name' => $file->getClientOriginalName(),
                'size' => $file->getSize(),
                'mime_type' => $file->getMimeType(),
            ];
        }
    }

    // 2. Remove DELETED files (frontend sends removed_attachment_paths)
    $removedPaths = $request->input('removed_attachment_paths', []);
    $keptPaths = array_filter(array_column($currentAttachments, 'path'));
    $keptAttachments = array_filter($currentAttachments, function($attachment) use ($removedPaths) {
        return !in_array($attachment['path'], $removedPaths);
    });

    // 3. Merge: kept + new
    $finalAttachments = array_merge($keptAttachments, $newAttachments);

    // Update ALL fields
    $quoteRequest->update(array_merge($requestData, [
        'attachments' => $finalAttachments
    ]));

    return response()->json([
        'message' => 'Quote request updated successfully',
        'quote_request' => $quoteRequest->load(['quote', 'assignedTo'])
    ], 200);
}



   /**
     * Respond to clarification request (customer)
     */
    public function respondToClarification(Request $request, $id)
    {
        $quoteRequest = QuoteRequest::findOrFail($id);

        $customer = Auth::user()->customer;

        // Check ownership
        if ($customer->id !== $quoteRequest->customer_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if (!$quoteRequest->requires_clarification) {
            return response()->json([
                'message' => 'This quote request does not require clarification'
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'clarification_response' => 'required|string|min:10',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Mark clarification as received with the response
        $quoteRequest->clarificationReceived($request->clarification_response);

        // Reload the quote request to get updated data
        $quoteRequest->load(['quote', 'assignedTo', 'customer']);

        return response()->json([
            'message' => 'Clarification response submitted successfully',
            'quote_request' => $quoteRequest
        ], 200);
    }

    // ========================================
    // ADMIN ROUTES
    // ========================================

    /**
     * Get all quote requests (admin)
     */
    public function index(Request $request)
    {
        $query = QuoteRequest::with(['customer', 'assignedTo', 'quote']);

        // Search
        if ($request->has('search')) {
            $query->search($request->search);
        }

        // Filter by status
        if ($request->has('status')) {
            $query->byStatus($request->status);
        }

        // Filter by priority
        if ($request->has('priority')) {
            $query->byPriority($request->priority);
        }

        // Filter by request type
        if ($request->has('request_type')) {
            $query->where('request_type', $request->request_type);
        }

        // Filter by assigned status
        if ($request->has('assigned')) {
            if ($request->boolean('assigned')) {
                $query->assigned();
            } else {
                $query->unassigned();
            }
        }

        // Filter by clarification needed
        if ($request->boolean('requires_clarification')) {
            $query->requiresClarification();
        }

        // Sort
        $sortBy = $request->get('sort_by', 'created_at');
        $sortOrder = $request->get('sort_order', 'desc');
        $query->orderBy($sortBy, $sortOrder);

        $quoteRequests = $query->paginate($request->get('per_page', 20));

        return response()->json([
            'data' => $quoteRequests->items(),
            'meta' => [
                'current_page' => $quoteRequests->currentPage(),
                'last_page'    => $quoteRequests->lastPage(),
                'per_page'     => $quoteRequests->perPage(),
                'total'        => $quoteRequests->total(),
            ]
        ], 200);
    }

    /**
     * Get single quote request (admin)
     */
    public function adminShow($id)
    {
        $quoteRequest = QuoteRequest::with(['customer', 'assignedTo', 'quote'])
            ->findOrFail($id);

        return response()->json($quoteRequest, 200);
    }

    /**
     * Assign quote request to admin
     */
    public function assign(Request $request, $id)
    {
        $quoteRequest = QuoteRequest::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'admin_id' => 'required|exists:users,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $admin = \App\Models\User::findOrFail($request->admin_id);

        $quoteRequest->assignTo($admin);

        return response()->json([
            'message' => 'Quote request assigned successfully',
            'quote_request' => $quoteRequest->load('assignedTo')
        ], 200);
    }

    /**
     * Request clarification from customer
     */
    public function requestClarification(Request $request, $id)
    {
        $quoteRequest = QuoteRequest::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'clarification_notes' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $quoteRequest->requireClarification($request->clarification_notes);

        try {
            $quoteRequest->load('customer');
            $this->mailer->sendQuoteRequestClarification($quoteRequest);
        } catch (\Exception $e) {
            Log::error('Quote request clarification email failed: ' . $e->getMessage());
        }

        // TODO: Send notification/email to customer

        return response()->json([
            'message' => 'Clarification request sent to customer',
            'quote_request' => $quoteRequest
        ], 200);
    }

    /**
     * Reject quote request
     */
    public function reject(Request $request, $id)
    {
        $quoteRequest = QuoteRequest::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'rejection_reason' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $quoteRequest->markAsRejected($request->rejection_reason);

        // TODO: Send notification/email to customer
        try {
            $quoteRequest->load('customer');
            $this->mailer->sendQuoteRequestRejected($quoteRequest);
        } catch (\Exception $e) {
            Log::error('Quote request rejected email failed: ' . $e->getMessage());
        }

        return response()->json([
            'message' => 'Quote request rejected',
            'quote_request' => $quoteRequest
        ], 200);
    }

    /**
     * Convert quote request to quote
     */
    public function convertToQuote(Request $request, $id)
    {
        $quoteRequest = QuoteRequest::findOrFail($id);

        if (!$quoteRequest->canConvertToQuote()) {
            return response()->json([
                'message' => 'Quote request cannot be converted. It must be in reviewing status and not already have a quote.'
            ], 422);
        }

        // This will be handled by the QuoteController::store method
        // Just return the quote request data for the admin to create a quote
        return response()->json([
            'message' => 'Use this data to create a quote',
            'quote_request' => $quoteRequest
        ], 200);
    }

    /**
     * Update priority
     */
    public function updatePriority(Request $request, $id)
    {
        $quoteRequest = QuoteRequest::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'priority' => 'required|in:low,medium,high,urgent',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $quoteRequest->update(['priority' => $request->priority]);

        return response()->json([
            'message' => 'Priority updated successfully',
            'quote_request' => $quoteRequest
        ], 200);
    }

    /**
     * Update status
     */
    public function updateStatus(Request $request, $id)
    {
        $quoteRequest = QuoteRequest::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'status' => 'required|in:pending,reviewing,quoted,rejected,expired',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $quoteRequest->update(['status' => $request->status]);

        return response()->json([
            'message' => 'Status updated successfully',
            'quote_request' => $quoteRequest
        ], 200);
    }

    /**
     * Add admin notes
     */
    public function addNotes(Request $request, $id)
    {
        $quoteRequest = QuoteRequest::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'admin_notes' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $quoteRequest->update([
            'admin_notes' => $request->admin_notes
        ]);

        return response()->json([
            'message' => 'Notes added successfully',
            'quote_request' => $quoteRequest
        ], 200);
    }

    /**
     * Get quote request statistics (admin)
     */
    public function statistics()
    {
        $stats = [
            // Main statistics
            'total_requests' => QuoteRequest::count(),
            'pending' => QuoteRequest::pending()->count(),
            'reviewing' => QuoteRequest::reviewing()->count(),
            'quoted' => QuoteRequest::quoted()->count(),
            'rejected' => QuoteRequest::where('status', 'rejected')->count(), // NEW
            'expired' => QuoteRequest::where('status', 'expired')->count(),   // NEW
            'unassigned' => QuoteRequest::unassigned()->count(),
            'requires_clarification' => QuoteRequest::requiresClarification()->count(),
            
            // By type
            'by_type' => [
                'product' => QuoteRequest::where('request_type', 'product')->count(),
                'service' => QuoteRequest::where('request_type', 'service')->count(),
                'mixed' => QuoteRequest::where('request_type', 'mixed')->count(),
                'not_sure' => QuoteRequest::where('request_type', 'not_sure')->count(),
            ],
            
            // By priority
            'by_priority' => [
                'urgent' => QuoteRequest::where('priority', 'urgent')->count(),
                'high' => QuoteRequest::where('priority', 'high')->count(),
                'medium' => QuoteRequest::where('priority', 'medium')->count(),
                'low' => QuoteRequest::where('priority', 'low')->count(),
            ],
            
            // Additional metrics
            'conversion_rate' => $this->calculateConversionRate(),
            'average_response_time_hours' => $this->calculateAverageResponseTime(),
        ];

        return response()->json($stats);
    }

    /**
     * Calculate conversion rate (quoted / total)
     */
    private function calculateConversionRate()
    {
        $total = QuoteRequest::count();
        if ($total === 0) return 0;
        
        $quoted = QuoteRequest::quoted()->count();
        return round(($quoted / $total) * 100, 2);
    }

    /**
     * Calculate average response time in hours
     */
    private function calculateAverageResponseTime()
    {
        $requests = QuoteRequest::whereNotNull('quoted_at')
            ->get(['created_at', 'quoted_at']);
        
        if ($requests->isEmpty()) return 0;
        
        $totalHours = $requests->sum(function ($request) {
            return $request->created_at->diffInHours($request->quoted_at);
        });
        
        return round($totalHours / $requests->count(), 2);
    }

    /**
     * Download quote request attachment
     */
    public function downloadAttachment($id, $index)
    {
        try {
            $quoteRequest = QuoteRequest::findOrFail($id);
            
            // Authorization check
            $user = auth()->user();
            
            // Admin can view any attachment
            if (!in_array($user->role, ['admin', 'super_admin', 'manager', 'sales_rep'])) {
                // Customer can only view their own attachments
                if ($user->role === 'customer') {
                    $customer = $user->customer;
                    if (!$customer || $quoteRequest->customer_id !== $customer->id) {
                        return response()->json(['message' => 'Unauthorized'], 403);
                    }
                } else {
                    return response()->json(['message' => 'Unauthorized'], 403);
                }
            }
            
            // Get attachments array
            $attachments = $quoteRequest->attachments ?? [];
            
            if (!isset($attachments[$index])) {
                return response()->json(['message' => 'Attachment not found'], 404);
            }
            
            $attachment = $attachments[$index];
            $filePath = storage_path('app/public/' . $attachment['path']);
            
            // Check if file exists
            if (!file_exists($filePath)) {
                Log::error('Attachment file not found', [
                    'quote_request_id' => $id,
                    'attachment_index' => $index,
                    'path' => $attachment['path'],
                    'full_path' => $filePath
                ]);
                
                return response()->json([
                    'message' => 'File not found on server'
                ], 404);
            }
            
            // Return file download with proper headers
            return response()->download(
                $filePath,
                $attachment['name'],
                [
                    'Content-Type' => $attachment['mime_type'] ?? 'application/octet-stream',
                    'Content-Disposition' => 'attachment; filename="' . $attachment['name'] . '"',
                    'Cache-Control' => 'no-cache, no-store, must-revalidate',
                    'Pragma' => 'no-cache',
                    'Expires' => '0'
                ]
            );
            
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json(['message' => 'Quote request not found'], 404);
        } catch (\Exception $e) {
            Log::error('Attachment download failed', [
                'quote_request_id' => $id,
                'attachment_index' => $index,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'message' => 'Download failed',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}