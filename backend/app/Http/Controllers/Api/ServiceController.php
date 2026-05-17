<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class ServiceController extends Controller
{
    // ========================================
    // PUBLIC ROUTES (No Authentication)
    // ========================================

    /**
     * Get all services (public - active only)
     */
    public function index(Request $request)
    {
        $query = Service::with(['category'])->where('is_available', true)->where('is_visible', true)->where('status', 'active');

        // Search
        // Smart Search - searches across multiple fields
        if ($request->has('search') && $request->search) {
            $search = $request->search;
            $searchTerm = "%{$search}%";
            
            $query->where(function($q) use ($search, $searchTerm) {
                $q->where('name', 'like', $searchTerm)
                ->orWhere('description', 'like', $searchTerm)
                ->orWhere('short_description', 'like', $searchTerm)
                ->orWhere('service_area', 'like', $searchTerm)
                // Search in JSON fields (features, deliverables, requirements)
                ->orWhereRaw("JSON_SEARCH(features, 'one', ?) IS NOT NULL", [$search])
                ->orWhereRaw("JSON_SEARCH(deliverables, 'one', ?) IS NOT NULL", [$search])
                ->orWhereRaw("JSON_SEARCH(requirements, 'one', ?) IS NOT NULL", [$search])
                // Search in category name
                ->orWhereHas('category', function ($categoryQuery) use ($searchTerm) {
                    $categoryQuery->where('name', 'like', $searchTerm);
                });
            });
        }

        // Filter by category
        if ($request->has('category_id')) {
            $query->where('category_id', $request->category_id);
        }

        // Filter by type
        if ($request->has('type') && $request->type) {
            $query->where('type', $request->type);
        }

        // Filter by pricing model
        if ($request->has('pricing_model')) {
            $query->where('pricing_model', $request->pricing_model);
        }

        // Filter by remote availability
        if ($request->boolean('remote_only')) {
            $query->where('is_remote_available', true);
        }

        // Filter by site visit requirement
        if ($request->has('requires_site_visit')) {
            $query->where('requires_site_visit', $request->boolean('requires_site_visit'));
        }

        // Filter by featured
        if ($request->boolean('featured')) {
            $query->where('is_featured', true);
        }

        // Price range
        if ($request->has('min_price')) {
            $query->where('base_price', '>=', $request->min_price);
        }
        if ($request->has('max_price')) {
            $query->where('base_price', '<=', $request->max_price);
        }

        // Sort
        $sortBy = $request->get('sort_by', 'created_at');
        $sortOrder = $request->get('sort_order', 'desc');

        if ($sortBy === 'popular') {
            $query->orderBy('order_count', 'desc');
        } elseif ($sortBy === 'rating') {
            $query->orderBy('rating', 'desc');
        } elseif ($sortBy === 'price_low') {
            $query->orderBy('base_price', 'asc');
        } elseif ($sortBy === 'price_high') {
            $query->orderBy('base_price', 'desc');
        } else {
            $query->orderBy($sortBy, $sortOrder);
        }

        $services = $query->paginate($request->get('per_page', 20));

        return response()->json($services, 200);
    }

    /**
     * Get featured services
     */
    public function featured()
    {
        $services = Service::with(['category'])
            ->where('is_available', true)
            ->where('is_visible', true)
            ->where('is_featured', true)
            ->where('status', 'active')
            ->orderBy('order_count', 'desc')
            ->take(10)
            ->get();

        return response()->json($services, 200);
    }

    /**
     * Get single service
     */
    public function show($id)
    {
        $service = Service::with(['category'])->findOrFail($id);
        $service->increment('view_count');

        return response()->json([
            'service' => array_merge($service->toArray(), [
                'required_products_full' => $service->getRequiredProducts(), 
                'optional_products_full' => $service->getOptionalProducts(), 
                'related_services_data'  => $service->getRelatedServices(),  
            ]),
        ], 200);
    }

    /**
     * Get related services
     */
    public function related($id)
    {
        $service = Service::findOrFail($id);
        
        $related = Service::where('id', '!=', $id)
            ->where('category_id', $service->category_id)
            ->where('is_available', true)
            ->where('is_visible', true)
            ->where('status', 'active')
            ->take(6)
            ->get();

        return response()->json($related, 200);
    }

    /**
     * Get distinct service types from database
     */
    public function getTypes()
    {
        $types = Service::select('type')
            ->whereNotNull('type')
            ->where('type', '!=', '')
            ->where('is_available', true)
            ->where('is_visible', true)
            ->where('status', 'active')
            ->distinct()
            ->orderBy('type')
            ->pluck('type');
        
        return response()->json($types, 200);
    }

    // ========================================
    // ADMIN ROUTES
    // ========================================

    /**
     * Get all services (admin - includes inactive)
     */
    public function adminIndex(Request $request)
    {
        $query = Service::with(['category']);

        // Search
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%")
                  ->orWhere('sku', 'like', "%{$search}%");
            });
        }

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        // Filter by category
        if ($request->has('category_id')) {
            $query->where('category_id', $request->category_id);
        }

        // Filter by pricing model
        if ($request->has('pricing_model')) {
            $query->where('pricing_model', $request->pricing_model);
        }

        // Filter by availability
        if ($request->has('is_available')) {
            $query->where('is_available', $request->boolean('is_available'));
        }

        // Filter by visibility
        if ($request->has('is_visible')) {
            $query->where('is_visible', $request->boolean('is_visible'));
        }

        // Filter by featured
        if ($request->has('is_featured')) {
            $query->where('is_featured', $request->boolean('is_featured'));
        }

        // Sort
        $sortBy = $request->get('sort_by', 'created_at');
        $sortOrder = $request->get('sort_order', 'desc');
        $query->orderBy($sortBy, $sortOrder);

        $services = $query->paginate($request->get('per_page', 20));

        return response()->json($services, 200);
    }

    public function adminShow($id)
    {
        $service = Service::with(['category'])->findOrFail($id);

        return response()->json([
            'service' => array_merge($service->toArray(), [
                'required_products_full' => $service->getRequiredProducts(),
                'optional_products_full' => $service->getOptionalProducts(),
                'related_services_data'  => $service->getRelatedServices(),
            ]),
        ], 200);
    }

    /**
     * Create new service (admin)
     */
    public function store(Request $request)
    {
        // Decode JSON strings from FormData
        $input = $request->all();
        
        // Decode pricing_tiers if it's a JSON string
        if (isset($input['pricing_tiers']) && is_string($input['pricing_tiers'])) {
            $input['pricing_tiers'] = json_decode($input['pricing_tiers'], true);
        }
        
        // Decode related items if they're JSON strings
        if (isset($input['related_services']) && is_string($input['related_services'])) {
            $input['related_services'] = json_decode($input['related_services'], true);
        }
        if (isset($input['required_products']) && is_string($input['required_products'])) {
            $input['required_products'] = json_decode($input['required_products'], true);
        }
        if (isset($input['optional_products']) && is_string($input['optional_products'])) {
            $input['optional_products'] = json_decode($input['optional_products'], true);
        }
        
        // Replace request data with decoded data
        $request->merge($input);

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'slug' => 'nullable|string|max:255|unique:services,slug',
            'sku' => 'nullable|string|max:255', // We'll handle uniqueness manually
            'category_id' => 'nullable|exists:service_categories,id',
            'service_category' => 'nullable|string|max:255',
            'type' => 'nullable|string|max:100',
            
            // Pricing
            'base_price' => 'nullable|numeric|min:0',
            'price_is_negotiable' => 'nullable|boolean',
            'pricing_model' => 'required|in:fixed,hourly,daily,project_based,subscription',
            'hourly_rate' => 'nullable|numeric|min:0',
            'daily_rate' => 'nullable|numeric|min:0',
            'minimum_charge' => 'nullable|numeric|min:0',
            
            // Description
            'description' => 'nullable|string',
            'short_description' => 'nullable|string',
            'features' => 'nullable|array',
            'deliverables' => 'nullable|array',
            'requirements' => 'nullable|array',
            
            // Service Details
            'estimated_duration' => 'nullable|string|max:100',
            'unit_of_measure' => 'nullable|string|max:50',
            'requires_site_visit' => 'nullable|boolean',
            'is_remote_available' => 'nullable|boolean',
            'service_area' => 'nullable|string',
            'max_concurrent_bookings' => 'nullable|integer',
            
            // Pricing Tiers
            'pricing_tiers' => 'nullable|array',
            
            // Media
            'main_image' => 'nullable|file|image|max:5120',
            'main_image_url' => 'nullable|url',
            'images' => 'nullable|array',
            'images.*' => 'nullable|file|image|max:5120',
            'image_urls' => 'nullable|array',
            'image_urls.*' => 'nullable|url',
            'brochure_url' => 'nullable|url',
            'video_url' => 'nullable|url',
            
            // Availability
            'is_available' => 'nullable|boolean',
            'status' => 'nullable|in:draft,active,inactive,discontinued',
            'is_visible' => 'nullable|boolean',
            'lead_time' => 'nullable|string|max:100',
            'booking_required' => 'nullable|boolean',
            
            // Related Items
            'related_services' => 'nullable|array',
            'required_products' => 'nullable|array',
            'optional_products' => 'nullable|array',
            
            // SEO
            'meta_title' => 'nullable|string|max:255',
            'meta_description' => 'nullable|string',
            'meta_keywords' => 'nullable|array',
            'badge' => 'nullable|string|max:255',
            'is_featured' => 'nullable|boolean',
            
            // Admin
            'admin_notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            $data = $request->except(['main_image', 'images', 'image_urls', 'main_image_url']);
            
            // Generate slug if not provided
            if (empty($data['slug'])) {
                $data['slug'] = Str::slug($request->name);
                $originalSlug = $data['slug'];
                $count = 1;
                while (Service::where('slug', $data['slug'])->exists()) {
                    $data['slug'] = $originalSlug . '-' . $count;
                    $count++;
                }
            }
            
            // Generate unique SKU if provided but already exists
            if (!empty($data['sku'])) {
                $originalSku = $data['sku'];
                $count = 1;
                while (Service::where('sku', $data['sku'])->exists()) {
                    $data['sku'] = $originalSku . '-' . $count;
                    $count++;
                }
            } else {
                // Auto-generate SKU if not provided
                $prefix = 'SRV';
                $latestService = Service::orderBy('id', 'desc')->first();
                $nextId = $latestService ? $latestService->id + 1 : 1;
                $data['sku'] = $prefix . '-' . str_pad($nextId, 5, '0', STR_PAD_LEFT);
                
                // Ensure uniqueness
                while (Service::where('sku', $data['sku'])->exists()) {
                    $nextId++;
                    $data['sku'] = $prefix . '-' . str_pad($nextId, 5, '0', STR_PAD_LEFT);
                }
            }
            
            // Set service_category name from category_id
            if (!empty($data['category_id'])) {
                $category = ServiceCategory::find($data['category_id']);
                if ($category) {
                    $data['service_category'] = $category->name;
                }
            }
            
            // Auto-generate meta info if not provided
            if (empty($data['meta_title'])) {
                $data['meta_title'] = $request->name;
            }
            if (empty($data['meta_description'])) {
                $data['meta_description'] = $request->short_description ?: Str::limit($request->description, 160);
            }
            if (empty($data['meta_keywords']) || !is_array($data['meta_keywords'])) {
                // Extract keywords from name and description
                $text = $request->name . ' ' . $request->description;
                $words = str_word_count(strtolower($text), 1);
                $keywords = array_unique(array_slice($words, 0, 10));
                $data['meta_keywords'] = $keywords;
            }
            
            $data['created_by'] = Auth::id();

            // Handle main image
            if ($request->hasFile('main_image')) {
                $path = $request->file('main_image')->store('services', 'public');
                $data['main_image'] = '/storage/' . $path;
            } elseif ($request->filled('main_image_url')) {
                $data['main_image'] = $request->main_image_url;
            }

            // Handle gallery images
            $imageArray = [];
            
            if ($request->hasFile('images')) {
                foreach ($request->file('images') as $image) {
                    $path = $image->store('services', 'public');
                    $imageArray[] = '/storage/' . $path;
                }
            }
            
            if ($request->filled('image_urls') && is_array($request->image_urls)) {
                foreach ($request->image_urls as $url) {
                    if (filter_var($url, FILTER_VALIDATE_URL)) {
                        $imageArray[] = $url;
                    }
                }
            }
            
            if (!empty($imageArray)) {
                $data['images'] = $imageArray;
            }

            // Set published_at if status is active
            if (isset($data['status']) && $data['status'] === 'active') {
                $data['published_at'] = now();
            }

            $service = Service::create($data);

            DB::commit();

            return response()->json([
                'message' => 'Service created successfully',
                'service' => $service->load('category')
            ], 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to create service',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Update service (admin)
     */
    public function update(Request $request, $id)
    {
        $service = Service::findOrFail($id);

        // Decode JSON strings from FormData
        $input = $request->all();
        
        // Decode pricing_tiers if it's a JSON string
        if (isset($input['pricing_tiers']) && is_string($input['pricing_tiers'])) {
            $input['pricing_tiers'] = json_decode($input['pricing_tiers'], true);
        }
        
        // Decode related items if they're JSON strings
        if (isset($input['related_services']) && is_string($input['related_services'])) {
            $input['related_services'] = json_decode($input['related_services'], true);
        }
        if (isset($input['required_products']) && is_string($input['required_products'])) {
            $input['required_products'] = json_decode($input['required_products'], true);
        }
        if (isset($input['optional_products']) && is_string($input['optional_products'])) {
            $input['optional_products'] = json_decode($input['optional_products'], true);
        }
        
        // Replace request data with decoded data
        $request->merge($input);

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|required|string|max:255',
            'slug' => 'nullable|string|max:255|unique:services,slug,' . $id,
            'sku' => 'nullable|string|max:255', // Handle uniqueness manually
            'category_id' => 'nullable|exists:service_categories,id',
            'service_category' => 'nullable|string|max:255',
            'type' => 'nullable|string|max:100',
            
            // Pricing
            'base_price' => 'nullable|numeric|min:0',
            'price_is_negotiable' => 'nullable|boolean',
            'pricing_model' => 'sometimes|required|in:fixed,hourly,daily,project_based,subscription',
            'hourly_rate' => 'nullable|numeric|min:0',
            'daily_rate' => 'nullable|numeric|min:0',
            'minimum_charge' => 'nullable|numeric|min:0',
            
            // Description
            'description' => 'nullable|string',
            'short_description' => 'nullable|string',
            'features' => 'nullable|array',
            'deliverables' => 'nullable|array',
            'requirements' => 'nullable|array',
            
            // Service Details
            'estimated_duration' => 'nullable|string|max:100',
            'unit_of_measure' => 'nullable|string|max:50',
            'requires_site_visit' => 'nullable|boolean',
            'is_remote_available' => 'nullable|boolean',
            'service_area' => 'nullable|string',
            'max_concurrent_bookings' => 'nullable|integer',
            
            // Pricing Tiers
            'pricing_tiers' => 'nullable|array',
            
            // Media
            'main_image' => 'nullable|file|image|max:5120',
            'main_image_url' => 'nullable|url',
            'images' => 'nullable|array',
            'images.*' => 'nullable|file|image|max:5120',
            'image_urls' => 'nullable|array',
            'image_urls.*' => 'nullable|url',
            'brochure_url' => 'nullable|url',
            'video_url' => 'nullable|url',
            
            // Availability
            'is_available' => 'nullable|boolean',
            'status' => 'nullable|in:draft,active,inactive,discontinued',
            'is_visible' => 'nullable|boolean',
            'lead_time' => 'nullable|string|max:100',
            'booking_required' => 'nullable|boolean',
            
            // Related Items
            'related_services' => 'nullable|array',
            'required_products' => 'nullable|array',
            'optional_products' => 'nullable|array',
            
            // SEO
            'meta_title' => 'nullable|string|max:255',
            'meta_description' => 'nullable|string',
            'meta_keywords' => 'nullable|array',
            'badge' => 'nullable|string|max:255',
            'is_featured' => 'nullable|boolean',
            
            // Admin
            'admin_notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            $data = $request->except(['main_image', 'images', 'image_urls', 'main_image_url']);
            
            // Handle SKU uniqueness if changed
            if (!empty($data['sku']) && $data['sku'] !== $service->sku) {
                $originalSku = $data['sku'];
                $count = 1;
                while (Service::where('sku', $data['sku'])->where('id', '!=', $id)->exists()) {
                    $data['sku'] = $originalSku . '-' . $count;
                    $count++;
                }
            }
            
            // Update service_category if category_id changed
            if (!empty($data['category_id']) && $data['category_id'] != $service->category_id) {
                $category = ServiceCategory::find($data['category_id']);
                if ($category) {
                    $data['service_category'] = $category->name;
                }
            }
            
            $data['updated_by'] = Auth::id();

            // Handle main image
            if ($request->hasFile('main_image')) {
                if ($service->main_image && Str::startsWith($service->main_image, '/storage/')) {
                    Storage::disk('public')->delete(str_replace('/storage/', '', $service->main_image));
                }
                $path = $request->file('main_image')->store('services', 'public');
                $data['main_image'] = '/storage/' . $path;
            } elseif ($request->filled('main_image_url')) {
                $data['main_image'] = $request->main_image_url;
            }

            // Handle gallery images
            if ($request->hasFile('images') || $request->filled('image_urls')) {
                $imageArray = [];
                
                if ($service->images && is_array($service->images)) {
                    $imageArray = $service->images;
                }
                
                if ($request->hasFile('images')) {
                    foreach ($request->file('images') as $image) {
                        $path = $image->store('services', 'public');
                        $imageArray[] = '/storage/' . $path;
                    }
                }
                
                if ($request->filled('image_urls') && is_array($request->image_urls)) {
                    foreach ($request->image_urls as $url) {
                        if (filter_var($url, FILTER_VALIDATE_URL)) {
                            $imageArray[] = $url;
                        }
                    }
                }
                
                $data['images'] = $imageArray;
            }

            // Set published_at if status changed to active
            if (isset($data['status']) && $data['status'] === 'active' && $service->status !== 'active') {
                $data['published_at'] = now();
            }

            $service->update($data);

            DB::commit();

            return response()->json([
                'message' => 'Service updated successfully',
                'service' => $service->fresh(['category'])
            ], 200);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to update service',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Delete service (admin) - soft delete
     */
    public function destroy($id)
    {
        $service = Service::findOrFail($id);
        $service->delete();

        return response()->json([
            'message' => 'Service deleted successfully'
        ], 200);
    }

    /**
     * Restore deleted service (admin)
     */
    public function restore($id)
    {
        $service = Service::withTrashed()->findOrFail($id);

        if (!$service->trashed()) {
            return response()->json([
                'message' => 'Service is not deleted'
            ], 422);
        }

        $service->restore();

        return response()->json([
            'message' => 'Service restored successfully',
            'service' => $service
        ], 200);
    }

    /**
     * Publish service (admin)
     */
    public function publish($id)
    {
        $service = Service::findOrFail($id);

        $service->update([
            'status' => 'active',
            'published_at' => now()
        ]);

        return response()->json([
            'message' => 'Service published successfully',
            'service' => $service
        ], 200);
    }

    /**
     * Unpublish service (admin)
     */
    public function unpublish($id)
    {
        $service = Service::findOrFail($id);

        $service->update([
            'status' => 'draft'
        ]);

        return response()->json([
            'message' => 'Service unpublished successfully',
            'service' => $service
        ], 200);
    }

    /**
     * Get service statistics (admin)
     */
    public function statistics()
    {
        $stats = [
            'total_services' => Service::count(),
            'active_services' => Service::where('status', 'active')->count(),
            'draft_services' => Service::where('status', 'draft')->count(),
            'inactive_services' => Service::where('status', 'inactive')->count(),
            'featured_services' => Service::where('is_featured', true)->count(),
        ];

        return response()->json($stats, 200);
    }
    
    /**
     * Get available services for selection (used in dropdowns)
     */
    public function getAvailableServices()
    {
        $services = Service::where('status', 'active')
            ->where('is_available', true)
            ->select('id', 'name', 'sku', 'pricing_model', 'base_price')
            ->orderBy('name')
            ->get();

        return response()->json($services, 200);
    }
    
    /**
     * Get available products for selection (used in dropdowns)
     */
    public function getAvailableProducts()
    {
        $products = Product::where('status', 'active')
            ->select('id', 'name', 'sku', 'price')
            ->orderBy('name')
            ->get();

        return response()->json($products, 200);
    }

    /**
     * Get trashed services (soft deleted)
     */
    public function trash(Request $request)
    {
        $query = Service::onlyTrashed()->with(['category']);

        // Search in trash
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('sku', 'like', "%{$search}%");
            });
        }

        // Sort
        $sortBy = $request->get('sort_by', 'deleted_at');
        $sortOrder = $request->get('sort_order', 'desc');
        $query->orderBy($sortBy, $sortOrder);

        $services = $query->paginate($request->get('per_page', 20));

        return response()->json($services, 200);
    }

    /**
     * Restore multiple services
     */
    public function restoreMultiple(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'ids' => 'required|array',
            'ids.*' => 'required|integer|exists:services,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            Service::onlyTrashed()
                ->whereIn('id', $request->ids)
                ->restore();

            return response()->json([
                'message' => count($request->ids) . ' service(s) restored successfully'
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to restore services',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Permanently delete multiple services (force delete)
     */
    public function forceDeleteMultiple(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'ids' => 'required|array',
            'ids.*' => 'required|integer|exists:services,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            $services = Service::onlyTrashed()
                ->whereIn('id', $request->ids)
                ->get();

            foreach ($services as $service) {
                // Delete associated images from storage
                if ($service->main_image && Str::startsWith($service->main_image, '/storage/')) {
                    Storage::disk('public')->delete(str_replace('/storage/', '', $service->main_image));
                }

                if ($service->images && is_array($service->images)) {
                    foreach ($service->images as $image) {
                        if (Str::startsWith($image, '/storage/')) {
                            Storage::disk('public')->delete(str_replace('/storage/', '', $image));
                        }
                    }
                }

                $service->forceDelete();
            }

            DB::commit();

            return response()->json([
                'message' => count($request->ids) . ' service(s) permanently deleted'
            ], 200);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to delete services',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}