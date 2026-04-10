<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

class CustomerController extends Controller
{
    /**
     * Get all customers (ADMIN)
     */
    public function index(Request $request)
    {
        $query = Customer::with(['user', 'salesRep']);

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        // Filter by type
        if ($request->has('type')) {
            $query->byType($request->type);
        }

        // Filter by tier
        if ($request->has('tier')) {
            $query->byTier($request->tier);
        }

        // Search
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('company_name', 'like', "%{$search}%")
                  ->orWhere('customer_number', 'like', "%{$search}%");
            });
        }

        // Sort
        $sortBy = $request->get('sort_by', 'created_at');
        $sortOrder = $request->get('sort_order', 'desc');
        $query->orderBy($sortBy, $sortOrder);

        $customers = $query->paginate($request->get('per_page', 20));

        return response()->json($customers, 200);
    }

    /**
     * Get single customer (ADMIN)
     */
    public function show($id)
    {
        $customer = Customer::with(['user', 'salesRep', 'orders', 'quotes'])
            ->findOrFail($id);

        return response()->json([
            'customer' => $customer,
            'stats' => [
                'total_orders' => $customer->total_orders,
                'total_spent' => $customer->total_spent,
                'average_order_value' => $customer->average_order_value,
                'first_order_date' => $customer->first_order_date,
                'last_order_date' => $customer->last_order_date,
            ]
        ], 200);
    }

    /**
     * Update customer details (ADMIN)
     */
    public function update(Request $request, $id)
    {
        $customer = Customer::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'first_name'                    => 'string|max:255',
            'last_name'                     => 'string|max:255',
            'phone'                         => 'nullable|string|unique:customers,phone,' . $id,
            'alternate_phone'               => 'nullable|string|max:50',
            'birthday'                      => 'nullable|date',
            'whatsapp'                      => 'nullable|string|max:50',
            'website'                       => 'nullable|string|max:255',
            'company_name'                  => 'nullable|string|max:255',
            'company_registration_number'   => 'nullable|string|max:255',
            'tax_id'                        => 'nullable|string|max:100',
            'customer_type'                 => 'in:individual,business,wholesale,contractor',
            'tier'                          => 'in:bronze,silver,gold,platinum',
            'discount_percentage'           => 'numeric|min:0|max:100',
            'has_credit_account'            => 'boolean',
            'credit_limit'                  => 'nullable|numeric|min:0',
            'assigned_sales_rep'            => 'nullable|exists:users,id',
            'status'                        => 'in:active,inactive,suspended,blacklisted',
            'status_reason'                 => 'nullable|string|max:500',
            'notes'                         => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            $customer->update($request->only([
                'first_name',
                'last_name',
                'phone',
                'alternate_phone',
                'birthday',
                'whatsapp',
                'website',
                'company_name',
                'company_registration_number',
                'tax_id',
                'customer_type',
                'tier',
                'discount_percentage',
                'has_credit_account',
                'credit_limit',
                'default_shipping_address',
                'default_billing_address',
                'assigned_sales_rep',
                'status',
                'status_reason',
                'notes',
            ]));

            return response()->json([
                'message'  => 'Customer updated successfully',
                'customer' => $customer->fresh(['user', 'salesRep']),
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to update customer',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get customer profile (CUSTOMER - own profile)
     */
    public function profile(Request $request)
    {
        $user = $request->user();
        $customer = $user->customer;

        if (!$customer) {
            return response()->json([
                'message' => 'Customer profile not found'
            ], 404);
        }

        // Load referral code
        $customer->load('myReferralCode');

        return response()->json([
            'customer' => $customer,
            'user' => $user,
            'stats' => [
                'total_orders' => $customer->total_orders,
                'total_spent' => $customer->total_spent,
                'tier' => $customer->tier,
                'discount_percentage' => $customer->discount_percentage,
                'store_credit' => $customer->store_credit,
                'loyalty_points' => $customer->loyalty_points,
            ]
        ], 200);
    }

    /**
     * Update own profile (CUSTOMER)
     */
    public function updateProfile(Request $request)
    {
        $user     = $request->user();
        $customer = $user->customer;

        if (!$customer) {
            return response()->json(['message' => 'Customer profile not found'], 404);
        }

        $validator = Validator::make($request->all(), [
            'first_name'               => 'string|max:255',
            'last_name'                => 'string|max:255',
            'phone' => [
                'nullable', 'string',
                'unique:customers,phone,' . $customer->id,
                'unique:users,phone,' . $user->id,
            ],
            'alternate_phone'          => 'nullable|string|max:50',
            'birthday'                 => 'nullable|date',
            'whatsapp'                 => 'nullable|string|max:50',
            'website'                  => 'nullable|string|max:255',
            'company_name'             => 'nullable|string|max:255',
            'company_registration_number' => 'nullable|string|max:255',
            'tax_id'                   => 'nullable|string|max:100',
            // Billing/shipping are the plain text fields on the customers table,
            // NOT the customer_addresses table — customers cannot touch that table
            'default_shipping_address' => 'nullable|string|max:1000',
            'default_billing_address'  => 'nullable|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            $customer->update($request->only([
                'first_name', 'last_name', 'phone', 'alternate_phone',
                'birthday', 'whatsapp', 'website',
                'company_name', 'company_registration_number', 'tax_id',
                'default_shipping_address', 'default_billing_address',
            ]));

            if ($request->filled('phone')) {
                $user->forceFill(['phone' => $request->phone])->save();
            }

            if ($request->hasAny(['first_name', 'last_name'])) {
                $user->update(['name' => trim($customer->first_name . ' ' . $customer->last_name)]);
            }

            return response()->json([
                'message'  => 'Profile updated successfully',
                'customer' => $customer->fresh(),
                'user'     => $user->fresh(),
            ], 200);

        } catch (\Exception $e) {
            return response()->json(['message' => 'Failed to update profile', 'error' => $e->getMessage()], 500);
        }
    }

    // CustomerController
    public function uploadImage(Request $request, $id) {
        $request->validate(['image' => 'required|image|max:2048']);
        $customer = Customer::findOrFail($id);

        if ($customer->profile_image &&
            !str_starts_with($customer->profile_image, 'http')) {
            \Illuminate\Support\Facades\Storage::disk('public')->delete($customer->profile_image);
        }

        $path = $request->file('image')->store('customers', 'public');
        $customer->update(['profile_image' => $path]);
        $fresh = $customer->fresh();

        return response()->json([
            'customer'          => $fresh,
            'profile_image_url' => $fresh->profile_image_url,
        ]);
    }

    public function uploadCustomerImage(Request $request)
    {
        $request->validate(['image' => 'required|image|max:2048']);
        $customer = $request->user()->customer;
        if (!$customer) return response()->json(['message' => 'Not found'], 404);

        // Delete old image if it's a local file
        if ($customer->profile_image &&
            !str_starts_with($customer->profile_image, 'http')) {
            Storage::disk('public')->delete($customer->profile_image);
        }

        $path = $request->file('image')->store('customers', 'public');
        $customer->update(['profile_image' => $path]);
        $fresh = $customer->fresh();

        return response()->json([
            'message'           => 'Profile image updated',
            'profile_image_url' => $fresh->profile_image_url,
        ]);
    }

    /**
     * Get customer statistics (ADMIN)
     */
    public function statistics()
    {
        $stats = [
            'total_customers' => Customer::count(),
            'active_customers' => Customer::active()->count(),
            'vip_customers' => Customer::vip()->count(),
            'with_credit' => Customer::withCredit()->count(),
            'by_tier' => [
                'bronze' => Customer::byTier('bronze')->count(),
                'silver' => Customer::byTier('silver')->count(),
                'gold' => Customer::byTier('gold')->count(),
                'platinum' => Customer::byTier('platinum')->count(),
            ],
            'by_type' => [
                'individual' => Customer::byType('individual')->count(),
                'business' => Customer::byType('business')->count(),
                'wholesale' => Customer::byType('wholesale')->count(),
                'contractor' => Customer::byType('contractor')->count(),
            ],
            'total_revenue' => Customer::sum('total_spent'),
        ];

        return response()->json($stats, 200);
    }

    /**
     * Get top customers (ADMIN)
     */
    public function topCustomers(Request $request)
    {
        $limit = $request->get('limit', 10);

        $customers = Customer::with(['user', 'salesRep'])
            ->active()
            ->orderBy('total_spent', 'desc')
            ->limit($limit)
            ->get();

        return response()->json($customers, 200);
    }

    /**
     * Assign sales rep to customer (ADMIN)
     */
    public function assignSalesRep(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'sales_rep_id' => 'required|exists:users,id'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Verify sales rep role
        $salesRep = User::findOrFail($request->sales_rep_id);
        if (!in_array($salesRep->role, ['sales_rep', 'admin', 'super_admin'])) {
            return response()->json([
                'message' => 'User is not a sales representative'
            ], 400);
        }

        $customer = Customer::findOrFail($id);
        $customer->update(['assigned_sales_rep' => $request->sales_rep_id]);

        return response()->json([
            'message' => 'Sales rep assigned successfully',
            'customer' => $customer->fresh(['salesRep'])
        ], 200);
    }

    /**
     * Add tag to customer (ADMIN)
     */
    public function addTag(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'tag' => 'required|string|max:50'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $customer = Customer::findOrFail($id);
        $customer->addTag($request->tag);

        return response()->json([
            'message' => 'Tag added successfully',
            'customer' => $customer->fresh()
        ], 200);
    }

    /**
     * Remove tag from customer (ADMIN)
     */
    public function removeTag(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'tag' => 'required|string'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $customer = Customer::findOrFail($id);
        $customer->removeTag($request->tag);

        return response()->json([
            'message' => 'Tag removed successfully',
            'customer' => $customer->fresh()
        ], 200);
    }

    /**
     * Add store credit to customer (ADMIN)
     * NEW METHOD
     */
    public function addCredit(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'amount' => 'required|numeric|min:0',
            'reason' => 'nullable|string|max:255'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $customer = Customer::findOrFail($id);
        
        $customer->addStoreCredit(
            $request->amount,
            $request->reason ?? 'Manual credit addition by admin'
        );

        return response()->json([
            'message' => 'Store credit added successfully',
            'customer' => $customer->fresh(),
            'new_balance' => $customer->store_credit
        ], 200);
    }

    /**
     * Add loyalty points to customer (ADMIN)
     * NEW METHOD
     */
    public function addLoyaltyPoints(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'points' => 'required|integer|min:0',
            'reason' => 'nullable|string|max:255'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $customer = Customer::findOrFail($id);
        
        // Add points (will apply tier multiplier automatically)
        $customer->addLoyaltyPoints($request->points);

        return response()->json([
            'message' => 'Loyalty points added successfully',
            'customer' => $customer->fresh(),
            'new_balance' => $customer->loyalty_points
        ], 200);
    }
}