<?php

namespace App\Http\Controllers\Api;

use App\Rules\NoSlash;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Brand;
use App\Models\Category;
use App\Services\CurrencyConversionService;
use App\Services\FuzzySuggestService;
use App\Services\Location\LocationContext;
use App\Services\Location\VariantStockService;
use App\Models\LocationPrice;
use App\Models\Location;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
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
        $query = Product::with(['brand', 'category', 'currency:id,code,symbol', 'activeAuction']);

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

        // Filters from the admin products page. In stock means the flag is on and there is stock; out of stock is everything else.
        if ($request->filled('in_stock')) {
            filter_var($request->in_stock, FILTER_VALIDATE_BOOLEAN)
                ? $query->where('in_stock', true)->where('stock_quantity', '>', 0)
                : $query->where(fn ($w) => $w->where('in_stock', false)->orWhere('stock_quantity', '<=', 0)->orWhereNull('stock_quantity'));
        }
        if ($request->filled('is_featured')) {
            $query->where('is_featured', filter_var($request->is_featured, FILTER_VALIDATE_BOOLEAN));
        }
        if ($request->filled('on_sale')) {
            $query->where('on_sale', filter_var($request->on_sale, FILTER_VALIDATE_BOOLEAN));
        }

        // Filter by stock switches (admin lists: "materials only", "tracks expiry")
        if ($request->filled('is_for_sale')) {
            $query->where('is_for_sale', filter_var($request->is_for_sale, FILTER_VALIDATE_BOOLEAN));
        }
        if ($request->filled('track_expiry')) {
            $query->where('track_expiry', filter_var($request->track_expiry, FILTER_VALIDATE_BOOLEAN));
        }

        // Filter by native currency
        if ($request->filled('currency_id')) {
            $query->where('currency_id', $request->currency_id);
        }

        // Sort (price is normalised to base so mixed currencies order correctly)
        $sortBy = $request->get('sort_by', 'created_at');
        $sortOrder = $request->get('sort_order', 'desc');
        $sortBy === 'price'
            ? $query->orderByBasePrice('price', $sortOrder)
            : $query->orderBy($sortBy, $sortOrder);

        // Paginate
        $perPage = $request->get('per_page', 20);
        $products = $query->paginate($perPage);

        return response()->json($products, 200);
    }

    public function adminShow($id)
    {
        $product = Product::with(['brand', 'category', 'currency:id,code,symbol', 'activeAuction', 'defaultUnit', 'alternateUnit'])->findOrFail($id);

        // Not stored yet: show the unit its variants already use (saved on the next update).
        if (! $product->default_unit_id) {
            $derived = \App\Models\ProductVariantUnit::query()
                ->join('product_variants as pv', 'pv.id', '=', 'product_variant_units.variant_id')
                ->where('pv.product_id', $product->id)->where('product_variant_units.role', 'base')
                ->orderByDesc('pv.is_default')->orderBy('pv.id')->value('product_variant_units.unit_id');
            if ($derived) {
                $product->default_unit_id = $derived;
            }
        }

        $relatedProductsData = collect([]);
        if (!empty($product->related_products)) {
            $relatedProductsData = Product::with(['brand', 'category', 'currency:id,code,symbol'])
                ->whereIn('id', $product->related_products)
                ->where('id', '!=', $id)
                ->get(['id', 'name', 'sku', 'price', 'currency_id', 'main_image', 'slug']);
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
        $query = Product::with(['brand', 'category', 'currency:id,code,symbol', 'activeAuction'])
            ->where('is_visible', true)
            ->onShelf()
            ->where('status', 'active');

        // --- all existing filters unchanged ---
        if ($request->filled('search'))      { $query->search($request->search); }
        if ($request->filled('category_id')) { $query->inCategory($request->category_id); }
        if ($request->filled('brand_id'))    { $query->byBrand($request->brand_id); }
        // min/max are in the display currency (?currency=), compared across product currencies
        if ($request->filled('min_price') || $request->filled('max_price')) {
            $query->priceRange($request->min_price, $request->max_price);
        }
        if ($request->filled('featured') && filter_var($request->featured, FILTER_VALIDATE_BOOLEAN)) {
            $query->where('is_featured', true);
        }
        if ($request->filled('on_sale') && filter_var($request->on_sale, FILTER_VALIDATE_BOOLEAN)) {
            $query->where('on_sale', true);
        }
        if ($request->has('new') && $request->new === 'true') {
            $query->where('is_new', true);
        }
        // ------------------------------------------

        // Multi-location: show only products offered at the branch in context
        // (legacy products with no branch stock stay visible everywhere).
        $branchId = app(LocationContext::class)->id();
        $query->availableAtLocation($branchId);

        // Sort: honour manual sort param; otherwise personalise
        if ($request->filled('sort')) {
            $sortParts = explode('_', $request->sort);
            $sortOrder = array_pop($sortParts);
            $sortBy    = implode('_', $sortParts);
            $sortBy === 'price'
                ? $query->orderByBasePrice('price', $sortOrder)
                : $query->orderBy($sortBy, $sortOrder);
            $meta = ['personalized' => false, 'segment' => 'manual'];
        } else {
            $order = app(\App\Services\CatalogueRankingService::class)
                ->getOrderExpression('product');

            if ($order['customer_id']) {
                $query->select('products.*')
                    ->leftJoin('customer_product_pins as cpp', function ($j) use ($order) {
                        $j->on('cpp.entity_id', '=', 'products.id')
                            ->where('cpp.entity_type', '=', 'product')
                            ->where('cpp.customer_id', '=', $order['customer_id']);
                    })
                    ->orderByRaw('(cpp.id IS NOT NULL) DESC')
                    ->orderByRaw($order['expression'] . ' DESC', $order['bindings']);
            } else {
                $query->orderByRaw($order['expression'] . ' DESC', $order['bindings']);
            }
            $meta = ['personalized' => $order['personalized'], 'segment' => $order['segment']];
        }

        $perPage  = $request->get('per_page', 20);
        $products = $query->paginate($perPage);

        // Attach active boost content to each product on this page
        $pageIds = $products->pluck('id');
        $boosts  = DB::table('algorithm_bonus_content')
            ->where('entity_type', 'product')
            ->where('is_active', 1)
            ->whereIn('entity_id', $pageIds)
            ->get(['entity_id', 'message', 'badge_type'])
            ->keyBy('entity_id');

        $products->getCollection()->transform(function ($product) use ($boosts) {
            $boost = $boosts->get($product->id);
            $product->boost_message    = $boost?->message    ?? null;
            $product->boost_badge_type = $boost?->badge_type ?? null;
            return $product;
        });
        app(\App\Services\Stock\ExpiryBadges::class)->attach($products->getCollection());

        // ── Fuzzy suggestions when exact search returns nothing ───────────────
        $fuzzyResults = [];
        if ($request->filled('search') && $products->total() === 0) {
            $fuzzyResults = app(FuzzySuggestService::class)->suggest(
                Product::with(['brand:id,name', 'currency:id,code,symbol'])
                    ->where('is_visible', true)
                    ->onShelf()
                    ->where('status', 'active')
                    ->select('id', 'name', 'sku', 'main_image', 'price', 'sales_ledger_id', 'currency_id', 'slug', 'brand_id'),
                (string) $request->search,
                ['name']
            )->toArray();
        }

        return response()->json(array_merge($products->toArray(), $meta, ['fuzzy_results' => $fuzzyResults]), 200);
    }

    /**
     * Store a newly created product (ADMIN ONLY)
     */
    /** A fresh SKU (like SMMK9T1206) that no product or variant has. */
    public function nextSku(): \Illuminate\Http\JsonResponse
    {
        return response()->json(['sku' => app(\App\Services\SkuGenerator::class)->generate()]);
    }

    public function store(Request $request)
    {
        if ($r = \App\Services\Books\TradingAccounts::check($request)) {
            return $r;
        }
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'sku' => ['nullable', 'string', 'unique:products,sku', new NoSlash('A SKU')],
            'category_id' => 'required|exists:categories,id',
            'brand_id' => 'nullable|exists:brands,id',
            'price' => 'required|numeric|min:0',
            'currency_id' => 'nullable|exists:currencies,id,is_active,1',
            'default_unit_id' => 'nullable|exists:units_of_measure,id',
            'alternate_unit_id' => 'nullable|exists:units_of_measure,id',
            'main_image' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'images.*' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $unitsDraft = new Product();
        $uomError = $this->applyProductUnits($request, $unitsDraft);
        if ($uomError) {
            return response()->json(['message' => $uomError, 'errors' => ['default_unit_id' => [$uomError]]], 422);
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

            // Stock switches: a product is for sale unless said otherwise, and does
            // not track expiry unless said otherwise (uncommon — batch + expiry asked on receipt).
            $isForSale = $request->has('is_for_sale')
                ? filter_var($request->is_for_sale, FILTER_VALIDATE_BOOLEAN)
                : true;
            $trackExpiry = $request->has('track_expiry')
                ? filter_var($request->track_expiry, FILTER_VALIDATE_BOOLEAN)
                : false;

            // Quantity typed on a new item: it needs a cost (and batch details for an item that expires), and arrives as an Opening stock voucher.
            $opening = app(\App\Services\Stock\OpeningStockService::class);
            $opening->assertEntered($request, $trackExpiry);
            DB::beginTransaction();

            // Create product
            $product = Product::create([
                'name' => $request->name,
                'slug' => Str::slug($request->name),
                'sku' => filled($request->sku) ? $request->sku : app(\App\Services\SkuGenerator::class)->generate(),
                'type' => $request->type,
                'category_id' => $request->category_id,
                'brand_id' => $request->brand_id,
                'price' => $request->price,
                // Pin to an explicit currency: a NULL would silently follow the base if it's ever changed.
                'currency_id' => $request->currency_id ?: app(CurrencyConversionService::class)->getBaseCurrency()->id,
                'default_unit_id' => $unitsDraft->default_unit_id,
                'alternate_unit_id' => $unitsDraft->alternate_unit_id,
                'original_price' => $request->original_price,
                'price_is_negotiable' => $priceNegotiable,
                'in_stock' => $inStock,
                'stock_quantity' => 0,   // never typed in: the opening stock voucher below puts it there
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
                'is_for_sale' => $isForSale,
                'track_expiry' => $trackExpiry,
                'meta_title' => $request->meta_title,
                'meta_description' => $request->meta_description,
                'meta_keywords' => $metaKeywords,
                'admin_notes' => $request->admin_notes,
                'created_by' => Auth::id(),
            ]);
            \App\Services\Books\TradingAccounts::save($product, $request);

            // Every product starts with a "Standard" variant: product SKU, price and
            // stock unit, so it can be sold (and stocked per branch) straight away.
            if ($product->default_unit_id || $opening->wants($request)) {
                $variant = app(VariantStockService::class)->ensureDefaultVariant($product);
                if ($opening->wants($request)) {
                    $opening->postFromRequest($variant, $request, Auth::user());
                }
            }
            DB::commit();

            return response()->json([
                'message' => 'Product created successfully',
                'product' => $product->load(['brand', 'category'])
            ], 201);

        } catch (\App\Services\Books\BooksException $e) {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }

            return response()->json(['message' => $e->getMessage(), 'errors' => ['stock_quantity' => [$e->getMessage()]]], 422);
        } catch (\Exception $e) {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }

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
                'currency:id,code,symbol',
                'activeAuction',
            ])
            ->where('is_visible', true)
            ->onShelf()
            ->findOrFail($id);

            // Increment view count
            if (method_exists($product, 'incrementViewCount')) {
                $product->incrementViewCount();
            }

            // Review numbers come from the Engagement Engine (empty when reviews are off)
            $summary = app(\App\Services\Engagement\ReviewSummary::class);
            $reviewInfo = $summary->of('product', $product->id);
            $avgRating = $reviewInfo['average'];
            $ratingBreakdown = $reviewInfo['breakdown'];
            $totalReviews = $reviewInfo['count'];

            // Get related products (same category, excluding current)
            $relatedProducts = Product::with(['brand', 'category', 'currency:id,code,symbol'])
                ->where('is_visible', true)
                ->onShelf()
                ->where('category_id', $product->category_id)
                ->where('id', '!=', $product->id)
                ->limit(8)
                ->get();

            // Calculate discount percentage
            $discountPercentage = 0;
            if ($product->original_price && $product->on_sale && $product->original_price > $product->price) {
                $discountPercentage = round((($product->original_price - $product->price) / $product->original_price) * 100);
            }

            // Multi-location: is this offered at the branch in context, and where is it in stock?
            $branchId = app(LocationContext::class)->id();
            $offeredHere = $product->offeredAt($branchId);
            $branchesInStock = Location::whereIn('id', $product->branchIdsInStock())
                ->orderBy('name')->pluck('name', 'id');
            app(\App\Services\Stock\ExpiryBadges::class)->attach(collect([$product]));

            return response()->json([
                'product' => [
                    // Basic Info
                    'id' => $product->id,
                    'name' => $product->name,
                    'slug' => $product->slug,
                    'sku' => $product->sku,
                    'expiry_badge' => $product->expiry_badge ?? null,   // "Expires dd/mm": only for expiry products with a dated batch, when the settings show it
                    
                    // Descriptions
                    'description' => $product->description,
                    'short_description' => $product->short_description,
                    
                    // Pricing (price/original_price are native; display_* follow ?currency=)
                    'price' => $product->price,
                    'currency' => $product->currency,
                    'display_price' => $product->display_price,
                    'tax_info' => $product->tax_info,
                    'display_tax' => $product->display_tax,
                    'display_price_incl' => $product->display_price_incl,
                    'display_original_price' => $product->convertAmount($product->original_price !== null ? (float) $product->original_price : null),
                    'display_currency' => $product->display_currency,
                    'original_price' => $product->original_price,
                    'price_is_negotiable' => $product->price_is_negotiable,
                    'on_sale' => $product->on_sale,
                    'discount_percentage' => $discountPercentage,

                    // Multi-location
                    'offered_here' => $offeredHere,
                    'available_branches' => $branchesInStock,   // { id: name } where in stock
                    
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
                    
                    // Reviews are loaded by the page from /engagement/product/{id}/posts
                    'reviews' => [],
                    
                    // Meta
                    'view_count' => $product->view_count ?? 0,
                    'created_at' => $product->created_at->format('M d, Y'),
                ],
                
                // Related Products
                'related_products' => $relatedProducts->map(function($item) use ($summary) {
                    $itemReviews = $summary->of('product', $item->id);
                    $itemAvgRating = $itemReviews['average'];
                    $itemTotalReviews = $itemReviews['count'];
                    
                    return [
                        'id' => $item->id,
                        'name' => $item->name,
                        'slug' => $item->slug,
                        'price' => $item->price,
                        'currency' => $item->currency,
                        'display_price' => $item->display_price,
                        'tax_info' => $item->tax_info,
                        'display_tax' => $item->display_tax,
                        'display_price_incl' => $item->display_price_incl,
                        'display_currency' => $item->display_currency,
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
     * Apply default/alternate unit from the request onto the product (unsaved).
     * Returns an error message, or null. The default unit is where all variant
     * stock is counted; the alternate must share its dimension.
     */
    private function applyProductUnits(Request $request, Product $product): ?string
    {
        if (! $request->has('default_unit_id') && ! $request->has('alternate_unit_id')) {
            return null;
        }

        $defaultId   = $request->has('default_unit_id') ? ($request->default_unit_id ?: null) : $product->default_unit_id;
        $alternateId = $request->has('alternate_unit_id') ? ($request->alternate_unit_id ?: null) : $product->alternate_unit_id;

        if (! $defaultId) {
            return 'A product needs a default unit of measure.';
        }
        if ($alternateId) {
            $default = \App\Models\UnitOfMeasure::find($defaultId);
            $alt     = \App\Models\UnitOfMeasure::find($alternateId);
            if ((int) $alternateId === (int) $defaultId) {
                return 'The alternate unit must differ from the default unit.';
            }
            if (! $default || ! $alt || $default->dimension !== $alt->dimension) {
                return 'The alternate unit must be the same kind of measure as the default unit (e.g. both counts).';
            }
        }

        if ($product->default_unit_id && (int) $product->default_unit_id !== (int) $defaultId
            && $product->productVariants()->exists()) {
            return 'The default unit cannot change once the product has variants — stock is counted in it.';
        }

        $product->default_unit_id   = $defaultId;
        $product->alternate_unit_id = $alternateId;

        return null;
    }

    /**
     * Update the specified product (ADMIN ONLY)
     */
    public function update(Request $request, $id)
    {
        $product = Product::findOrFail($id);
        if ($r = \App\Services\Books\TradingAccounts::check($request, $product)) {
            return $r;
        }

        $validator = Validator::make($request->all(), [
            'name' => 'string|max:255',
            'sku' => ['string', 'unique:products,sku,' . $id, new NoSlash('A SKU')],
            'category_id' => 'exists:categories,id',
            'brand_id' => 'nullable|exists:brands,id',
            'price' => 'numeric|min:0',
            'currency_id' => 'nullable|exists:currencies,id,is_active,1',
            'default_unit_id' => 'nullable|exists:units_of_measure,id',
            'alternate_unit_id' => 'nullable|exists:units_of_measure,id',
            'main_image' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'images.*' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'additional_image_urls' => 'nullable|string', // expect JSON array string or newline-separated from frontend
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $uomError = $this->applyProductUnits($request, $product);
        if ($uomError) {
            return response()->json(['message' => $uomError, 'errors' => ['default_unit_id' => [$uomError]]], 422);
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
            if ($request->has('is_for_sale')) {
                $product->is_for_sale = filter_var($request->is_for_sale, FILTER_VALIDATE_BOOLEAN);
            }
            if ($request->has('track_expiry')) {
                $product->track_expiry = filter_var($request->track_expiry, FILTER_VALIDATE_BOOLEAN);
            }
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
            if ($request->has('currency_id')) {
                $product->currency_id = $request->currency_id ?: app(CurrencyConversionService::class)->getBaseCurrency()->id;
            }
            if ($request->has('original_price')) $product->original_price = $request->original_price;
            // stock_quantity is deliberately not read here: stock moves with vouchers, counts, write-offs and transfers (Adjust stock)
            if ($request->has('description')) $product->description = $request->description;
            if ($request->has('short_description')) $product->short_description = $request->short_description;
            if ($request->has('badge')) $product->badge = $request->badge;
            if ($request->has('status')) $product->status = $request->status;
            if ($request->has('meta_title')) $product->meta_title = $request->meta_title;
            if ($request->has('meta_description')) $product->meta_description = $request->meta_description;
            if ($request->has('admin_notes')) $product->admin_notes = $request->admin_notes;
            
            $product->updated_by = Auth::id();
            $product->save();
            \App\Services\Books\TradingAccounts::save($product, $request);   // sales / purchase account

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
            'currency_id'         => 'sometimes|exists:currencies,id,is_active,1',
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
        if ($request->has('currency_id'))         $data['currency_id']         = $request->currency_id;
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
        \App\Services\Books\TradingAccounts::save($product, $request);

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

    public function bulkUpdateStatus(Request $request)
    {
        $request->validate([
            'ids'    => 'required|array',
            'ids.*'  => 'integer',
            'status' => 'required|in:active,inactive,draft,out_of_stock,discontinued',
        ]);

        $updated = Product::whereIn('id', $request->ids)->update([
            'status' => $request->status,
        ]);

        return response()->json([
            'message'       => 'Status updated successfully',
            'updated_count' => $updated,
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
        $products = Product::with(['brand', 'category', 'currency:id,code,symbol'])
            ->where('is_featured', true)
            ->where('is_visible', true)
            ->onShelf()
            ->where('status', 'active')
            ->limit(12)
            ->get();
        app(\App\Services\Stock\ExpiryBadges::class)->attach($products);

        return response()->json($products, 200);
    }

    /**
     * Get new arrivals (PUBLIC)
     * Rules: is_new = 1, is_visible = 1 — NO status check, NO stock check
     */
    public function newArrivals()
    {
        $products = Product::with(['brand', 'category', 'currency:id,code,symbol'])
            ->where('is_new', true)
            ->where('is_visible', true)
            ->onShelf()
            ->limit(12)
            ->get();
        app(\App\Services\Stock\ExpiryBadges::class)->attach($products);

        return response()->json($products, 200);
    }

    /**
     * Get on-sale products (PUBLIC)
     * Rules: on_sale = 1, is_visible = 1, status = active
     */
    public function onSale()
    {
        $products = Product::with(['brand', 'category', 'currency:id,code,symbol'])
            ->where('on_sale', true)
            ->where('is_visible', true)
            ->onShelf()
            ->where('status', 'active')
            ->limit(12)
            ->get();
        app(\App\Services\Stock\ExpiryBadges::class)->attach($products);

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
            $relatedProducts = Product::with(['brand', 'category', 'currency:id,code,symbol'])
                ->where('is_visible', true)
                ->onShelf()
                ->where('category_id', $product->category_id)
                ->where('id', '!=', $product->id)
                ->limit(8)
                ->get();
        } else {
            // Fetch the specific related products by their IDs
            $relatedProducts = Product::with(['brand', 'category', 'currency:id,code,symbol'])
                ->where('is_visible', true)
                ->onShelf()
                ->whereIn('id', $relatedProductIds)
                ->get();
        }
        
        // Format the response
        $summary = app(\App\Services\Engagement\ReviewSummary::class);
        $formattedProducts = $relatedProducts->map(function($item) use ($summary) {
            $reviewInfo = $summary->of('product', $item->id);
            $avgRating = $reviewInfo['average'];
            $totalReviews = $reviewInfo['count'];
            
            return [
                'id' => $item->id,
                'name' => $item->name,
                'slug' => $item->slug,
                'price' => $item->price,
                'currency' => $item->currency,
                'display_price' => $item->display_price,
                'tax_info' => $item->tax_info,
                'display_tax' => $item->display_tax,
                'display_price_incl' => $item->display_price_incl,
                'display_currency' => $item->display_currency,
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
            'action'   => 'required|in:add,subtract,set',
            'notes'    => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $product      = Product::findOrFail($id);
        $stockBefore  = (int) $product->stock_quantity;

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
                    'in_stock'       => $request->quantity > 0,
                ]);
                break;
        }

        // Reload so stock_quantity reflects the just-saved value
        $product->refresh();

        return response()->json([
            'message' => 'Stock updated successfully',
            'product' => $product,
        ], 200);
    }

    /**
     * Per-branch stock grid for a product (ADMIN). Stock lives on variants and
     * branches differ by quantity only (price is per variant, not per branch).
     * Returns the active branches and each variant's per-branch quantity.
     */
    public function branchStock($id)
    {
        $product = Product::findOrFail($id);

        $locations = Location::active()->ordered()
            ->get(['id', 'name', 'code'])
            ->map(fn ($l) => ['id' => $l->id, 'name' => $l->name, 'code' => $l->code]);

        $variants = $product->productVariants()->with('locationStocks')->orderByDesc('is_default')->orderBy('id')->get()
            ->map(function ($v) {
                $byLoc = $v->locationStocks->keyBy('location_id');
                return [
                    'id'              => $v->id,
                    'name'            => $v->name ?: ($v->combination_key === 'default' ? 'Default' : $v->combination_key),
                    'is_default'      => (bool) $v->is_default,
                    'combination_key' => $v->combination_key,
                    'stock'           => $byLoc->map(fn ($r) => (float) $r->quantity)->toArray(), // { location_id: qty }
                ];
            });

        return response()->json([
            'locations' => $locations,
            'variants'  => $variants,   // empty when the product has no variants yet
        ]);
    }

    /**
     * Save per-branch stock for a product (ADMIN).
     * Body: { stock: [{variant_id, location_id, quantity}] }
     * Product stock is then auto-recomputed from the variant totals.
     */
    public function saveBranchStock(Request $request, $id, VariantStockService $stock)
    {
        // Quantities are not typed any more: that left no movement and no entry in the books. Use a stock count, a purchase, a write-off or a transfer.
        return response()->json([
            'message' => 'Stock is not typed in. Use Adjust stock: a stock count for a shortage or surplus, a purchase or goods received note for stock that arrived, a write-off for damage, a transfer between branches.',
        ], 422);
    }

    /**
     * List soft-deleted products (ADMIN ONLY)
     */
    public function trashIndex(Request $request)
    {
        $query = Product::onlyTrashed()->with(['brand', 'category', 'currency:id,code,symbol']);

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