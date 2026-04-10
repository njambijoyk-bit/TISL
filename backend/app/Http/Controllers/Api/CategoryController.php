<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class CategoryController extends Controller
{
    /**
     * Get all categories with hierarchy (PUBLIC)
     */
    public function index(Request $request)
    {
        if ($request->has('hierarchy')) {
            // Get main categories with children
            $categories = Category::with('childrenRecursive')
                ->active()
                ->main()
                ->ordered()
                ->get();
        } else {
            // Get all categories flat (for admin)
            $categories = Category::with('parent')
                ->ordered()
                ->get();
        }

        return response()->json(['data' => $categories], 200);
    }

    /**
     * Store a new category (ADMIN ONLY)
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255|unique:categories,name',
            'slug' => 'required|string|max:255|unique:categories,slug',
            'parent_id' => 'nullable|exists:categories,id',
            'description' => 'nullable|string',
            'image' => 'nullable|image|mimes:jpeg,png,jpg,webp,svg|max:5120', // 5MB
            'image_url' => 'nullable|url',
            'sort_order' => 'nullable|integer',
            'is_active' => 'nullable|boolean',
            'meta_data' => 'nullable|json',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            // Handle image upload
            $imageUrl = null;
            if ($request->hasFile('image')) {
                $path = $request->file('image')->store('categories', 'public');
                $imageUrl = Storage::url($path);
            } elseif ($request->image_url) {
                $imageUrl = $request->image_url;
            }

            // Parse meta_data if it's a JSON string
            $metaData = $request->meta_data;
            if (is_string($metaData)) {
                $metaData = json_decode($metaData, true);
            }

            // Convert is_active from string to boolean
            $isActive = $request->is_active;
            if (is_string($isActive)) {
                $isActive = $isActive === '1' || $isActive === 'true';
            }

            $category = Category::create([
                'name' => $request->name,
                'slug' => $request->slug,
                'parent_id' => $request->parent_id,
                'description' => $request->description,
                'image_url' => $imageUrl,
                'sort_order' => $request->sort_order ?? 0,
                'is_active' => $isActive ?? true,
                'meta_data' => $metaData,
            ]);

            return response()->json([
                'message' => 'Category created successfully',
                'data' => $category->load('parent')
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to create category',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get single category with products (PUBLIC)
     */
    public function show($id)
    {
        $category = Category::with(['children', 'parent'])->findOrFail($id);

        return response()->json([
            'data' => $category
        ], 200);
    }

    /**
     * Update category (ADMIN ONLY)
     */
    public function update(Request $request, $id)
    {
        $category = Category::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|string|max:255|unique:categories,name,' . $id,
            'slug' => 'sometimes|string|max:255|unique:categories,slug,' . $id,
            'parent_id' => 'nullable|exists:categories,id',
            'description' => 'nullable|string',
            'image' => 'nullable|image|mimes:jpeg,png,jpg,webp,svg|max:5120',
            'image_url' => 'nullable|url',
            'sort_order' => 'nullable|integer',
            'is_active' => 'nullable|boolean',
            'meta_data' => 'nullable|json',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            // Handle image upload
            if ($request->hasFile('image')) {
            // Delete old image if exists
            if ($category->image_url) {
                // Extract the actual storage path from the URL
                // /storage/categories/file.jpg → categories/file.jpg
                $oldPath = str_replace('/storage/', '', $category->image_url);
                
                if (Storage::disk('public')->exists($oldPath)) {
                    Storage::disk('public')->delete($oldPath);
                }
            }
            
            // Store new image
            $path = $request->file('image')->store('categories', 'public');
            $category->image_url = Storage::url($path);
        } elseif ($request->has('image_url')) {
            $category->image_url = $request->image_url;
        }
        
            // Parse meta_data if it's a JSON string
            if ($request->has('meta_data')) {
                $metaData = $request->meta_data;
                if (is_string($metaData)) {
                    $metaData = json_decode($metaData, true);
                }
                $category->meta_data = $metaData;
            }

            // Convert is_active from string to boolean
            if ($request->has('is_active')) {
                $isActive = $request->is_active;
                if (is_string($isActive)) {
                    $isActive = $isActive === '1' || $isActive === 'true';
                }
                $category->is_active = $isActive;
            }

            // Update other fields
            if ($request->has('name')) $category->name = $request->name;
            if ($request->has('slug')) $category->slug = $request->slug;
            if ($request->has('description')) $category->description = $request->description;
            if ($request->has('parent_id')) $category->parent_id = $request->parent_id;
            if ($request->has('sort_order')) $category->sort_order = $request->sort_order;

            $category->save();

            return response()->json([
                'message' => 'Category updated successfully',
                'data' => $category->load('parent')
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to update category',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Delete category (ADMIN ONLY)
     */
    public function destroy($id)
    {
        try {
            $category = Category::findOrFail($id);

            // Check if category has children
            $childrenCount = $category->children()->count();
            if ($childrenCount > 0) {
                return response()->json([
                    'message' => 'Cannot delete category with ' . $childrenCount . ' subcategories. Please delete subcategories first.'
                ], 400);
            }

            // Check if category has products
            $productsCount = $category->products()->count();
            if ($productsCount > 0) {
                return response()->json([
                    'message' => 'Cannot delete category with ' . $productsCount . ' products. Please reassign or delete products first.'
                ], 400);
            }
                // Delete associated image if exists
            if ($category->image_url) {
            // Extract the actual storage path from the URL
            // /storage/categories/file.jpg → categories/file.jpg
            $imagePath = str_replace('/storage/', '', $category->image_url);
            
            if (Storage::disk('public')->exists($imagePath)) {
                Storage::disk('public')->delete($imagePath);
            }
        }

            $category->delete();

            return response()->json([
                'message' => 'Category deleted successfully'
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to delete category',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get main categories (PUBLIC)
     */
    public function main()
    {
        $categories = Category::active()
            ->main()
            ->ordered()
            ->withCount('products')
            ->get();

        return response()->json(['data' => $categories], 200);
    }

    /**
     * Get subcategories of a category (PUBLIC)
     */
    public function subcategories($id)
    {
        $category = Category::findOrFail($id);
        $subcategories = $category->children()
            ->active()
            ->ordered()
            ->withCount('products')
            ->get();

        return response()->json(['data' => $subcategories], 200);
    }
}