<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Auth\MustVerifyEmail;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes, MustVerifyEmail;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'phone',
        'company_name',
        'role',
        'status',
        'profile_picture',
        'bio',
        'google_id',
        'apple_id',
        'microsoft_id',
        'oauth_provider',
        'permissions',
        'email_notifications',
        'sms_notifications',
        'employee_id',
        'department',
        'hired_at',

        // login & password tracking
        'last_login_at',
        'last_login_ip',
        'last_login_user_agent',
        'failed_login_attempts',
        'locked_until',
        'password_changed_at',
        'force_password_change',
        'phone_otp',
        'phone_otp_expires_at',
    ];

    /**
     * The attributes that should be hidden for serialization.
     */
    protected $hidden = [
        'password',
        'remember_token',
        'phone_otp',  
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'email_verified_at' => 'datetime',
        'phone_verified_at' => 'datetime',
        'phone_otp_expires_at' => 'datetime',
        'password_changed_at' => 'datetime',
        'last_login_at' => 'datetime',
        'locked_until' => 'datetime',
        'hired_at' => 'datetime',
        'permissions' => 'array',
        'email_notifications' => 'boolean',
        'sms_notifications' => 'boolean',
        'force_password_change' => 'boolean',
        'failed_login_attempts' => 'integer',
        'password' => 'hashed',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get the customer record associated with the user.
     */
    public function customer()
    {
        return $this->hasOne(Customer::class);
    }

    /**
     * Get the employee record associated with the user (for staff members).
     */
    public function employee()
    {
        return $this->hasOne(Employee::class);
    }

    /**
     * Vendor profile for this user (role = 'vendor').
     * Mirrors the customer() and employee() pattern.
     */
    public function vendor()
    {
        return $this->hasOne(Vendor::class);
    }

    /**
     * Deliveries assigned to this user as a driver.
     */
    public function deliveries()
    {
        return $this->hasMany(Delivery::class, 'driver_id');
    }
    /**
     * Deliveries assigned by this user (logistics role).
     */
    public function assignedDeliveries()
    {
        return $this->hasMany(Delivery::class, 'assigned_by');
    }

    /**
     * M-Pesa transactions initiated by this user (finance/admin prompt).
     */
    public function initiatedTransactions()
    {
        return $this->hasMany(MpesaTransaction::class, 'initiated_by');
    }
    /**
     * Get orders placed by this user (who created the order).
     * This is for admin/sales rep who create orders on behalf of customers.
     */
    public function placedOrders()
    {
        return $this->hasMany(Order::class, 'placed_by');
    }

    /**
     * Get orders of this user's customer record.
     * This is for when user is a customer and has their own orders.
     */
    public function customerOrders()
    {
        return $this->customer ? $this->customer->orders : collect();
    }

    /**
     * Get quotes submitted by this user (who created the quote).
     * This is for admin/sales rep who create quotes on behalf of customers.
     */
    public function submittedQuotes()
    {
        return $this->hasMany(Quote::class, 'submitted_by');
    }

    /**
     * Get quotes of this user's customer record.
     * This is for when user is a customer and has their own quotes.
     */
    public function customerQuotes()
    {
        return $this->customer ? $this->customer->quotes : collect();
    }

    /**
     * Get customers assigned to this user (if sales rep).
     */
    public function assignedCustomers()
    {
        return $this->hasMany(Customer::class, 'assigned_sales_rep');
    }

    /**
     * Get customers created by this user (if admin).
     */
    public function createdCustomers()
    {
        return $this->hasMany(Customer::class, 'created_by');
    }

    /**
     * Get referral codes created by this user (if admin).
     */
    public function createdReferralCodes()
    {
        return $this->hasMany(ReferralCode::class, 'created_by');
    }

    /**
     * Get referral codes updated by this user (if admin).
     */
    public function updatedReferralCodes()
    {
        return $this->hasMany(ReferralCode::class, 'updated_by');
    }

    /**
     * Get brands created by this user (if admin).
     */
    public function createdBrands()
    {
        return $this->hasMany(Brand::class, 'created_by');
    }

    /**
     * Get categories created by this user (if admin).
     */
    public function createdCategories()
    {
        return $this->hasMany(Category::class, 'created_by');
    }

    /**
     * Get products created by this user (if admin).
     */
    public function createdProducts()
    {
        return $this->hasMany(Product::class, 'created_by');
    }

    /**
     * Get products last updated by this user.
     */
    public function updatedProducts()
    {
        return $this->hasMany(Product::class, 'updated_by');
    }

    /**
     * Get orders assigned to this user (if admin).
     */
    public function assignedOrders()
    {
        return $this->hasMany(Order::class, 'assigned_to');
    }

    /**
     * Get quotes assigned to this user (if admin).
     */
    public function assignedQuotes()
    {
        return $this->hasMany(Quote::class, 'assigned_to');
    }

    /**
     * Get reviews written by this user.
     */
    public function reviews()
    {
        return $this->hasMany(ProductReview::class);
    }

    /**
     * Get all notifications for this user.
     */
    public function notifications()
    {
        return $this->morphMany(Notification::class, 'notifiable');
    }

    /**
     * Get unread notifications.
     */
    public function unreadNotifications()
    {
        return $this->morphMany(Notification::class, 'notifiable')
            ->whereNull('read_at')
            ->orderBy('created_at', 'desc');
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Check if user is an admin (any admin role).
     */
    public function isAdmin(): bool
    {
        // Core admin roles that can access the admin panel generally
        return in_array($this->role, [
            'super_admin', 'admin', 'manager', 'sales_rep',
            'finance', 'logistics',
        ]);
    }

    /**
     * Check if user is a super admin.
     */
    public function isSuperAdmin(): bool
    {
        return $this->role === 'super_admin';
    }

    /**
     * Check if user is a customer.
     */
    public function isCustomer(): bool
    {
        return $this->role === 'customer';
    }

    /**
     * Check if user is a sales rep.
     */
    public function isSalesRep(): bool
    {
        return $this->role === 'sales_rep';
    }

    /**
     * Check if user is a manager.
     */
    public function isManager(): bool
    {
        return $this->role === 'manager';
    }

    /**
     * Vendor role check.
     */
    public function isVendor(): bool
    {
        return $this->role === 'vendor';
    }

    public function isFinance(): bool
    {
        return $this->role === 'finance';
    }

    public function isLogistics(): bool
    {
        return $this->role === 'logistics';
    }

    public function isDriver(): bool
    {
        return $this->role === 'driver';
    }

    /**
     * Staff = has an employee record.
     * finance and logistics are operational staff — they get employee records.
     * driver is portal-only like vendor, no employee record.
     */
    public function isStaff(): bool
    {
        return in_array($this->role, [
            'super_admin', 'admin', 'manager', 'sales_rep',
            'finance', 'logistics',
        ]);
    }

    /**
     * Operational roles that access the panel but manage no users.
     */
    public function isOperational(): bool
    {
        return in_array($this->role, ['finance', 'logistics']);
    }

    /**
     * Portal-only roles — external parties with limited access.
     */
    public function isPortalOnly(): bool
    {
        return in_array($this->role, ['vendor', 'driver']);
    }

    // ========================================
    // PERMISSION HELPERS
    // ========================================

    public function hasPermission(string $permission): bool
    {
        // Super admin has all permissions
        if ($this->isSuperAdmin()) {
            return true;
        }

        $permissions = $this->permissions ?? [];
        return in_array($permission, $permissions);
    }

    /**
     * Finance-specific permission checks.
     */
    public function canProcessPayments(): bool
    {
        return in_array($this->role, ['super_admin', 'admin', 'finance']);
    }

    public function canProcessRefunds(): bool
    {
        return in_array($this->role, ['super_admin', 'finance']);
    }

    public function canUpdateCurrencyRates(): bool
    {
        return in_array($this->role, ['super_admin', 'finance']);
    }

    public function canViewFinancialReports(): bool
    {
        return in_array($this->role, ['super_admin', 'admin', 'finance']);
    }

    /**
     * Logistics-specific permission checks.
     */
    public function canManageDeliveries(): bool
    {
        return in_array($this->role, ['super_admin', 'admin', 'logistics']);
    }

    public function canAssignDrivers(): bool
    {
        return in_array($this->role, ['super_admin', 'admin', 'logistics']);
    }

    /**
     * Check if user account is locked.
     */

    public function isLocked(): bool
    {
        return $this->locked_until && $this->locked_until > now();
    }

    /**
     * Check if user can login.
     */
    public function canLogin(): bool
    {
        // Suspended users cannot login
        if ($this->status === 'suspended') {
            return false;
        }

        // Locked users cannot login
        if ($this->isLocked()) {
            return false;
        }

        // Check employee status if staff
        if ($this->isStaff() && $this->employee) {
            return $this->employee->canLogin();
        }

        // Vendors and drivers in pending_approval cannot log in
        if ($this->isPortalOnly()) {
            $profile = $this->isVendor() ? $this->vendor : null;
            // drivers don't have a profile record yet — allow login by default
            if ($profile && $profile->status === 'pending_approval') {
                return false;
            }
        }

        return true;
    }

    /**
     * Record successful login.
     */
    public function recordLogin($request): void
    {
        // Use forceFill to bypass fillable if necessary, then save
        $this->forceFill([
            'last_login_at' => now(),
            'last_login_ip' => $request->ip(),
            'last_login_user_agent' => $request->userAgent(),
            'failed_login_attempts' => 0,
            'locked_until' => null,
        ])->save();

        // Mirror login timestamp on the vendor profile too
        if ($this->isVendor() && $this->vendor) {
            $this->vendor->forceFill([
                'last_login_at' => now(),
                'last_login_ip' => $request->ip(),
            ])->save();
        }
    }

    /**
     * Record failed login attempt.
     */
    public function recordFailedLogin(): void
    {
        // Increment in DB
        $this->increment('failed_login_attempts');

        // Refresh model to get the incremented value
        $this->refresh();

        // Lock account after 5 failed attempts (adjust threshold/time as needed)
        if ($this->failed_login_attempts >= 5) {
            $this->forceFill([
                'locked_until' => now()->addMinutes(30),
            ])->save();
        }
    }

    /**
     * Get user's full name with role.
     */
    public function getFullNameWithRole(): string
    {
        return $this->name . ' (' . ucfirst($this->role) . ')';
    }

    /**
     * Check if email is verified.
     */
    public function hasVerifiedEmail(): bool
    {
        return !is_null($this->email_verified_at);
    }

    /**
     * Check if phone is verified.
     */
    public function hasVerifiedPhone(): bool
    {
        return !is_null($this->phone_verified_at);
    }

    /**
     * Get profile picture URL.
     */
    public function getProfilePictureUrlAttribute(): ?string
    {
        if (!$this->profile_picture) {
            // Return default avatar based on name
            return 'https://ui-avatars.com/api/?name=' . urlencode($this->name) . '&size=200&background=0D8ABC&color=fff';
        }

        // If OAuth provider image (full URL)
        if (str_starts_with($this->profile_picture, 'http')) {
            return $this->profile_picture;
        }

        // Local storage image
        return asset('storage/customers' . $this->profile_picture);
    }

    /**
     * Get all orders for this user (combines both customer orders and placed orders).
     */
    public function getAllOrders()
    {
        if ($this->isCustomer() && $this->customer) {
            return $this->customer->orders;
        }
        
        return $this->placedOrders;
    }

    /**
     * Get all quotes for this user (combines both customer quotes and submitted quotes).
     */
    public function getAllQuotes()
    {
        if ($this->isCustomer() && $this->customer) {
            return $this->customer->quotes;
        }
        
        return $this->submittedQuotes;
    }

    /**
     * Check if user has a customer record.
     */
    public function hasCustomerRecord(): bool
    {
        return $this->customer()->exists();
    }

    /**
     * Check if user has an employee record.
     */
    public function hasEmployeeRecord(): bool
    {
        return $this->employee()->exists();
    }

    public function hasVendorRecord(): bool
    {
        return $this->vendor()->exists();
    }

    /**
     * Get or create customer record for this user.
     */
    public function getOrCreateCustomer(): Customer
    {
        if ($this->customer) {
            return $this->customer;
        }

        // Create customer record
        return Customer::create([
            'user_id' => $this->id,
            'first_name' => explode(' ', $this->name)[0] ?? $this->name,
            'last_name' => explode(' ', $this->name)[1] ?? '',
            'email' => $this->email,
            'phone' => $this->phone ?? '',
            'company_name' => $this->company_name ?? '',
            'customer_type' => 'individual',
            'tier' => 'bronze',
            'status' => 'active',
        ]);
    }

    /**
     * Get or create employee record for this user (staff only).
     */
    public function getOrCreateEmployee(array $data = []): ?Employee
    {
        if (!$this->isStaff()) {
            return null;
        }

        if ($this->employee) {
            return $this->employee;
        }

        // Create employee record
        return Employee::create([
            'user_id' => $this->id,
            'employee_id' => $data['employee_id'] ?? null,
            'job_title' => $data['job_title'] ?? ucfirst($this->role),
            'department' => $data['department'] ?? $this->department ?? 'General',
            'employment_type' => $data['employment_type'] ?? 'full_time',
            'hire_date' => $data['hire_date'] ?? now(),
            'work_phone' => $this->phone,
            'work_email' => $this->email,
            'status' => 'active',
            'created_by' => $data['created_by'] ?? null,
        ]);
    }

    // ========================================
    // SCOPES
    // ========================================

    /**
     * Scope to get only admin users.
     */
    public function scopeAdmins($query)
    {
        return $query->whereIn('role', [
            'super_admin', 'admin', 'manager', 'sales_rep',
            'finance', 'logistics',
        ]);
    }

    /**
     * Scope to get only customers.
     */
    public function scopeCustomers($query)
    {
        return $query->where('role', 'customer');
    }

    public function scopeVendors($query)
    {
        return $query->where('role', 'vendor');
    }

    /**
     * Scope to get only sales reps.
     */
    public function scopeSalesReps($query)
    {
        return $query->where('role', 'sales_rep');
    }

    public function scopeFinance($query)
    {
        return $query->where('role', 'finance');
    }

    public function scopeLogistics($query)
    {
        return $query->where('role', 'logistics');
    }

    public function scopeDrivers($query)
    {
        return $query->where('role', 'driver');
    }

    /**
     * Scope to get active users.
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    /**
     * Scope to get verified users.
     */
    public function scopeVerified($query)
    {
        return $query->whereNotNull('email_verified_at');
    }

    /**
     * Scope to search users.
     */
    public function scopeSearch($query, string $search)
    {
        return $query->where(function ($q) use ($search) {
            $q->where('name', 'like', "%{$search}%")
              ->orWhere('email', 'like', "%{$search}%")
              ->orWhere('phone', 'like', "%{$search}%")
              ->orWhere('company_name', 'like', "%{$search}%")
              ->orWhere('employee_id', 'like', "%{$search}%");
        });
    }

    /**
     * Scope to get users with employee records.
     */
    public function scopeHasEmployee($query)
    {
        return $query->whereHas('employee');
    }

    /**
     * Scope to get users without employee records (staff only).
     */
    public function scopeMissingEmployee($query)
    {
        return $query->whereIn('role', [
            'admin', 'manager', 'sales_rep', 'finance', 'logistics',
        ])->whereDoesntHave('employee');
    }
}