<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ServiceCategory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;

class ServiceCategoryController extends Controller
{
    // ========================================
    // PUBLIC ROUTES (No Authentication)
    // ========================================

    /**
     * Get all active service categories
     */
    public function index(Request $request)
    {
        $query = ServiceCategory::with('children')->active();

        // Search
        if ($request->has('search')) {
            $query->search($request->search);
        }

        // Parent categories only
        if ($request->boolean('parents_only')) {
            $query->parents();
        }

        // Sort
        $query->ordered();

        // Paginate or get all
        if ($request->boolean('all')) {
            $categories = $query->get();
            return response()->json($categories, 200);
        }

        $categories = $query->paginate($request->get('per_page', 20));
        return response()->json($categories, 200);
    }

    /**
     * Get main/parent categories
     */
    public function main()
    {
        $categories = ServiceCategory::with('children')
            ->active()
            ->parents()
            ->ordered()
            ->get();

        return response()->json($categories, 200);
    }

    /**
     * Get single category with services
     */
    public function show($id)
    {
        $category = ServiceCategory::with(['children', 'services' => function($query) {
            $query->active()->visible();
        }])->findOrFail($id);

        return response()->json($category, 200);
    }

    /**
     * Get subcategories of a category
     */
    public function subcategories($id)
    {
        $category = ServiceCategory::findOrFail($id);
        $subcategories = $category->children()
            ->active()
            ->ordered()
            ->get();

        return response()->json($subcategories, 200);
    }

    // ========================================
    // ADMIN ROUTES
    // ========================================

    /**
     * Get all categories (admin)
     */
    public function adminIndex(Request $request)
    {
        $query = ServiceCategory::with(['parent', 'children']);

        // Search
        if ($request->has('search')) {
            $query->search($request->search);
        }

        // Filter by active/inactive
        if ($request->has('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        // Filter by parent
        if ($request->has('parent_id')) {
            if ($request->parent_id === 'null') {
                $query->whereNull('parent_id');
            } else {
                $query->where('parent_id', $request->parent_id);
            }
        }

        // Sort
        $sortBy = $request->get('sort_by', 'display_order');
        $sortOrder = $request->get('sort_order', 'asc');
        $query->orderBy($sortBy, $sortOrder);

        $categories = $query->paginate($request->get('per_page', 20));

        return response()->json($categories, 200);
    }

    /**
     * Create new category (admin)
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'slug' => 'nullable|string|max:255|unique:service_categories,slug',
            'parent_id' => 'nullable|exists:service_categories,id',
            'description' => 'nullable|string',
            'icon' => 'nullable|string|max:255',
            'color' => 'nullable|string|max:50',
            'display_order' => 'nullable|integer',
            'is_active' => 'nullable|boolean',
            'meta_title' => 'nullable|string|max:255',
            'meta_description' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $category = ServiceCategory::create($request->all());

        return response()->json([
            'message' => 'Service category created successfully',
            'category' => $category->load('parent')
        ], 201);
    }

    /**
     * Update category (admin)
     */
    public function update(Request $request, $id)
    {
        $category = ServiceCategory::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|required|string|max:255',
            'slug' => 'nullable|string|max:255|unique:service_categories,slug,' . $id,
            'parent_id' => 'nullable|exists:service_categories,id',
            'description' => 'nullable|string',
            'icon' => 'nullable|string|max:255',
            'color' => 'nullable|string|max:50',
            'display_order' => 'nullable|integer',
            'is_active' => 'nullable|boolean',
            'meta_title' => 'nullable|string|max:255',
            'meta_description' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Prevent category from being its own parent
        if ($request->has('parent_id') && $request->parent_id == $id) {
            return response()->json([
                'message' => 'A category cannot be its own parent'
            ], 422);
        }

        // Prevent circular reference
        if ($request->has('parent_id') && $request->parent_id) {
            $parent = ServiceCategory::find($request->parent_id);
            if ($parent && $parent->parent_id == $id) {
                return response()->json([
                    'message' => 'This would create a circular reference'
                ], 422);
            }
        }

        $category->update($request->all());

        return response()->json([
            'message' => 'Service category updated successfully',
            'category' => $category->load('parent', 'children')
        ], 200);
    }

    /**
     * Delete category (admin)
     */
    public function destroy($id)
    {
        $category = ServiceCategory::findOrFail($id);

        // Check if has children
        if ($category->children()->count() > 0) {
            return response()->json([
                'message' => 'Cannot delete category with subcategories. Please delete or reassign subcategories first.'
            ], 422);
        }

        // Check if has services
        if ($category->services()->count() > 0) {
            return response()->json([
                'message' => 'Cannot delete category with services. Please reassign services first.'
            ], 422);
        }

        $category->delete();

        return response()->json([
            'message' => 'Service category deleted successfully'
        ], 200);
    }

    /**
     * Reorder categories (admin)
     */
    public function reorder(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'categories' => 'required|array',
            'categories.*.id' => 'required|exists:service_categories,id',
            'categories.*.display_order' => 'required|integer',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            foreach ($request->categories as $categoryData) {
                ServiceCategory::where('id', $categoryData['id'])
                    ->update(['display_order' => $categoryData['display_order']]);
            }

            DB::commit();

            return response()->json([
                'message' => 'Categories reordered successfully'
            ], 200);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to reorder categories',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}