<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Brand;
use App\Models\Category;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Auth;

class ProductController extends Controller
{
    /**
     * Get all products for ADMIN (including inactive)
     */
    public function adminIndex(Request $request)
    {
        $query = Product::with(['brand', 'category', 'activeAuction']);

        // Search
        if ($request->has('search')) {
            $query->search($request->search);
        }

        // Filter by category
        if ($request->has('category_id')) {
            $query->inCategory($request->category_id);
        }

        // Filter by brand
        if ($request->has('brand_id')) {
            $query->byBrand($request->brand_id);
        }

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        // Sort
        $sortBy = $request->get('sort_by', 'created_at');
        $sortOrder = $request->get('sort_order', 'desc');
        $query->orderBy($sortBy, $sortOrder);

        // Paginate
        $perPage = $request->get('per_page', 20);
        $products = $query->paginate($perPage);

        return response()->json($products, 200);
    }

    public function adminShow($id)
    {
        $product = Product::with(['brand', 'category', 'activeAuction'])->findOrFail($id);

        $relatedProductsData = collect([]);
        if (!empty($product->related_products)) {
            $relatedProductsData = Product::with(['brand', 'category'])
                ->whereIn('id', $product->related_products)
                ->where('id', '!=', $id)
                ->get(['id', 'name', 'sku', 'price', 'main_image', 'slug']);
        }

        return response()->json([
            'product' => array_merge($product->toArray(), [
                'related_products_data' => $relatedProductsData,
            ]),
            // also expose at top level so the res.related_products fallback works too
            'related_products_data' => $relatedProductsData,
        ], 200);
    }

    /**
     * Display a listing of products (PUBLIC - with filters)
     */
    public function index(Request $request)
{
    // Only filter by is_visible = 1 (no stock checking)
    $query = Product::with(['brand', 'category', 'activeAuction'])
        ->where('is_visible', true)
        ->where('status', 'active');

    // Search
    if ($request->filled('search')) {
        $query->search($request->search);
    }

    // Filter by category
    if ($request->filled('category_id')) {
        $query->inCategory($request->category_id);
    }

    // Filter by brand
    if ($request->filled('brand_id')) {
        $query->byBrand($request->brand_id);
    }

    // Filter by price range
    if ($request->filled('min_price') && $request->filled('max_price')) {
        $query->priceRange($request->min_price, $request->max_price);
    }

    // Filter by featured
    if ($request->filled('featured') && filter_var($request->featured, FILTER_VALIDATE_BOOLEAN)) {
        $query->where('is_featured', true);
    }

    // Filter by on sale
    if ($request->filled('on_sale') && filter_var($request->on_sale, FILTER_VALIDATE_BOOLEAN)) {
        $query->where('on_sale', true);
    }

    // Filter by new
    if ($request->has('new') && $request->new === 'true') {
        $query->where('is_new', true);
    }

    // Sort handling
    if ($request->filled('sort')) {
        $sortParts = explode('_', $request->sort);
        $sortOrder = array_pop($sortParts);
        $sortBy = implode('_', $sortParts);
        $query->orderBy($sortBy, $sortOrder);
    } else {
        $query->orderBy('created_at', 'desc');
    }

    // Paginate
    $perPage = $request->get('per_page', 20);
    $products = $query->paginate($perPage);

    return response()->json($products, 200);
}

    /**
     * Store a newly created product (ADMIN ONLY)
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'sku' => 'required|string|unique:products,sku',
            'category_id' => 'required|exists:categories,id',
            'brand_id' => 'nullable|exists:brands,id',
            'price' => 'required|numeric|min:0',
            'main_image' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'images.*' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            // Handle main image (file or URL)
            $mainImagePath = null;
            if ($request->hasFile('main_image')) {
                $path = $request->file('main_image')->store('products', 'public');
                // Save as storage-relative path (leading /storage/...), not absolute URL
                $mainImagePath = '/storage/' . ltrim($path, '/');
            } elseif ($request->has('main_image_url') && $request->main_image_url) {
                $mainImagePath = $request->main_image_url;
            }

            // Handle additional images (files or URLs)
            $additionalImages = [];
            if ($request->hasFile('images')) {
                foreach ($request->file('images') as $image) {
                    $path = $image->store('products', 'public');
                    // Save storage-relative path
                    $additionalImages[] = '/storage/' . ltrim($path, '/');
                }
            } elseif ($request->has('additional_image_urls') && $request->additional_image_urls) {
                $urls = json_decode($request->additional_image_urls, true);
                if (is_array($urls)) {
                    $additionalImages = array_slice($urls, 0, 5);
                }
            }

            // Parse JSON fields
            $features = $request->has('features') ? json_decode($request->features, true) : null;
            $specifications = $request->has('specifications') ? json_decode($request->specifications, true) : null;
            $variants = $request->has('variants') ? json_decode($request->variants, true) : null;
            $relatedProducts = $request->has('related_products') ? json_decode($request->related_products, true) : null;
            $metaKeywords = $request->has('meta_keywords') ? json_decode($request->meta_keywords, true) : null;

            // Convert boolean strings
            $isActive = $request->has('is_visible') 
                ? ($request->is_visible === '1' || $request->is_visible === 'true' || $request->is_visible === true)
                : true;

            $isFeatured = $request->has('is_featured')
                ? ($request->is_featured === '1' || $request->is_featured === 'true' || $request->is_featured === true)
                : false;

            $isNew = $request->has('is_new')
                ? ($request->is_new === '1' || $request->is_new === 'true' || $request->is_new === true)
                : false;

            $onSale = $request->has('on_sale')
                ? ($request->on_sale === '1' || $request->on_sale === 'true' || $request->on_sale === true)
                : false;

            $hasVariants = $request->has('has_variants')
                ? ($request->has_variants === '1' || $request->has_variants === 'true' || $request->has_variants === true)
                : false;

            $priceNegotiable = $request->has('price_is_negotiable')
                ? ($request->price_is_negotiable === '1' || $request->price_is_negotiable === 'true' || $request->price_is_negotiable === true)
                : false;

            $inStock = $request->has('in_stock')
                ? ($request->in_stock === '1' || $request->in_stock === 'true' || $request->in_stock === true)
                : true;

            // Create product
            $product = Product::create([
                'name' => $request->name,
                'slug' => Str::slug($request->name),
                'sku' => $request->sku,
                'type' => $request->type,
                'category_id' => $request->category_id,
                'brand_id' => $request->brand_id,
                'price' => $request->price,
                'original_price' => $request->original_price,
                'price_is_negotiable' => $priceNegotiable,
                'in_stock' => $inStock,
                'stock_quantity' => $request->stock_quantity ?? 0,
                'description' => $request->description,
                'short_description' => $request->short_description,
                'main_image' => $mainImagePath,
                'images' => !empty($additionalImages) ? $additionalImages : null,
                'features' => $features,
                'specifications' => $specifications,
                'variants' => $variants,
                'has_variants' => $hasVariants,
                'related_products' => $relatedProducts,
                'badge' => $request->badge,
                'is_featured' => $isFeatured,
                'is_new' => $isNew,
                'on_sale' => $onSale,
                'status' => $request->status ?? 'active',
                'is_visible' => $isActive,
                'meta_title' => $request->meta_title,
                'meta_description' => $request->meta_description,
                'meta_keywords' => $metaKeywords,
                'admin_notes' => $request->admin_notes,
                'created_by' => Auth::id(),
            ]);

            return response()->json([
                'message' => 'Product created successfully',
                'product' => $product->load(['brand', 'category'])
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to create product',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Display the specified product with full details (PUBLIC)
     */
    public function show($id)
    {
        try {
            $product = Product::with([
                'brand',
                'category',
                'activeAuction',
                'reviews' => function($query) {
                    $query->where('is_approved', true)  // Changed from status
                        ->with(['user:id,name,email', 'user.customer:id,user_id,first_name,last_name,profile_image'])
                        ->orderBy('created_at', 'desc');
                }
            ])
            ->where('is_visible', true)
            ->findOrFail($id);

            // Increment view count
            if (method_exists($product, 'incrementViewCount')) {
                $product->incrementViewCount();
            }

            // Calculate average rating
            $avgRating = $product->reviews()
                ->where('is_approved', true)  // Changed from status
                ->avg('rating');
            
            // Get rating breakdown (count per star)
            $ratingBreakdown = $product->reviews()
                ->where('is_approved', true)  // Changed from status
                ->selectRaw('rating, COUNT(*) as count')
                ->groupBy('rating')
                ->orderBy('rating', 'desc')
                ->pluck('count', 'rating')
                ->toArray();

            // Total reviews count
            $totalReviews = $product->reviews()
                ->where('is_approved', true)
                ->count();

            // Get related products (same category, excluding current)
            $relatedProducts = Product::with(['brand', 'category'])
                ->where('is_visible', true)
                ->where('category_id', $product->category_id)
                ->where('id', '!=', $product->id)
                ->limit(8)
                ->get();

            // Calculate discount percentage
            $discountPercentage = 0;
            if ($product->original_price && $product->on_sale && $product->original_price > $product->price) {
                $discountPercentage = round((($product->original_price - $product->price) / $product->original_price) * 100);
            }

            return response()->json([
                'product' => [
                    // Basic Info
                    'id' => $product->id,
                    'name' => $product->name,
                    'slug' => $product->slug,
                    'sku' => $product->sku,
                    
                    // Descriptions
                    'description' => $product->description,
                    'short_description' => $product->short_description,
                    
                    // Pricing
                    'price' => $product->price,
                    'original_price' => $product->original_price,
                    'price_is_negotiable' => $product->price_is_negotiable,
                    'on_sale' => $product->on_sale,
                    'discount_percentage' => $discountPercentage,
                    
                    // Stock
                    'in_stock' => $product->in_stock,
                    'stock_quantity' => $product->stock_quantity,
                    
                    'active_auction' => $product->activeAuction ? [
                        'id' => $product->activeAuction->id,
                        'status' => $product->activeAuction->status,
                        'current_bid' => $product->activeAuction->current_bid,
                        'start_price' => $product->activeAuction->start_price,
                        'ends_at' => $product->activeAuction->ends_at,
                    ] : null,
                    
                    // Images
                    'main_image' => $product->main_image,
                    'images' => $product->images ?? [],
                    
                    // Features & Specifications
                    'features' => $product->features ?? [],
                    'specifications' => $product->specifications ?? [],
                    
                    // Variants
                    'has_variants' => $product->has_variants,
                    'variants' => $product->variants ?? [],
                    
                    // Categories & Brand
                    'category' => $product->category ? [
                        'id' => $product->category->id,
                        'name' => $product->category->name,
                        'slug' => $product->category->slug,
                    ] : null,
                    'brand' => $product->brand ? [
                        'id' => $product->brand->id,
                        'name' => $product->brand->name,
                        'slug' => $product->brand->slug ?? null,
                        'logo' => $product->brand->logo ?? null,
                    ] : null,
                    
                    // Badges & Status
                    'badge' => $product->badge,
                    'is_featured' => $product->is_featured,
                    'is_new' => $product->is_new,
                    
                    // Ratings & Reviews
                    'average_rating' => round($avgRating ?? 0, 1),
                    'total_reviews' => $totalReviews,
                    'rating_breakdown' => [
                        '5' => $ratingBreakdown[5] ?? 0,
                        '4' => $ratingBreakdown[4] ?? 0,
                        '3' => $ratingBreakdown[3] ?? 0,
                        '2' => $ratingBreakdown[2] ?? 0,
                        '1' => $ratingBreakdown[1] ?? 0,
                    ],
                    
                    // Reviews (first 5)
                    'reviews' => $product->reviews()->where('is_approved', true)->get()->map(function($review) {
                        return [
                            'id' => $review->id,
                            'rating' => $review->rating,
                            'comment' => $review->comment,
                            'user_name' => $review->user->name ?? 'Anonymous',
                            'user_id' => $review->user_id,
                            'created_at' => $review->created_at->format('M d, Y'),
                            'helpful_count' => $review->helpful_count ?? 0,
                        ];
                    }),
                    
                    // Meta
                    'view_count' => $product->view_count ?? 0,
                    'created_at' => $product->created_at->format('M d, Y'),
                ],
                
                // Related Products
                'related_products' => $relatedProducts->map(function($item) {
                    $itemAvgRating = $item->reviews()->where('is_approved', true)->avg('rating');
                    $itemTotalReviews = $item->reviews()->where('is_approved', true)->count();
                    
                    return [
                        'id' => $item->id,
                        'name' => $item->name,
                        'slug' => $item->slug,
                        'price' => $item->price,
                        'original_price' => $item->original_price,
                        'price_is_negotiable' => $item->price_is_negotiable,
                        'main_image' => $item->main_image,
                        'average_rating' => round($itemAvgRating ?? 0, 1),
                        'total_reviews' => $itemTotalReviews,
                        'in_stock' => $item->in_stock,
                        'badge' => $item->badge,
                        'on_sale' => $item->on_sale,
                        'brand' => $item->brand ? [
                            'id' => $item->brand->id,
                            'name' => $item->brand->name
                        ] : null,
                    ];
                }),
            ], 200);
            
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Product not found',
                'error' => $e->getMessage()
            ], 404);
        }
    }

    /**
     * Update the specified product (ADMIN ONLY)
     */
    public function update(Request $request, $id)
    {
        $product = Product::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'name' => 'string|max:255',
            'sku' => 'string|unique:products,sku,' . $id,
            'category_id' => 'exists:categories,id',
            'brand_id' => 'nullable|exists:brands,id',
            'price' => 'numeric|min:0',
            'main_image' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'images.*' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'additional_image_urls' => 'nullable|string', // expect JSON array string or newline-separated from frontend
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            // Helper to convert any incoming URL that contains "/storage/" into a storage-relative path
            $toStorageRelative = function ($value) {
                if (!$value) return $value;
                // If contains '/storage/' return substring from that point (keeps leading /)
                $pos = strpos($value, '/storage/');
                if ($pos !== false) {
                    return substr($value, $pos);
                }
                // otherwise return as-is (external URL)
                return $value;
            };

            // Handle main image upload
            if ($request->hasFile('main_image')) {
                // User uploaded NEW file - delete old and use new
                // Delete old image if it's a stored file
                if ($product->main_image && str_starts_with($product->main_image, '/storage/')) {
                    $oldPath = str_replace('/storage/', '', $product->main_image);
                    if (Storage::disk('public')->exists($oldPath)) {
                        Storage::disk('public')->delete($oldPath);
                    }
                }
                
                $path = $request->file('main_image')->store('products', 'public');
                // store storage-relative path
                $product->main_image = '/storage/' . ltrim($path, '/');
            } elseif ($request->has('main_image_url') && $request->main_image_url) {
                // User entered NEW external URL - use it
                $product->main_image = $request->main_image_url;
            }
            // If neither: Keep existing image (don't change)

            // --- Improved images handling: allow mixing existing kept URLs, external URLs, and new uploaded files ---
            // existing images stored in DB (may be array or null)
            $existing = $product->images && is_array($product->images) ? $product->images : [];

            // Parse keep list from request (frontend should send desired existing URLs + external URLs as JSON array)
            $keepImages = [];
            if ($request->has('additional_image_urls') && $request->additional_image_urls) {
                // allow frontend to send either JSON array string or newline-separated values
                $decoded = json_decode($request->additional_image_urls, true);
                if (is_array($decoded)) {
                    $rawKeep = $decoded;
                } else {
                    // try parse as newline-separated
                    $rawKeep = array_values(array_filter(array_map('trim', explode("\n", $request->additional_image_urls))));
                }

                // Normalize any absolute URLs containing /storage/ -> storage-relative so comparisons match DB
                $keepImages = array_map($toStorageRelative, array_values($rawKeep));
                // Respect max images
                $keepImages = array_slice($keepImages, 0, 5);
            }

            // Handle uploaded new files (these will be appended)
            $uploadedImages = [];
            if ($request->hasFile('images')) {
                foreach ($request->file('images') as $image) {
                    $path = $image->store('products', 'public');
                    // store storage-relative path
                    $uploadedImages[] = '/storage/' . ltrim($path, '/');
                }
            }

            // If either a keep list or uploaded images exist, we need to:
            // - delete old stored files that are NOT in keepImages (user removed them)
            // - set final images to keepImages + uploadedImages (respect max 5)
            if (!empty($keepImages) || !empty($uploadedImages)) {
                // delete old stored images that user did not keep
                foreach ($existing as $oldImage) {
                    if (str_starts_with($oldImage, '/storage/')) {
                        // if old image not present in keepImages (exact match), delete it
                        if (!in_array($oldImage, $keepImages, true)) {
                            $oldPath = str_replace('/storage/', '', $oldImage);
                            if (Storage::disk('public')->exists($oldPath)) {
                                Storage::disk('public')->delete($oldPath);
                            }
                        }
                    }
                }

                // Merge keepImages (which may contain storage paths or external URLs) with uploaded images
                $finalImages = array_values(array_slice(array_merge($keepImages, $uploadedImages), 0, 5));
                $product->images = $finalImages;
            }
            // If neither keepImages nor uploadedImages provided: keep existing images as-is (no change)
            // --------------------------------------------------------------------

            // Parse JSON fields
            if ($request->has('features')) {
                $product->features = json_decode($request->features, true);
            }
            
            if ($request->has('specifications')) {
                $product->specifications = json_decode($request->specifications, true);
            }
            
            if ($request->has('variants')) {
                $product->variants = json_decode($request->variants, true);
            }
            
            if ($request->has('related_products')) {
                $product->related_products = json_decode($request->related_products, true);
            }
            
            if ($request->has('meta_keywords')) {
                $product->meta_keywords = json_decode($request->meta_keywords, true);
            }

            // Convert boolean strings
            if ($request->has('is_visible')) {
                $isActive = $request->is_visible;
                if (is_string($isActive)) {
                    $isActive = $isActive === '1' || $isActive === 'true';
                }
                $product->is_visible = $isActive;
            }

            if ($request->has('is_featured')) {
                $isFeatured = $request->is_featured;
                if (is_string($isFeatured)) {
                    $isFeatured = $isFeatured === '1' || $isFeatured === 'true';
                }
                $product->is_featured = $isFeatured;
            }

            if ($request->has('is_new')) {
                $isNew = $request->is_new;
                if (is_string($isNew)) {
                    $isNew = $isNew === '1' || $isNew === 'true';
                }
                $product->is_new = $isNew;
            }

            if ($request->has('on_sale')) {
                $onSale = $request->on_sale;
                if (is_string($onSale)) {
                    $onSale = $onSale === '1' || $onSale === 'true';
                }
                $product->on_sale = $onSale;
            }

            if ($request->has('has_variants')) {
                $hasVariants = $request->has_variants;
                if (is_string($hasVariants)) {
                    $hasVariants = $hasVariants === '1' || $hasVariants === 'true';
                }
                $product->has_variants = $hasVariants;
            }

            if ($request->has('price_is_negotiable')) {
                $priceNegotiable = $request->price_is_negotiable;
                if (is_string($priceNegotiable)) {
                    $priceNegotiable = $priceNegotiable === '1' || $priceNegotiable === 'true';
                }
                $product->price_is_negotiable = $priceNegotiable;
            }

            if ($request->has('in_stock')) {
                $inStock = $request->in_stock;
                if (is_string($inStock)) {
                    $inStock = $inStock === '1' || $inStock === 'true';
                }
                $product->in_stock = $inStock;
            }

            // Update other fields
            if ($request->has('name')) $product->name = $request->name;
            if ($request->has('sku')) $product->sku = $request->sku;
            if ($request->has('type')) $product->type = $request->type;
            if ($request->has('category_id')) $product->category_id = $request->category_id;
            if ($request->has('brand_id')) $product->brand_id = $request->brand_id;
            if ($request->has('price')) $product->price = $request->price;
            if ($request->has('original_price')) $product->original_price = $request->original_price;
            if ($request->has('stock_quantity')) {
                $product->stock_quantity = $request->stock_quantity;
                $product->in_stock = $request->stock_quantity > 0;
            }
            if ($request->has('description')) $product->description = $request->description;
            if ($request->has('short_description')) $product->short_description = $request->short_description;
            if ($request->has('badge')) $product->badge = $request->badge;
            if ($request->has('status')) $product->status = $request->status;
            if ($request->has('meta_title')) $product->meta_title = $request->meta_title;
            if ($request->has('meta_description')) $product->meta_description = $request->meta_description;
            if ($request->has('admin_notes')) $product->admin_notes = $request->admin_notes;
            
            $product->updated_by = Auth::id();
            $product->save();

            return response()->json([
                'message' => 'Product updated successfully',
                'product' => $product->load(['brand', 'category'])
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to update product',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function bulkUpdate(Request $request, $id)
    {
        $product = Product::findOrFail($id);

        $request->validate([
            'name'                => 'sometimes|string|max:255',
            'stock_quantity'      => 'sometimes|integer|min:0',
            'price'               => 'sometimes|numeric|min:0',
            'original_price'      => 'sometimes|nullable|numeric|min:0',
            'price_is_negotiable' => 'sometimes|boolean',
            'category_id'         => 'sometimes|exists:categories,id',
            'brand_id'            => 'sometimes|nullable|exists:brands,id',
            'main_image'          => 'sometimes|file|image|max:5120',   // 5 MB max
            'images.*'            => 'sometimes|file|image|max:5120',
        ]);

        $data = [];

        // Data assignment block
        if ($request->has('name'))           $data['name'] = $request->name;
        if ($request->has('stock_quantity')) {
            $data['stock_quantity'] = $request->stock_quantity;
            $data['in_stock']       = $request->stock_quantity > 0;
            // Auto-update status
            if ($request->stock_quantity === 0 && $product->status === 'active') {
                $data['status'] = 'out_of_stock';
            } elseif ($request->stock_quantity > 0 && $product->status === 'out_of_stock') {
                $data['status'] = 'active';
            }
        }

        // ── Pricing fields ────────────────────────────────────────
        if ($request->has('price'))               $data['price']               = $request->price;
        if ($request->has('original_price'))      $data['original_price']      = $request->original_price;
        if ($request->has('price_is_negotiable')) $data['price_is_negotiable'] = $request->boolean('price_is_negotiable');
        if ($request->has('category_id'))         $data['category_id']         = $request->category_id;
        if ($request->has('brand_id'))            $data['brand_id']            = $request->brand_id;

        // Auto-set on_sale when price < original_price
        if (isset($data['price']) && $product->original_price && $data['price'] < $product->original_price) {
            $data['on_sale'] = true;
        }

        // ── Main image upload ─────────────────────────────────────
        if ($request->hasFile('main_image') && $request->file('main_image')->isValid()) {
            // Delete old local main image if it exists
            if ($product->main_image && !str_starts_with($product->main_image, 'http')) {
                \Storage::disk('public')->delete(str_replace('/storage/', '', $product->main_image));
            }

            $path = $request->file('main_image')->store('products', 'public');
            $data['main_image'] = '/storage/' . $path;
        }

        // ── Additional images upload ──────────────────────────────
        if ($request->hasFile('images')) {
            $existingImages = $product->images ?? [];

            foreach ($request->file('images') as $file) {
                if ($file->isValid()) {
                    $path = $file->store('products', 'public');
                    $existingImages[] = '/storage/' . $path;
                }
            }

            $data['images'] = $existingImages;

            // Set main_image from first image if not set
            if (empty($data['main_image']) && empty($product->main_image) && !empty($existingImages)) {
                $data['main_image'] = $existingImages[0];
            }
        }

        // ── updated_by ────────────────────────────────────────────
        $data['updated_by'] = auth()->id();

        $product->update($data);

        return response()->json([
            'success' => true,
            'message' => 'Product updated successfully',
            'data'    => $product->fresh(['category', 'brand']),
        ]);
    }

    /**
     * ADMIN: Bulk-set boolean flag(s) on multiple products.
     *
     * POST /admin/products/bulk-update-flags
     * Body: { ids: [1,2,3], flags: { is_visible: true, is_featured: false, ... } }
     */
    public function bulkUpdateFlags(Request $request)
    {
        $request->validate([
            'ids'              => 'required|array|min:1',
            'ids.*'            => 'integer|exists:products,id',
            'flags'            => 'required|array|min:1',
            'flags.is_visible' => 'sometimes|boolean',
            'flags.is_featured'=> 'sometimes|boolean',
            'flags.is_new'     => 'sometimes|boolean',
            'flags.on_sale'    => 'sometimes|boolean',
        ]);

        // Whitelist — never let the client sneak in other columns
        $allowed = ['is_visible', 'is_featured', 'is_new', 'on_sale'];
        $data    = array_intersect_key($request->input('flags'), array_flip($allowed));

        if (empty($data)) {
            return response()->json([
                'success' => false,
                'message' => 'No valid flags provided.',
            ], 422);
        }

        // Cast everything to int (tinyint columns) and stamp who changed it
        $data = array_map(fn($v) => (bool) $v ? 1 : 0, $data);
        $data['updated_by'] = auth()->id();

        $updated = Product::whereIn('id', $request->input('ids'))
                        ->update($data);

        return response()->json([
            'success'  => true,
            'message'  => "{$updated} product(s) updated successfully.",
            'updated'  => $updated,
        ]);
    }

    /**
     * Remove the specified product (ADMIN ONLY - Soft Delete)
     */
    public function destroy($id)
    {
        try {
            $product = Product::findOrFail($id);
            
            $product->delete(); // Soft delete

            return response()->json([
                'message' => 'Product deleted successfully'
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to delete product',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get featured products (PUBLIC)
     * Rules: is_featured = 1, is_visible = 1, status = active
     */
    public function featured()
    {
        $products = Product::with(['brand', 'category'])
            ->where('is_featured', true)
            ->where('is_visible', true)
            ->where('status', 'active')
            ->limit(12)
            ->get();

        return response()->json($products, 200);
    }

    /**
     * Get new arrivals (PUBLIC)
     * Rules: is_new = 1, is_visible = 1 — NO status check, NO stock check
     */
    public function newArrivals()
    {
        $products = Product::with(['brand', 'category'])
            ->where('is_new', true)
            ->where('is_visible', true)
            ->limit(12)
            ->get();

        return response()->json($products, 200);
    }

    /**
     * Get on-sale products (PUBLIC)
     * Rules: on_sale = 1, is_visible = 1, status = active
     */
    public function onSale()
    {
        $products = Product::with(['brand', 'category'])
            ->where('on_sale', true)
            ->where('is_visible', true)
            ->where('status', 'active')
            ->limit(12)
            ->get();

        return response()->json($products, 200);
    }

    /**
 * Get related products (PUBLIC)
 * Uses the related_products column (array of product IDs)
 */
public function related($id)
{
    try {
        $product = Product::findOrFail($id);
        
        // Get related product IDs from the database column
        $relatedProductIds = $product->related_products ?? [];
        
        // If no related products defined, fallback to same category
        if (empty($relatedProductIds)) {
            $relatedProducts = Product::with(['brand', 'category'])
                ->where('is_visible', true)
                ->where('category_id', $product->category_id)
                ->where('id', '!=', $product->id)
                ->limit(8)
                ->get();
        } else {
            // Fetch the specific related products by their IDs
            $relatedProducts = Product::with(['brand', 'category'])
                ->where('is_visible', true)
                ->whereIn('id', $relatedProductIds)
                ->get();
        }
        
        // Format the response
        $formattedProducts = $relatedProducts->map(function($item) {
            $avgRating = $item->reviews()->where('is_approved', true)->avg('rating');
            $totalReviews = $item->reviews()->where('is_approved', true)->count();
            
            return [
                'id' => $item->id,
                'name' => $item->name,
                'slug' => $item->slug,
                'price' => $item->price,
                'original_price' => $item->original_price,
                'price_is_negotiable' => $item->price_is_negotiable ?? $item->priceisnegotiable ?? false,
                'main_image' => $item->main_image,
                'average_rating' => round($avgRating ?? 0, 1),
                'total_reviews' => $totalReviews,
                'in_stock' => $item->in_stock,
                'badge' => $item->badge,
                'on_sale' => $item->on_sale,
                'brand' => $item->brand ? [
                    'id' => $item->brand->id,
                    'name' => $item->brand->name
                ] : null,
            ];
        });

        return response()->json($formattedProducts, 200);
        
    } catch (\Exception $e) {
        return response()->json([
            'message' => 'Product not found',
            'error' => $e->getMessage()
        ], 404);
    }
}

    /**
     * Update product stock (ADMIN ONLY)
     */
    public function updateStock(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'quantity' => 'required|integer',
            'action' => 'required|in:add,subtract,set'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $product = Product::findOrFail($id);

        switch ($request->action) {
            case 'add':
                $product->increaseStock($request->quantity);
                break;
            case 'subtract':
                $product->decreaseStock($request->quantity);
                break;
            case 'set':
                $product->update([
                    'stock_quantity' => $request->quantity,
                    'in_stock' => $request->quantity > 0
                ]);
                break;
        }

        return response()->json([
            'message' => 'Stock updated successfully',
            'product' => $product
        ], 200);
    }

    /**
     * List soft-deleted products (ADMIN ONLY)
     */
    public function trashIndex(Request $request)
    {
        $query = Product::onlyTrashed()->with(['brand', 'category']);

        // Search
        if ($request->has('search')) {
            $query->search($request->search);
        }

        // Filter by category
        if ($request->has('category_id')) {
            $query->inCategory($request->category_id);
        }

        // Filter by brand
        if ($request->has('brand_id')) {
            $query->byBrand($request->brand_id);
        }

        // Sort
        $sortBy = $request->get('sort_by', 'deleted_at');
        $sortOrder = $request->get('sort_order', 'desc');
        $query->orderBy($sortBy, $sortOrder);

        // Paginate
        $perPage = $request->get('per_page', 20);
        $products = $query->paginate($perPage);

        return response()->json($products, 200);
    }

    /**
     * Restore a soft-deleted product (ADMIN ONLY)
     */
    public function restore($id)
    {
        try {
            $product = Product::onlyTrashed()->findOrFail($id);
            $product->restore();

            return response()->json([
                'message' => 'Product restored successfully',
                'product' => $product->load(['brand', 'category'])
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to restore product',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Permanently delete a soft-deleted product (ADMIN ONLY)
     */
    public function forceDelete($id)
    {
        try {
            $product = Product::onlyTrashed()->findOrFail($id);

            // Delete storage files if present
            if ($product->main_image && str_starts_with($product->main_image, '/storage/')) {
                $mainPath = str_replace('/storage/', '', $product->main_image);
                if (Storage::disk('public')->exists($mainPath)) {
                    Storage::disk('public')->delete($mainPath);
                }
            }

            if ($product->images && is_array($product->images)) {
                foreach ($product->images as $image) {
                    if (str_starts_with($image, '/storage/')) {
                        $imagePath = str_replace('/storage/', '', $image);
                        if (Storage::disk('public')->exists($imagePath)) {
                            Storage::disk('public')->delete($imagePath);
                        }
                    }
                }
            }

            $product->forceDelete();

            return response()->json([
                'message' => 'Product permanently deleted'
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to permanently delete product',
                'error' => $e->getMessage()
            ], 500);
        }
    }
    /**
     * Restore multiple soft-deleted products (ADMIN ONLY)
     */
    public function restoreMultiple(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'ids' => 'required|array',
            'ids.*' => 'integer|distinct'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            $ids = $request->ids;
            $products = Product::onlyTrashed()->whereIn('id', $ids)->get();

            $restored = [];
            foreach ($products as $product) {
                $product->restore();
                $restored[] = $product->id;
            }

            return response()->json([
                'message' => 'Products restored successfully',
                'restored_count' => count($restored),
                'restored_ids' => $restored
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to restore products',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Permanently delete multiple soft-deleted products (ADMIN ONLY)
     */
    public function forceDeleteMultiple(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'ids' => 'required|array',
            'ids.*' => 'integer|distinct'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            $ids = $request->ids;
            $products = Product::onlyTrashed()->whereIn('id', $ids)->get();

            $deleted = [];
            foreach ($products as $product) {
                // Delete storage files if present
                if ($product->main_image && str_starts_with($product->main_image, '/storage/')) {
                    $mainPath = str_replace('/storage/', '', $product->main_image);
                    if (Storage::disk('public')->exists($mainPath)) {
                        Storage::disk('public')->delete($mainPath);
                    }
                }

                if ($product->images && is_array($product->images)) {
                    foreach ($product->images as $image) {
                        if (str_starts_with($image, '/storage/')) {
                            $imagePath = str_replace('/storage/', '', $image);
                            if (Storage::disk('public')->exists($imagePath)) {
                                Storage::disk('public')->delete($imagePath);
                            }
                        }
                    }
                }

                $product->forceDelete();
                $deleted[] = $product->id;
            }

            return response()->json([
                'message' => 'Products permanently deleted',
                'deleted_count' => count($deleted),
                'deleted_ids' => $deleted
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to permanently delete products',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}