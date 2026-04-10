<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Quote;
use App\Models\QuoteItem;
use App\Models\QuoteRequest;
use App\Models\Customer;
use App\Models\User;
use App\Models\Product;
use App\Models\Service;
use App\Models\Currency;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class QuoteController extends Controller
{
    /**
     * Admin quote list
     */
    public function adminIndex(Request $request)
    {
        $query = Quote::with(['customer', 'creator', 'assignedTo', 'items.product', 'items.service'])
            ->whereNull('deleted_at')
            ->when($request->search, function ($q) use ($request) {
                $q->search($request->search);
            })
            ->when($request->status, function($q, $status) {
                return $q->where('status', $status);
            })
            ->when($request->customer_id, function ($q, $customerId) {
                return $q->where('customer_id', $customerId);
            })
            ->orderBy($request->get('sort_by', 'created_at'), $request->get('sort_order', 'desc'));

        return $query->paginate($request->get('per_page', 200));
    }

    public function trashIndex(Request $request)
    {
        $query = Quote::onlyTrashed()
            ->with(['customer', 'creator', 'assignedTo'])
            ->when($request->search, function ($q) use ($request) {
                $q->search($request->search);
            })
            ->when($request->status, function($q, $status) {
                return $q->where('status', $status);
            })
            ->orderBy($request->get('sort_by', 'deleted_at'), $request->get('sort_order', 'desc'));

        return $query->paginate($request->get('per_page', 20));
    }

    /**
     * Admin view single quote
     */
    public function adminShow($id)
    {
        $quote = Quote::with([
            'customer', 
            'creator', 
            'assignedTo', 
            'items.product', 
            'items.service'
        ])->findOrFail($id);

        return response()->json($quote);
    }

    /**
     * Create new quote - COMPLETE WITH ALL FIELDS
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'customer_id' => 'required|exists:customers,id',
            'quote_type' => 'required|in:product,service,mixed',
            'status' => 'sometimes|in:draft,pending,revised,approved,rejected,expired,converted',
            'priority' => 'sometimes|in:low,medium,high,urgent',
            'assigned_to' => 'nullable|exists:users,id',
            
            // Quote-level fields
            'pricing_type' => 'sometimes|in:standard,bulk,negotiated,custom',
            'is_negotiable' => 'sometimes|boolean',
            'currency' => 'sometimes|string|max:10',
            'quote_request_id' => 'nullable|exists:quote_requests,id',
            'billing_schedule' => 'nullable|in:one_time,milestone_based,monthly,hourly,fixed_price',
            
            // Dates
            'valid_from' => 'nullable|date',
            'valid_until' => 'nullable|date',
            'service_start_date' => 'nullable|date',
            'service_end_date' => 'nullable|date',
            
            // Notes and terms
            'customer_notes' => 'nullable|string',
            'admin_notes' => 'nullable|string',
            'terms_and_conditions' => 'nullable|string',
            'payment_terms' => 'nullable|string',
            'delivery_terms' => 'nullable|string',
            
            // Addresses
            'shipping_address' => 'nullable|string',
            'billing_address' => 'nullable|string',
            'billing_same_as_shipping' => 'sometimes|boolean',
            
            // Financials
            'subtotal' => 'nullable|numeric|min:0',
            'tax' => 'nullable|numeric|min:0',
            'discount' => 'nullable|numeric|min:0',
            'discount_percentage' => 'nullable|numeric|min:0|max:100',
            'shipping_cost' => 'nullable|numeric|min:0',
            'total' => 'nullable|numeric|min:0',
            
            // Quote items
            'quote_items' => 'required|array|min:1',
            'quote_items.*.item_type' => 'required|in:product,service,fee,custom_product,custom_service,custom',
            'quote_items.*.description' => 'nullable|string',
            'quote_items.*.quantity' => 'required|numeric|min:0.01',
            'quote_items.*.unit_of_measure' => 'nullable|string|max:50',
            
            // Pricing fields
            'quote_items.*.original_price' => 'nullable|numeric|min:0',
            'quote_items.*.unit_price' => 'required|numeric|min:0',
            'quote_items.*.discount_amount' => 'nullable|numeric',  // Allow negative
            'quote_items.*.line_total' => 'nullable|numeric|min:0',
            'quote_items.*.line_total_after_discount' => 'nullable|numeric|min:0',
            
            // Product/Service references
            'quote_items.*.product_id' => 'nullable|exists:products,id',
            'quote_items.*.service_id' => 'nullable|exists:services,id',
            
            // Service-specific fields
            'quote_items.*.labor_cost' => 'nullable|numeric|min:0',
            'quote_items.*.material_cost' => 'nullable|numeric|min:0',
            'quote_items.*.estimated_hours' => 'nullable|numeric|min:0',
            'quote_items.*.hourly_rate' => 'nullable|numeric|min:0',
            'quote_items.*.estimated_duration' => 'nullable|string',
            'quote_items.*.scheduled_start_date' => 'nullable|date',
            'quote_items.*.scheduled_end_date' => 'nullable|date',
            'quote_items.*.requires_site_visit' => 'nullable|boolean',
            'quote_items.*.lead_time' => 'nullable|string',
            
            // Additional fields
            'quote_items.*.variant_details' => 'nullable',
            'quote_items.*.custom_item_details' => 'nullable',
            'quote_items.*.pricing_notes' => 'nullable|string',
            'quote_items.*.prerequisites' => 'nullable|string',
            'quote_items.*.notes' => 'nullable|string',
            'quote_items.*.is_bulk_pricing' => 'nullable|boolean',
            'quote_items.*.is_negotiated_price' => 'nullable|boolean',
            'quote_items.*.is_taxable' => 'nullable|boolean',
            'quote_items.*.availability_status' => 'nullable|in:in_stock,available,out_of_stock,special_order,on_request',
            'quote_items.*.display_order' => 'nullable|integer',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();

        try {
            // Calculate subtotal from items if not provided
            $subtotal = $request->subtotal;
            if ($subtotal === null) {
                $subtotal = collect($request->quote_items)->sum(function($item) {
                    return floatval($item['line_total_after_discount'] ?? 
                           ($item['quantity'] * $item['unit_price']));
                });
            }
            
            $tax = $request->tax ?? 0;
            $discount = $request->discount ?? 0;
            $shipping = $request->shipping_cost ?? 0;
            $total = $request->total ?? ($subtotal + $tax + $shipping - $discount);

            $assignedTo = $request->assigned_to;
            if (!$assignedTo && $request->quote_request_id) {
                $quoteRequest = QuoteRequest::find($request->quote_request_id);
                if ($quoteRequest && $quoteRequest->assigned_to) {
                    $assignedTo = $quoteRequest->assigned_to;
                }
            }

            // Create quote
            $quote = Quote::create([
                'customer_id' => $request->customer_id,
                'quote_number' => $this->generateQuoteNumber(),
                'created_by' => Auth::id(),
                'assigned_to' => $assignedTo,
                'quote_type' => $request->quote_type,
                'status' => $request->status ?? 'draft',
                'priority' => $request->priority ?? 'medium',
                
                // Pricing details
                'pricing_type' => $request->pricing_type ?? 'standard',
                'is_negotiable' => $request->is_negotiable ?? false,
                'currency' => $request->currency ?? 'KES',
                'billing_schedule' => $request->billing_schedule,
                
                // Dates
                'valid_from' => $request->valid_from,
                'valid_until' => $request->valid_until,
                'service_start_date' => $request->service_start_date,
                'service_end_date' => $request->service_end_date,
                
                // Notes and terms
                'customer_notes' => $request->customer_notes,
                'admin_notes' => $request->admin_notes,
                'terms_and_conditions' => $request->terms_and_conditions,
                'payment_terms' => $request->payment_terms,
                'delivery_terms' => $request->delivery_terms,
                
                // Addresses
                'shipping_address' => $request->shipping_address,
                'billing_address' => $request->billing_address,
                'billing_same_as_shipping' => $request->billing_same_as_shipping ?? true,
                
                // Financials
                'subtotal' => $subtotal, // ✅ FIXED: Now calculates and saves subtotal
                'tax' => $tax,
                'discount' => $discount,
                'discount_percentage' => $request->discount_percentage,
                'shipping_cost' => $shipping,
                'total' => $total,
                
                'version' => 1,
            ]);

            $quote->applyKesSnapshot();

            // Link quote back to the originating quote request
            if ($request->quote_request_id) {
                QuoteRequest::where('id', $request->quote_request_id)->update([
                    'quote_id'  => $quote->id,
                    'quoted_at' => now(),
                    'status'    => 'quoted',
                ]);
            }

            // Create quote items with ALL fields
            foreach ($request->quote_items as $index => $itemData) {
                // Determine if custom item
                $isCustom = empty($itemData['product_id']) && empty($itemData['service_id']);
                
                // ✅ FIXED: Fetch product details if product_id exists
                $productName = null;
                $productSku = null;
                $brandName = null;
                $productImage = null;
                // ✅ FIXED: Fetch service details if service_id exists
                $serviceName = null;
                $serviceDescription = null;
                $serviceCategory = null;

                if ($isCustom) {
                    if (in_array($itemData['item_type'], ['custom_product', 'product'])) {
                        $productName = $itemData['description'] ?? 'Custom Product';
                    }
                    elseif (in_array($itemData['item_type'], ['custom_service', 'service', 'fee'])) {
                        $serviceName = $itemData['description'] ?? ($itemData['item_type'] === 'fee' ? 'Fee' : 'Custom Service');
                    }
                }
                
                if (!empty($itemData['product_id'])) {
                    $product = Product::with('brand')->find($itemData['product_id']);
                    if ($product) {
                        $productName = $product->name;
                        $productSku = $product->sku;
                        $brandName = $product->brand ? $product->brand->name : null;
                        $productImage = $product->main_image;
                    }
                }
                
                if (!empty($itemData['service_id'])) {
                    $service = Service::with('serviceCategory')->find($itemData['service_id']);
                    if ($service) {
                        $serviceName = $service->name;
                        $serviceDescription = $service->short_description ?? $service->description;
                        $serviceCategory = $service->serviceCategory ? $service->serviceCategory->name : null;
                    }
                }

                // ✅ FIXED: Process variant_details (handle both string and object)
                $variantDetails = null;
                if (isset($itemData['variant_details']) && !empty($itemData['variant_details'])) {
                    if (is_string($itemData['variant_details'])) {
                        $decoded = json_decode($itemData['variant_details'], true);
                        $variantDetails = (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) 
                            ? $decoded 
                            : ['value' => $itemData['variant_details']];
                    } elseif (is_array($itemData['variant_details'])) {
                        $variantDetails = $itemData['variant_details'];  // ✅ No json_encode!
                    } elseif (is_object($itemData['variant_details'])) {
                        $variantDetails = (array) $itemData['variant_details'];
                    }
                }

                // ✅ FIX 2: Process custom_item_details - avoid double encoding
                $customItemDetails = null;
                if (isset($itemData['custom_item_details'])) {
                    if (is_string($itemData['custom_item_details'])) {
                        // Check if already JSON encoded
                        $decoded = json_decode($itemData['custom_item_details'], true);
                        if (json_last_error() === JSON_ERROR_NONE) {
                            // Already valid JSON string, use as-is
                            $customItemDetails = $itemData['custom_item_details'];
                        } else {
                            // Plain string, encode it
                            $customItemDetails = json_encode(['value' => $itemData['custom_item_details']]);
                        }
                    } elseif (is_array($itemData['custom_item_details']) || is_object($itemData['custom_item_details'])) {
                        // Array/object, encode once
                        $customItemDetails = json_encode($itemData['custom_item_details']);
                    }
                }
                
                // Keep discount_amount as-is (can be negative for price increases)
                $discountAmount = isset($itemData['discount_amount']) 
                    ? floatval($itemData['discount_amount'])
                    : 0;

                $quote->items()->create([
                    'item_type' => $itemData['item_type'],
                    'is_custom_item' => $isCustom,
                    
                    // ✅ FIXED: Product details (now populated from database)
                    'product_id' => $itemData['product_id'] ?? null,
                    'product_name' => $productName,
                    'product_sku' => $productSku,
                    'brand_name' => $brandName,
                    'product_image' => $productImage,
                    'variant_details' => $variantDetails,
                    
                    // ✅ FIXED: Service details (now populated from database)
                    'service_id' => $itemData['service_id'] ?? null,
                    'service_name' => $serviceName,
                    'service_description' => $serviceDescription,
                    'service_category' => $serviceCategory,
                    
                    // ✅ FIXED: Custom item details (now saved properly)
                    'custom_item_details' => $customItemDetails,
                    
                    // Basic info
                    'description' => $itemData['description'] ?? ($productName ?? $serviceName ?? ''),
                    'quantity' => $itemData['quantity'],
                    'unit_of_measure' => $itemData['unit_of_measure'] ?? 'each',
                    
                    // Pricing - Allow negative discounts
                    'original_price' => $itemData['original_price'] ?? $itemData['unit_price'],
                    'unit_price' => $itemData['unit_price'],
                    'discount_amount' => $discountAmount,
                    'line_total' => $itemData['line_total'] ?? ($itemData['quantity'] * ($itemData['original_price'] ?? $itemData['unit_price'])),
                    'line_total_after_discount' => $itemData['line_total_after_discount'] ?? ($itemData['quantity'] * $itemData['unit_price']),
                    
                    // Service-specific fields
                    'labor_cost' => $itemData['labor_cost'] ?? null,
                    'material_cost' => $itemData['material_cost'] ?? null,
                    'estimated_hours' => $itemData['estimated_hours'] ?? null,
                    'hourly_rate' => $itemData['hourly_rate'] ?? null,
                    'estimated_duration' => $itemData['estimated_duration'] ?? null,
                    'scheduled_start_date' => $itemData['scheduled_start_date'] ?? null,
                    'scheduled_end_date' => $itemData['scheduled_end_date'] ?? null,
                    'requires_site_visit' => $itemData['requires_site_visit'] ?? false,
                    'lead_time' => $itemData['lead_time'] ?? null,
                    
                    // Additional fields
                    'pricing_notes' => $itemData['pricing_notes'] ?? null,
                    'prerequisites' => $itemData['prerequisites'] ?? null,
                    'notes' => $itemData['notes'] ?? null,
                    
                    // Flags
                    'is_bulk_pricing' => $itemData['is_bulk_pricing'] ?? false,
                    'is_negotiated_price' => $itemData['is_negotiated_price'] ?? false,
                    'is_taxable' => $itemData['is_taxable'] ?? true,
                    
                    // Status and order
                    'availability_status' => $itemData['availability_status'] ?? 'available',
                    'display_order' => $itemData['display_order'] ?? $index,
                ]);
            }

            DB::commit();

            return response()->json([
                'message' => 'Quote created successfully',
                'quote' => $quote->load(['customer', 'items.product', 'items.service'])
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Quote creation failed: ' . $e->getMessage());
            Log::error($e->getTraceAsString());
            return response()->json([
                'message' => 'Failed to create quote',
                'error' => config('app.debug') ? $e->getMessage() : 'An error occurred'
            ], 500);
        }
    }

    /**
     * Update quote - COMPLETE WITH ALL FIELDS
     */
    public function update(Request $request, $id)
    {
        $quote = Quote::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'status' => 'sometimes|in:draft,pending,revised,approved,rejected,expired,converted',
            'priority' => 'sometimes|in:low,medium,high,urgent',
            'assigned_to' => 'nullable|exists:users,id',
            'pricing_type' => 'sometimes|in:standard,bulk,negotiated,custom',
            'currency' => 'sometimes|string|max:10',
            'subtotal' => 'sometimes|numeric|min:0',
            'tax' => 'sometimes|numeric|min:0',
            'discount' => 'sometimes|numeric|min:0',
            'discount_percentage' => 'sometimes|numeric|min:0|max:100',
            'shipping_cost' => 'sometimes|numeric|min:0',
            'total' => 'sometimes|numeric|min:0',
            'quote_items' => 'sometimes|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();

        try {
            // Update quote items if provided
            if ($request->has('quote_items')) {
                $quote->items()->delete();
                
                foreach ($request->quote_items as $index => $itemData) {
                    $isCustom = empty($itemData['product_id']) && empty($itemData['service_id']);
                    
                    // Fetch product details
                    $productName = null;
                    $productSku = null;
                    $brandName = null;
                    $productImage = null;
                    
                    if (!empty($itemData['product_id'])) {
                        $product = Product::with('brand')->find($itemData['product_id']);
                        if ($product) {
                            $productName = $product->name;
                            $productSku = $product->sku;
                            $brandName = $product->brand ? $product->brand->name : null;
                            $productImage = $product->main_image;
                        }
                    }
                    
                    // Fetch service details
                    $serviceName = null;
                    $serviceDescription = null;
                    $serviceCategory = null;
                    
                    if (!empty($itemData['service_id'])) {
                        $service = Service::with('serviceCategory')->find($itemData['service_id']);
                        if ($service) {
                            $serviceName = $service->name;
                            $serviceDescription = $service->short_description ?? $service->description;
                            $serviceCategory = $service->serviceCategory ? $service->serviceCategory->name : null;
                        }
                    }

                    // ✅ FIX: For custom items, populate names from description
                    if ($isCustom && isset($itemData['description'])) {
                        $itemType = $itemData['item_type'] ?? 'custom_product';
                        
                        // Custom products: store name in product_name
                        if (str_contains($itemType, 'product')) {
                            $productName = $itemData['description'];
                        } 
                        // Custom services/fees: store name in service_name
                        elseif (str_contains($itemType, 'service') || $itemType === 'fee') {
                            $serviceName = $itemData['description'];
                        }
                    }

                    // Process variant_details
                    $variantDetails = null;
                    if (isset($itemData['variant_details']) && !empty($itemData['variant_details'])) {
                        if (is_string($itemData['variant_details'])) {
                            $decoded = json_decode($itemData['variant_details'], true);
                            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                                $variantDetails = $decoded;
                            } else {
                                $variantDetails = ['value' => $itemData['variant_details']];
                            }
                        } elseif (is_array($itemData['variant_details'])) {
                            $variantDetails = $itemData['variant_details'];
                        } elseif (is_object($itemData['variant_details'])) {
                            $variantDetails = (array) $itemData['variant_details'];
                        }
                    }

                    // Process custom_item_details
                    $customItemDetails = null;
                    if (isset($itemData['custom_item_details'])) {
                        if (is_string($itemData['custom_item_details'])) {
                            $customItemDetails = $itemData['custom_item_details'];
                        } elseif (is_array($itemData['custom_item_details']) || is_object($itemData['custom_item_details'])) {
                            $customItemDetails = json_encode($itemData['custom_item_details']);
                        }
                    }
                    
                    $discountAmount = isset($itemData['discount_amount']) 
                        ? floatval($itemData['discount_amount'])
                        : 0;
                    
                    $quote->items()->create([
                        'item_type' => $itemData['item_type'],
                        'is_custom_item' => $isCustom,
                        'product_id' => $itemData['product_id'] ?? null,
                        'product_name' => $productName,
                        'product_sku' => $productSku,
                        'brand_name' => $brandName,
                        'product_image' => $productImage,
                        'variant_details' => $variantDetails,
                        'service_id' => $itemData['service_id'] ?? null,
                        'service_name' => $serviceName,
                        'service_description' => $serviceDescription,
                        'service_category' => $serviceCategory,
                        'custom_item_details' => $customItemDetails,
                        'description' => $itemData['description'] ?? ($productName ?? $serviceName ?? ''),
                        'quantity' => $itemData['quantity'],
                        'unit_of_measure' => $itemData['unit_of_measure'] ?? 'each',
                        'original_price' => $itemData['original_price'] ?? $itemData['unit_price'],
                        'unit_price' => $itemData['unit_price'],
                        'discount_amount' => $discountAmount,
                        'line_total' => $itemData['line_total'] ?? ($itemData['quantity'] * ($itemData['original_price'] ?? $itemData['unit_price'])),
                        'line_total_after_discount' => $itemData['line_total_after_discount'] ?? ($itemData['quantity'] * $itemData['unit_price']),
                        'labor_cost' => $itemData['labor_cost'] ?? null,
                        'material_cost' => $itemData['material_cost'] ?? null,
                        'estimated_hours' => $itemData['estimated_hours'] ?? null,
                        'hourly_rate' => $itemData['hourly_rate'] ?? null,
                        'estimated_duration' => $itemData['estimated_duration'] ?? null,
                        'scheduled_start_date' => $itemData['scheduled_start_date'] ?? null,
                        'scheduled_end_date' => $itemData['scheduled_end_date'] ?? null,
                        'requires_site_visit' => $itemData['requires_site_visit'] ?? false,
                        'lead_time' => $itemData['lead_time'] ?? null,
                        'pricing_notes' => $itemData['pricing_notes'] ?? null,
                        'prerequisites' => $itemData['prerequisites'] ?? null,
                        'notes' => $itemData['notes'] ?? null,
                        'is_bulk_pricing' => $itemData['is_bulk_pricing'] ?? false,
                        'is_negotiated_price' => $itemData['is_negotiated_price'] ?? false,
                        'is_taxable' => $itemData['is_taxable'] ?? true,
                        'availability_status' => $itemData['availability_status'] ?? 'available',
                        'display_order' => $itemData['display_order'] ?? $index,
                    ]);
                }
            }

            $quote->increment('version');
            
            // Update quote details
            $quote->update($request->only([
                'status', 'priority', 'assigned_to', 'pricing_type', 'is_negotiable', 'currency', 
                'billing_schedule', 'valid_from', 'valid_until', 'service_start_date', 
                'service_end_date', 'customer_notes', 'admin_notes', 'terms_and_conditions',
                'payment_terms', 'delivery_terms', 'shipping_address', 'billing_address',
                'billing_same_as_shipping', 'subtotal', 'tax', 'discount', 'discount_percentage',
                'shipping_cost', 'total'
            ]));
            
            $quote->refresh();
            $quote->applyKesSnapshot();

            DB::commit();

            return response()->json([
                'message' => 'Quote updated successfully',
                'quote' => $quote->fresh()->load(['customer', 'items.product', 'items.service'])
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Quote update failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to update quote'], 500);
        }
    }

    /**
     * Customer quotes
     */
    public function myQuotes(Request $request)
    {
        $customer = Auth::user()->customer;
        
        return Quote::withCount('items')
            ->where('customer_id', $customer->id)
            ->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 10));
    }

    /**
     * Customer view quote
     */
    public function show($id)
    {
        $customer = Auth::user()->customer;
        
        $quote = Quote::with(['creator', 'items.product', 'items.service', 'assignedTo'])
            ->where('customer_id', $customer->id)
            ->findOrFail($id);

        return response()->json($quote);
    }

    /**
     * Customer moves quote to trash (soft delete)
     * DELETE /customer/quotes/{id}
     */
    public function customerTrash($id)
    {
        $customer = Auth::user()->customer;

        $quote = Quote::where('customer_id', $customer->id)->findOrFail($id);

        // ✅ Only allow draft or pending (as requested)
        if (!in_array($quote->status, ['draft', 'pending'])) {
            return response()->json([
                'message' => 'Only draft or pending quotes can be moved to trash.'
            ], 422);
        }

        // soft delete
        $quote->delete();

        return response()->json([
            'message' => 'Quote moved to trash successfully'
        ]);
    }

    /**
     * Customer accept quote
     */
    public function accept($id)
    {
        $customer = Auth::user()->customer;
        $quote = Quote::where('customer_id', $customer->id)->findOrFail($id);

        $quote->update([
            'status' => 'approved',
            'responded_at' => now()
        ]);

        return response()->json(['message' => 'Quote accepted successfully']);
    }

    /**
     * Customer reject quote
     */
    public function reject(Request $request, $id)
    {
        $customer = Auth::user()->customer;
        $quote = Quote::where('customer_id', $customer->id)->findOrFail($id);

        $validator = Validator::make($request->all(), ['rejection_reason' => 'required|string']);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $quote->update([
            'status' => 'rejected',
            'rejection_reason' => $request->rejection_reason,
            'responded_at' => now()
        ]);

        return response()->json(['message' => 'Quote rejected']);
    }

    /**
     * Customer request revision
     * POST /customer/quotes/{id}/request-revision
     */
    public function requestRevision(Request $request, $id)
    {
        $customer = Auth::user()->customer;

        $quote = Quote::where('customer_id', $customer->id)->findOrFail($id);

        // Only allow requesting revision when rejected (adjust if you want approved too)
        if ($quote->status !== 'rejected') {
            return response()->json(['message' => 'Only rejected quotes can be moved to revised.'], 422);
        }

        $quote->update([
            'status' => 'revised',
            'rejection_reason' => null,
            'responded_at' => now(),
        ]);

        return response()->json([
            'message' => 'Revision requested successfully',
            'quote' => $quote->fresh(['creator', 'items.product', 'items.service']),
        ]);
    }

    /**
     * Customer updates their notes + delivery info for a quote
     * PATCH /customer/quotes/{id}/customer-update
     */
    public function customerUpdate(Request $request, $id)
    {
        $customer = Auth::user()->customer;

        $quote = Quote::where('customer_id', $customer->id)->findOrFail($id);

        // Allow edits only before conversion
        if (!in_array($quote->status, ['draft', 'pending', 'revised'])) {
            return response()->json(['message' => 'You can only edit delivery info/notes for draft, pending, or revised quotes.'], 422);
        }

        $data = Validator::make($request->all(), [
            'customer_notes' => 'nullable|string',
            'shipping_address' => 'nullable|string',
            'billing_same_as_shipping' => 'nullable|boolean',
            'billing_address' => 'nullable|string',
        ])->validate();

        // Keep billing & shipping in sync when requested
        if (array_key_exists('billing_same_as_shipping', $data)) {
            if ($data['billing_same_as_shipping']) {
                // Copy shipping → billing
                $data['billing_address'] =
                    $data['shipping_address']
                    ?? $quote->shipping_address
                    ?? $quote->billing_address;
            } else {
                // If unchecked and billing not provided, keep existing billing
                $data['billing_address'] =
                    $data['billing_address'] ?? $quote->billing_address;
            }
        }

        $quote->update($data);

        return response()->json([
            'message' => 'Updated successfully',
            'quote' => $quote->fresh(['items', 'creator']),
        ]);
    }

    /**
     * Customer convert approved quote to order
     * POST /customer/quotes/{id}/convert-to-order
     */
    public function convertToOrder(Request $request, $id)
    {
        $customer = Auth::user()->customer;

        $quote = Quote::with(['items'])
            ->where('customer_id', $customer->id)
            ->findOrFail($id);

        if ($quote->status !== 'approved') {
            return response()->json(['message' => 'Only approved quotes can be converted to an order.'], 422);
        }

        if ($quote->converted_to_order_id) {
            return response()->json([
                'message' => 'Quote already converted',
                'order_id' => $quote->converted_to_order_id,
            ]);
        }

        DB::beginTransaction();
        try {
            $order = $quote->convertToOrder(); // ✅ Uses your model logic
            DB::commit();

            return response()->json([
                'message' => 'Quote converted to order successfully',
                'order_id' => $order->id,
                'quote' => $quote->fresh(),
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Convert quote to order failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to convert quote to order'], 500);
        }
    }

    public function restore($id)
    {
        $quote = Quote::onlyTrashed()->findOrFail($id);
        $quote->restore();

        return response()->json(['message' => 'Quote restored successfully']);
    }

    public function restoreMultiple(Request $request)
    {
        $data = Validator::make($request->all(), [
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer|exists:quotes,id',
        ])->validate();

        Quote::onlyTrashed()->whereIn('id', $data['ids'])->restore();

        return response()->json(['message' => 'Quotes restored successfully']);
    }

    public function destroy(Request $request, $id)
    {
        try {
            $quote = Quote::findOrFail($id);

            // ✅ Converted delete is superadmin-only (soft or permanent)
            if ($quote->status === 'converted' && Auth::user()->role !== 'super_admin') {
                return response()->json([
                    'message' => 'Only super admin can delete converted quotes.'
                ], 403);
            }

            $quote->delete();

            return response()->json(['message' => 'Quote moved to trash successfully']);
        } catch (\Exception $e) {
            Log::error('Quote deletion failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to delete quote'], 500);
        }
    }

    private function requireDeleteConfirmation(Request $request)
    {
        if ($request->input('confirm') !== 'DELETE') {
            return response()->json([
                'message' => 'Type DELETE to confirm permanent deletion.'
            ], 422);
        }
        return null;
    }
    
    public function forceDelete(Request $request, $id)
    {
        // route should be protected by role:super_admin
        if ($resp = $this->requireDeleteConfirmation($request)) return $resp;

        $quote = Quote::onlyTrashed()->findOrFail($id);

        // converted is fine here since superadmin-only route
        $quote->forceDelete();

        return response()->json(['message' => 'Quote permanently deleted']);
    }

    public function forceDeleteMultiple(Request $request)
    {
        if ($resp = $this->requireDeleteConfirmation($request)) return $resp;

        $data = Validator::make($request->all(), [
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer|exists:quotes,id',
        ])->validate();

        Quote::onlyTrashed()->whereIn('id', $data['ids'])->forceDelete();

        return response()->json(['message' => 'Quotes permanently deleted']);
    }

    /**
     * Generate quote number QT-2026-0001
     */
    private function generateQuoteNumber()
    {
        return DB::transaction(function () {
            $year = date('Y');
            
            // Lock to prevent race conditions
            $lastQuote = Quote::withTrashed()
                ->whereYear('created_at', $year)
                ->orderBy('quote_number', 'desc')
                ->lockForUpdate()
                ->first();
            
            if ($lastQuote && $lastQuote->quote_number) {
                $parts = explode('-', $lastQuote->quote_number);
                $lastNumber = isset($parts[2]) ? intval($parts[2]) : 0;
                $nextNumber = $lastNumber + 1;
            } else {
                $nextNumber = 1;
            }
            
            return sprintf('QT-%s-%04d', $year, $nextNumber);
        });
    }
}