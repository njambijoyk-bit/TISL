<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Imports\CustomersImport;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Http\Request;
use Maatwebsite\Excel\Facades\Excel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Maatwebsite\Excel\Validators\ValidationException;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use App\Models\CustomerTier;
use App\Models\CustomerTypeDiscount;
use Illuminate\Validation\Rule;

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
            'customer_type'                 => ['sometimes', Rule::in(CustomerTypeDiscount::where('is_active', true)->pluck('slug'))],
            'tier'                          => ['sometimes', Rule::in(CustomerTier::where('is_active', true)->pluck('slug'))],
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

    public function downloadTemplate()
    {
        $columns = [
            'name', 'email', 'phone', 'customer_number', 'company_name', 'tax_id',
            'customer_type', 'tier', 'status', 'birthday', 'assigned_sales_rep', 'loyalty_points',
            'notes', 'tags', 'preferences', 'default_shipping_address',
            'default_billing_address', 'has_credit_account', 'credit_limit',
            'discount_percentage', 'store_credit', 'website', 'whatsapp',
        ];

        $csv = collect([$columns])
            ->map(fn($row) => implode(',', array_map(fn($cell) => '"' . str_replace('"', '""', $cell) . '"', $row)))
            ->implode("\n");

        return response($csv, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="customers_template.csv"',
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
        ]);
    }

    public function bulkImport(Request $request)
    {
        $this->authorize('viewAny', User::class);

        $request->validate([
            'file' => 'required|file|mimes:xlsx,xls,csv|max:5120',
        ]);

        try {
            Excel::import(new CustomersImport(), $request->file('file'));
            return response()->json(['message' => 'Customers imported successfully.']);

        } catch (ValidationException $e) {
            $failures = collect($e->failures())->take(5)->map(fn($f) => [
                'row'    => $f->row(),
                'errors' => $f->errors(),
            ]);
            return response()->json([
                'message' => 'Validation failed on some rows.',
                'errors'  => $failures->toArray(),
            ], 422);

        } catch (\Illuminate\Database\QueryException $e) {
            if ($e->getCode() == 23000 || str_contains($e->getMessage(), 'Duplicate entry')) {
                preg_match("/Duplicate entry '([^']+)' for key '([^']+)'/", $e->getMessage(), $matches);
                return response()->json([
                    'message' => "Import failed: Duplicate value '{$matches[1]}' on constraint '{$matches[2]}'.",
                    'hint'    => 'Check that all values in your CSV are unique and not already registered.',
                ], 422);
            }
            return response()->json(['message' => 'Import failed: ' . $e->getMessage()], 500);

        } catch (\Exception $e) {
            return response()->json(['message' => 'Import failed: ' . $e->getMessage()], 500);
        }
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
            'by_tier' => CustomerTier::orderBy('sort_order')->get()->mapWithKeys(function ($t) {
                return [$t->slug => Customer::byTier($t->slug)->count()];
            }),
            'by_type' => CustomerTypeDiscount::orderBy('sort_order')->get()->mapWithKeys(function ($t) {
                return [$t->slug => Customer::byType($t->slug)->count()];
            }),   
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
     * Get customers with upcoming birthdays (ADMIN)
     */
    public function upcomingBirthdays(Request $request)
    {
        $days = (int) $request->get('days', 30);
        $today = now()->startOfDay();
        $endDate = $today->copy()->addDays($days);

        $customers = Customer::whereNotNull('birthday')
            ->where(function ($query) use ($today, $endDate) {
                $startMonth = $today->month;
                $startDay   = $today->day;
                $endMonth   = $endDate->month;
                $endDay     = $endDate->day;

                if ($startMonth <= $endMonth) {
                    $query->whereRaw('MONTH(birthday) BETWEEN ? AND ?', [$startMonth, $endMonth])
                        ->where(function ($q) use ($startMonth, $startDay, $endMonth, $endDay) {
                            $q->whereRaw('(MONTH(birthday) > ? OR (MONTH(birthday) = ? AND DAY(birthday) >= ?))',
                                    [$startMonth, $startMonth, $startDay])
                                ->whereRaw('(MONTH(birthday) < ? OR (MONTH(birthday) = ? AND DAY(birthday) <= ?))',
                                    [$endMonth, $endMonth, $endDay]);
                        });
                } else {
                    $query->where(function ($q) use ($startMonth, $startDay) {
                        $q->whereRaw('MONTH(birthday) > ?', [$startMonth])
                        ->orWhereRaw('(MONTH(birthday) = ? AND DAY(birthday) >= ?)', [$startMonth, $startDay]);
                    })->orWhere(function ($q) use ($endMonth, $endDay) {
                        $q->whereRaw('MONTH(birthday) < ?', [$endMonth])
                        ->orWhereRaw('(MONTH(birthday) = ? AND DAY(birthday) <= ?)', [$endMonth, $endDay]);
                    });
                }
            })
            ->whereIn('status', ['active', 'inactive']) // exclude suspended/blacklisted
            ->get();

        return response()->json([
            'data' => $customers->map(function ($c) use ($today) {
                $birthday = \Carbon\Carbon::parse($c->birthday);

                try {
                    $next = \Carbon\Carbon::createFromDate($today->year, $birthday->month, $birthday->day)->startOfDay();
                } catch (\Exception $e) {
                    $next = \Carbon\Carbon::createFromDate($today->year, 3, 1)->startOfDay();
                }

                if ($next->lt($today)) {
                    try {
                        $next = \Carbon\Carbon::createFromDate($today->year + 1, $birthday->month, $birthday->day)->startOfDay();
                    } catch (\Exception $e) {
                        $next = \Carbon\Carbon::createFromDate($today->year + 1, 3, 1)->startOfDay();
                    }
                }

                $daysUntil = (int) $today->diffInDays($next);
                $age = $birthday->age;

                return [
                    'id'               => $c->id,
                    'name'             => trim($c->first_name . ' ' . $c->last_name),
                    'email'            => $c->email,
                    'phone'            => $c->phone,
                    'birthday'         => $c->birthday,
                    'tier'             => $c->tier,
                    'status'           => $c->status,
                    'age'              => $age,
                    'turning'          => $age + 1,
                    'days_until'       => $daysUntil,
                    'customer_number'  => $c->customer_number,
                    'profile_image_url'=> $c->profile_image_url ?? null,
                ];
            })->sortBy('days_until')->values()
        ], 200);
    }

    /**
     * Customer Health Dashboard (ADMIN)
     */
    public function health(Request $request)
    {
        $tab      = $request->get('tab', 'at_risk');
        $perPage  = (int) $request->get('per_page', 20);
        $page     = (int) $request->get('page', 1);

        switch ($tab) {

            case 'low_loyalty':
                $threshold = (int) $request->get('threshold', 100);
                $results = Customer::with('user')
                    ->where('loyalty_points', '<', $threshold)
                    ->orderBy('loyalty_points', 'asc')
                    ->paginate($perPage, ['*'], 'page', $page);
                break;

            case 'idle_credit':
                $minCredit = (float) $request->get('min_credit', 100);
                $results = Customer::with('user')
                    ->where('store_credit', '>=', $minCredit)
                    ->orderBy('store_credit', 'desc')
                    ->paginate($perPage, ['*'], 'page', $page);
                break;

            case 'at_risk':
                $results = Customer::with('user')
                    ->whereIn('status', ['suspended', 'blacklisted'])
                    ->orderByRaw("FIELD(status, 'blacklisted', 'suspended')")
                    ->paginate($perPage, ['*'], 'page', $page);
                break;

            case 'dormant_orders':
                $days = $request->get('days');
                $query = Customer::with('user');
                if ($days === 'never') {
                    $query->whereNull('last_order_date');
                } else {
                    $cutoff = now()->subDays((int) $days);
                    $query->where(function ($q) use ($cutoff) {
                        $q->whereNull('last_order_date')
                        ->orWhere('last_order_date', '<', $cutoff);
                    });
                }
                // MySQL-compatible NULL first: IS NULL sorts as 0 (false) DESC = nulls first
                $results = $query
                    ->orderByRaw('last_order_date IS NULL DESC')
                    ->orderBy('last_order_date', 'asc')
                    ->paginate($perPage, ['*'], 'page', $page);
                break;

            case 'dormant_login':
                $days = $request->get('days');
                $query = Customer::with('user')
                    ->join('users', 'customers.user_id', '=', 'users.id')
                    ->select('customers.*', 'users.last_login_at');
                if ($days === 'never') {
                    $query->whereNull('users.last_login_at');
                } else {
                    $cutoff = now()->subDays((int) $days);
                    $query->where(function ($q) use ($cutoff) {
                        $q->whereNull('users.last_login_at')
                        ->orWhere('users.last_login_at', '<', $cutoff);
                    });
                }
                $results = $query
                    ->orderByRaw('users.last_login_at IS NULL DESC')
                    ->orderBy('users.last_login_at', 'asc')
                    ->paginate($perPage, ['*'], 'page', $page);
                break;

            default:
                return response()->json(['message' => 'Invalid tab'], 422);
        }

        return response()->json($results, 200);
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