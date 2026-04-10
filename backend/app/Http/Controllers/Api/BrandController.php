<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class BrandController extends Controller
{
    /**
     * Get all brands (PUBLIC)
     */
    public function index()
    {
        $brands = Brand::active()
            ->ordered()
            ->withCount('products')
            ->get();

        return response()->json($brands, 200);
    }
    // NEW method for admin (shows ALL brands)
public function adminIndex()
{
    $brands = Brand::ordered()  // No ->active() !
        ->withCount('products')
        ->get();
    return response()->json($brands, 200);
}

    /**
     * Store a new brand (ADMIN ONLY)
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255|unique:brands,name',
            'slug' => 'sometimes|string|max:255|unique:brands,slug',
            'description' => 'nullable|string',
            'website' => 'nullable|url',
            'logo' => 'nullable|image|mimes:jpeg,png,jpg,webp,svg|max:5120',
            'logo_url' => 'nullable|url',
            'is_featured' => 'nullable|boolean',
            'is_active' => 'nullable|boolean',
            'sort_order' => 'nullable|integer',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            // Generate slug if not provided
            $slug = $request->slug ?? Str::slug($request->name);
            
            // Handle logo upload
            $logoUrl = null;
            if ($request->hasFile('logo')) {
                $path = $request->file('logo')->store('brands', 'public');
                $logoUrl = Storage::url($path);
            } elseif ($request->has('logo_url')) {
                $logoUrl = $request->logo_url;
            }
            
            // Convert is_active and is_featured
            $isActive = $request->has('is_active') 
                ? ($request->is_active === '1' || $request->is_active === 'true' || $request->is_active === true)
                : true;
                
            $isFeatured = $request->has('is_featured')
                ? ($request->is_featured === '1' || $request->is_featured === 'true' || $request->is_featured === true)
                : false;
            
            $brand = Brand::create([
                'name' => $request->name,
                'slug' => $slug,
                'description' => $request->description,
                'website' => $request->website,
                'logo_url' => $logoUrl,
                'is_active' => $isActive,
                'is_featured' => $isFeatured,
                'sort_order' => $request->sort_order ?? 0,
            ]);

            return response()->json([
                'message' => 'Brand created successfully',
                'brand' => $brand
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to create brand',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get single brand with products (PUBLIC)
     */
    public function show($id)
    {
        $brand = Brand::findOrFail($id);

        // Get products for this brand (only for detail view)
        // For admin edit, we just need the brand data
        if (request()->wantsJson() && !request()->is('api/admin/*')) {
            $products = $brand->products()
                ->with(['category'])
                ->active()
                ->inStock()
                ->paginate(20);

            return response()->json([
                'brand' => $brand,
                'products' => $products
            ], 200);
        }

        return response()->json($brand, 200);
    }

    /**
     * Update brand (ADMIN ONLY)
     */
    public function update(Request $request, $id)
    {
        $brand = Brand::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|string|max:255|unique:brands,name,' . $id,
            'slug' => 'sometimes|string|max:255|unique:brands,slug,' . $id,
            'description' => 'nullable|string',
            'website' => 'nullable|url',
            'logo' => 'nullable|image|mimes:jpeg,png,jpg,webp,svg|max:5120',
            'logo_url' => 'nullable|url',
            'is_featured' => 'nullable|boolean',
            'is_active' => 'nullable|boolean',
            'sort_order' => 'nullable|integer',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            // Handle logo upload
            if ($request->hasFile('logo')) {
                // Delete old logo if exists
                if ($brand->logo_url) {
                    $oldPath = str_replace('/storage/', '', $brand->logo_url);
                    if (Storage::disk('public')->exists($oldPath)) {
                        Storage::disk('public')->delete($oldPath);
                    }
                }
                
                $path = $request->file('logo')->store('brands', 'public');
                $brand->logo_url = Storage::url($path);
            } elseif ($request->has('logo_url')) {
                $brand->logo_url = $request->logo_url;
            }

            // Update other fields
            if ($request->has('name')) {
                $brand->name = $request->name;
                // Auto-update slug if name changed
                if (!$request->has('slug')) {
                    $brand->slug = Str::slug($request->name);
                }
            }
            
            if ($request->has('slug')) $brand->slug = $request->slug;
            if ($request->has('description')) $brand->description = $request->description;
            if ($request->has('website')) $brand->website = $request->website;
            if ($request->has('sort_order')) $brand->sort_order = $request->sort_order;
            
            // Convert is_active from string to boolean
            if ($request->has('is_active')) {
                $isActive = $request->is_active;
                if (is_string($isActive)) {
                    $isActive = $isActive === '1' || $isActive === 'true';
                }
                $brand->is_active = $isActive;
            }
            
            // Convert is_featured from string to boolean
            if ($request->has('is_featured')) {
                $isFeatured = $request->is_featured;
                if (is_string($isFeatured)) {
                    $isFeatured = $isFeatured === '1' || $isFeatured === 'true';
                }
                $brand->is_featured = $isFeatured;
            }

            $brand->save();

            return response()->json([
                'message' => 'Brand updated successfully',
                'brand' => $brand
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to update brand',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Delete brand (ADMIN ONLY)
     */
    public function destroy($id)
    {
        try {
            $brand = Brand::findOrFail($id);

            // Check if brand has products
            $productsCount = $brand->products()->count();
            if ($productsCount > 0) {
                return response()->json([
                    'message' => 'Cannot delete brand with ' . $productsCount . ' products. Please reassign or delete products first.'
                ], 400);
            }

            // Delete logo if exists
            if ($brand->logo_url) {
                $logoPath = str_replace('/storage/', '', $brand->logo_url);
                if (Storage::disk('public')->exists($logoPath)) {
                    Storage::disk('public')->delete($logoPath);
                }
            }

            $brand->delete();

            return response()->json([
                'message' => 'Brand deleted successfully'
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to delete brand',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get featured brands (PUBLIC)
     */
    public function featured()
    {
        $brands = Brand::active()
            ->featured()
            ->ordered()
            ->withCount('products')
            ->get();

        return response()->json($brands, 200);
    }
}