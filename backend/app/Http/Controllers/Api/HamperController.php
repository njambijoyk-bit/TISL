<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Hamper;
use App\Models\HamperItem;
use App\Models\HamperCustomerEligibility;
use App\Models\Customer;
use App\Models\Product;
use App\Services\HamperEligibilityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class HamperController extends Controller
{
    public function __construct(private HamperEligibilityService $eligibility) {}

    // ── CRUD ──────────────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $hampers = Hamper::with(['items', 'createdBy:id,name'])
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->when($request->filled('eligibility_type'), fn($q) => $q->where('eligibility_type', $request->eligibility_type))
            ->when($request->filled('search'), fn($q) => $q->where('name', 'like', '%' . $request->search . '%'))
            ->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 20));

        return response()->json($hampers);
    }

    public function stats(): JsonResponse
    {
        return response()->json([
            'total'    => Hamper::count(),
            'active'   => Hamper::where('status', 'active')->count(),
            'sold_out' => Hamper::where('is_sold_out', true)->count(),
            'draft'    => Hamper::where('status', 'draft')->count(),
        ]);
    }    

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'                       => 'required|string|max:255',
            'description'                => 'nullable|string',
            'cover_image'                => 'nullable|string',
            'accent_color'               => 'nullable|string|max:7',
            'price'                      => 'required|numeric|min:0',
            'status'                     => 'in:draft,active,inactive',
            'apply_vat'                  => 'boolean',
            'allow_promo_codes'          => 'boolean',
            'allow_store_credit'         => 'boolean',
            'earn_loyalty_points'        => 'boolean',
            'max_purchases_per_customer' => 'nullable|integer|min:1',
            'total_stock'                => 'nullable|integer|min:1',
            'eligibility_type'           => 'in:all,tier,customer_type,manual',
            'eligible_tiers'             => 'nullable|array',
            'eligible_customer_types'    => 'nullable|array',
            'is_visible'                 => 'boolean',
            'valid_from'                 => 'nullable|date',
            'valid_until'                => 'nullable|date|after_or_equal:valid_from',
        ]);

        $data['slug']            = Str::slug($data['name']) . '-' . Str::random(6);
        $data['created_by']      = auth()->id();
        $data['stock_remaining'] = $data['total_stock'] ?? null;

        $hamper = Hamper::create($data);

        return response()->json(['message' => 'Hamper created', 'data' => $hamper], 201);
    }

    public function show($id): JsonResponse
    {
        $hamper = Hamper::with(['items.product', 'createdBy:id,name'])->findOrFail($id);
        return response()->json($hamper);
    }

    public function update(Request $request, $id): JsonResponse
    {
        $hamper = Hamper::findOrFail($id);

        $data = $request->validate([
            'name'                       => 'sometimes|string|max:255',
            'description'                => 'nullable|string',
            'cover_image'                => 'nullable|string',
            'accent_color'               => 'nullable|string|max:7',
            'price'                      => 'sometimes|numeric|min:0',
            'status'                     => 'in:draft,active,inactive',
            'apply_vat'                  => 'boolean',
            'allow_promo_codes'          => 'boolean',
            'allow_store_credit'         => 'boolean',
            'earn_loyalty_points'        => 'boolean',
            'max_purchases_per_customer' => 'nullable|integer|min:1',
            'total_stock'                => 'nullable|integer|min:1',
            'eligibility_type'           => 'in:all,tier,customer_type,manual',
            'eligible_tiers'             => 'nullable|array',
            'eligible_customer_types'    => 'nullable|array',
            'is_visible'                 => 'boolean',
            'valid_from'                 => 'nullable|date|after_or_equal:valid_from',
            'valid_until'                => 'nullable|date',
        ]);

        // sync stock_remaining when total_stock changes
        if (isset($data['total_stock']) && $hamper->total_stock !== null) {
            $oldTotal = $hamper->total_stock;
            $newTotal = $data['total_stock'];
            $delta = $newTotal - $oldTotal;
            $data['stock_remaining'] = max(0, ($hamper->stock_remaining ?? 0) + $delta);
        } elseif (isset($data['total_stock']) && $hamper->total_stock === null) {
            // switching from unlimited to limited
            $data['stock_remaining'] = $data['total_stock'];
        }

        $hamper->update($data);

        return response()->json(['message' => 'Hamper updated', 'data' => $hamper->fresh()]);
    }

    public function destroy($id): JsonResponse
    {
        $hamper = Hamper::findOrFail($id);
        $hamper->delete();
        return response()->json(['message' => 'Hamper deleted']);
    }

    public function uploadCoverImage(Request $request, $id): JsonResponse
    {
        $hamper = Hamper::findOrFail($id);

        $request->validate([
            'cover_image' => 'required|image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        $path = $request->file('cover_image')->store('hampers/covers', 'public');

        $hamper->update(['cover_image' => asset('storage/' . $path)]);

        return response()->json([
            'message'     => 'Cover image uploaded',
            'cover_image' => asset('storage/' . $path),
        ]);
    }

    // ── Products ──────────────────────────────────────────────────────────────

    public function addProduct(Request $request, $id): JsonResponse
    {
        $hamper = Hamper::findOrFail($id);

        $request->validate([
            'product_id' => 'required|exists:products,id',
            'quantity'   => 'required|integer|min:1',
        ]);

        $product = Product::findOrFail($request->product_id);

        // only active visible products
        if ($product->status !== 'active' || !$product->is_visible) {
            return response()->json(['message' => 'Product is not active or visible'], 422);
        }

        $item = HamperItem::updateOrCreate(
            ['hamper_id' => $hamper->id, 'product_id' => $product->id],
            [
                'quantity' => $request->quantity,
                'snapshot' => HamperItem::buildSnapshot($product),
            ]
        );

        return response()->json(['message' => 'Product added to hamper', 'data' => $item], 201);
    }

    public function removeProduct($id, $productId): JsonResponse
    {
        HamperItem::where('hamper_id', $id)
            ->where('product_id', $productId)
            ->firstOrFail()
            ->delete();

        return response()->json(['message' => 'Product removed from hamper']);
    }

    /**
     * Suggest products based on related_products JSON of items already in hamper.
     */
    public function suggestProducts($id): JsonResponse
    {
        $hamper = Hamper::with('items')->findOrFail($id);

        $existingIds = $hamper->items->pluck('product_id')->toArray();

        // collect all related_product ids from current hamper items
        $relatedIds = Product::whereIn('id', $existingIds)
            ->get()
            ->flatMap(fn($p) => $p->related_products ?? [])
            ->unique()
            ->diff($existingIds)
            ->values();

        $suggestions = Product::whereIn('id', $relatedIds)
            ->where('status', 'active')
            ->where('is_visible', true)
            ->get(['id', 'name', 'sku', 'price', 'main_image', 'short_description']);

        return response()->json($suggestions);
    }

    // ── Eligibility ───────────────────────────────────────────────────────────

    public function listEligibility(Request $request, $id): JsonResponse
    {
        $rows = HamperCustomerEligibility::where('hamper_id', $id)
            ->with(['customer:id,first_name,last_name,email,customer_type,tier', 'addedBy:id,name'])
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->paginate($request->get('per_page', 25));

        return response()->json($rows);
    }

    /**
     * List customers who match the hamper's eligibility criteria (tier/type/all).
     */
    public function eligibleCustomers(Request $request, $id): JsonResponse
    {
        $hamper = Hamper::findOrFail($id);

        $query = Customer::query();

        if ($hamper->eligibility_type === 'tier') {
            $tiers = $hamper->eligible_tiers ?? [];
            $query->whereIn('tier', $tiers);
        } elseif ($hamper->eligibility_type === 'customer_type') {
            $types = $hamper->eligible_customer_types ?? [];
            $query->whereIn('customer_type', $types);
        }
        // 'all' — no filter needed, returns all customers

        $customers = $query
            ->select(['id', 'first_name', 'last_name', 'email', 'customer_type', 'tier', 'status'])
            ->orderBy('first_name')
            ->paginate($request->get('per_page', 200));

        return response()->json($customers);
    }

    public function addCustomer(Request $request, $id): JsonResponse
    {
        $hamper = Hamper::findOrFail($id);

        $request->validate([
            'customer_id' => 'required|exists:customers,id',
            'status'      => 'required|in:active,suspended,blacklisted',
            'note'        => 'nullable|string',
        ]);

        $customer = Customer::findOrFail($request->customer_id);

        // check current status before adding
        $adminStatus = $this->eligibility->getCustomerStatusForAdmin($customer, $hamper);

        // if already blacklisted or suspended, only allow changes via updateCustomerStatus
        if (in_array($adminStatus['status'], ['blacklisted', 'suspended'])) {
            return response()->json([
                'message' => $adminStatus['message'],
                'status'  => $adminStatus,
            ], 422);
        }

        $row = HamperCustomerEligibility::updateOrCreate(
            ['hamper_id' => $hamper->id, 'customer_id' => $customer->id],
            [
                'status'   => $request->status,
                'added_by' => auth()->id(),
                'note'     => $request->note,
            ]
        );

        return response()->json(['message' => 'Customer eligibility set', 'data' => $row], 201);
    }

    public function updateCustomerStatus(Request $request, $id, $customerId): JsonResponse
    {
        $row = HamperCustomerEligibility::where('hamper_id', $id)
            ->where('customer_id', $customerId)
            ->firstOrFail();

        $request->validate([
            'status' => 'required|in:active,suspended,blacklisted',
            'note'   => 'nullable|string',
        ]);

        // reactivating a blacklisted customer requires admin role
        if ($row->status === 'blacklisted' && $request->status === 'active') {
            if (auth()->user()->role !== 'admin' && auth()->user()->role !== 'super_admin') {
                return response()->json(['message' => 'Only admin can reactivate a blacklisted customer'], 403);
            }
            $row->update([
                'status'          => 'active',
                'reactivated_by'  => auth()->id(),
                'reactivated_at'  => now(),
                'note'            => $request->note,
            ]);
        } else {
            $row->update([
                'status' => $request->status,
                'note'   => $request->note,
            ]);
        }

        return response()->json(['message' => 'Customer status updated', 'data' => $row->fresh()]);
    }

    /**
     * Search customers to add — returns eligibility status for each result.
     */
    public function searchCustomers(Request $request, $id): JsonResponse
    {
        $hamper = Hamper::findOrFail($id);

        $request->validate(['q' => 'required|string|min:2']);

        $customers = Customer::where(function ($q) use ($request) {
            $q->where('first_name', 'like', "%{$request->q}%")
            ->orWhere('last_name', 'like', "%{$request->q}%")
            ->orWhere('email', 'like', "%{$request->q}%");
        })->limit(20)->get(['id', 'first_name', 'last_name', 'email', 'customer_type', 'tier']);

        $results = $customers->map(function ($customer) use ($hamper) {
            $status = $this->eligibility->getCustomerStatusForAdmin($customer, $hamper);
            return array_merge($customer->toArray(), ['eligibility' => $status]);
        });

        return response()->json($results);
    }

    // ── Orders ────────────────────────────────────────────────────────────────

    public function orders(Request $request, $id): JsonResponse
    {
        $orders = Hamper::findOrFail($id)
            ->orders()
            ->with('customer:id,first_name,last_name,email')
            ->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 20));

        return response()->json($orders);
    }
}
