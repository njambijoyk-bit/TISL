<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class CustomerAddress extends Model
{
    use HasFactory, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'customer_id',
        'address_type',
        'label',
        'contact_name',
        'contact_phone',
        'address_line_1',
        'address_line_2',
        'city',
        'state',
        'postal_code',
        'country',
        'landmark',
        'delivery_instructions',
        'is_default_shipping',
        'is_default_billing',
        'latitude',
        'longitude',
        'verified',
        'verified_at',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'is_default_shipping' => 'boolean',
        'is_default_billing' => 'boolean',
        'verified' => 'boolean',
        'verified_at' => 'datetime',
        'latitude' => 'decimal:8',
        'longitude' => 'decimal:8',
    ];

    /**
     * Append custom attributes.
     */
    protected $appends = [
        'full_address',
        'formatted_address',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get the customer that owns this address.
     */
    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Get orders that used this address for shipping.
     */
    public function shippingOrders()
    {
        return $this->hasMany(Order::class, 'shipping_address_id');
    }

    /**
     * Get orders that used this address for billing.
     */
    public function billingOrders()
    {
        return $this->hasMany(Order::class, 'billing_address_id');
    }

    // ========================================
    // ACCESSORS (Computed Properties)
    // ========================================

    /**
     * Get full address as single string.
     */
    public function getFullAddressAttribute(): string
    {
        $parts = array_filter([
            $this->address_line_1,
            $this->address_line_2,
            $this->landmark,
            $this->city,
            $this->state,
            $this->postal_code,
            $this->country,
        ]);
        
        return implode(', ', $parts);
    }

    /**
     * Get formatted address for display.
     */
    public function getFormattedAddressAttribute(): string
    {
        $html = '';
        
        if ($this->contact_name) {
            $html .= "<strong>{$this->contact_name}</strong><br>";
        }
        
        if ($this->contact_phone) {
            $html .= "{$this->contact_phone}<br>";
        }
        
        $html .= $this->address_line_1 . '<br>';
        
        if ($this->address_line_2) {
            $html .= $this->address_line_2 . '<br>';
        }
        
        if ($this->landmark) {
            $html .= "Near: {$this->landmark}<br>";
        }
        
        $html .= "{$this->city}, {$this->state} {$this->postal_code}<br>";
        $html .= $this->country;
        
        return $html;
    }

    // ========================================
    // SCOPES (Query Filters)
    // ========================================

    /**
     * Scope to get addresses for a specific customer.
     */
    public function scopeForCustomer($query, int $customerId)
    {
        return $query->where('customer_id', $customerId);
    }

    /**
     * Scope to get addresses by type.
     */
    public function scopeByType($query, string $type)
    {
        return $query->where('address_type', $type);
    }

    /**
     * Scope to get default shipping addresses.
     */
    public function scopeDefaultShipping($query)
    {
        return $query->where('is_default_shipping', true);
    }

    /**
     * Scope to get default billing addresses.
     */
    public function scopeDefaultBilling($query)
    {
        return $query->where('is_default_billing', true);
    }

    /**
     * Scope to get verified addresses.
     */
    public function scopeVerified($query)
    {
        return $query->where('verified', true);
    }

    /**
     * Scope to search addresses.
     */
    public function scopeSearch($query, string $search)
    {
        return $query->where(function ($q) use ($search) {
            $q->where('label', 'like', "%{$search}%")
              ->orWhere('contact_name', 'like', "%{$search}%")
              ->orWhere('address_line_1', 'like', "%{$search}%")
              ->orWhere('address_line_2', 'like', "%{$search}%")
              ->orWhere('city', 'like', "%{$search}%")
              ->orWhere('postal_code', 'like', "%{$search}%");
        });
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Set as default shipping address.
     */
    public function setAsDefaultShipping(): void
    {
        // Remove default from other addresses
        self::where('customer_id', $this->customer_id)
            ->where('id', '!=', $this->id)
            ->update(['is_default_shipping' => false]);
        
        // Set this as default
        $this->update(['is_default_shipping' => true]);
    }

    /**
     * Set as default billing address.
     */
    public function setAsDefaultBilling(): void
    {
        // Remove default from other addresses
        self::where('customer_id', $this->customer_id)
            ->where('id', '!=', $this->id)
            ->update(['is_default_billing' => false]);
        
        // Set this as default
        $this->update(['is_default_billing' => true]);
    }

    /**
     * Verify this address.
     */
    public function verify(): void
    {
        $this->update([
            'verified' => true,
            'verified_at' => now(),
        ]);
    }

    /**
     * Check if address is complete.
     */
    public function isComplete(): bool
    {
        return !empty($this->address_line_1) &&
               !empty($this->city) &&
               !empty($this->state) &&
               !empty($this->country);
    }

    /**
     * Get distance from another address (if coordinates available).
     */
    public function distanceFrom(CustomerAddress $other): ?float
    {
        if (!$this->latitude || !$this->longitude || !$other->latitude || !$other->longitude) {
            return null;
        }
        
        // Haversine formula for distance calculation
        $earthRadius = 6371; // km
        
        $latFrom = deg2rad($this->latitude);
        $lonFrom = deg2rad($this->longitude);
        $latTo = deg2rad($other->latitude);
        $lonTo = deg2rad($other->longitude);
        
        $latDelta = $latTo - $latFrom;
        $lonDelta = $lonTo - $lonFrom;
        
        $a = sin($latDelta / 2) * sin($latDelta / 2) +
             cos($latFrom) * cos($latTo) *
             sin($lonDelta / 2) * sin($lonDelta / 2);
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
        
        return $earthRadius * $c;
    }

    /**
     * Check if address is within delivery zone.
     */
    public function isWithinDeliveryZone(array $boundaries): bool
    {
        if (!$this->latitude || !$this->longitude) {
            return false;
        }
        
        // Simple boundary check (can be enhanced with polygon checking)
        return $this->latitude >= $boundaries['min_lat'] &&
               $this->latitude <= $boundaries['max_lat'] &&
               $this->longitude >= $boundaries['min_lon'] &&
               $this->longitude <= $boundaries['max_lon'];
    }

    // ========================================
    // EVENTS
    // ========================================

    /**
     * Boot method for model events.
     */
    protected static function boot()
    {
        parent::boot();
        
        // Auto-set as default if it's the first address
        static::creating(function ($address) {
            $hasShipping = self::where('customer_id', $address->customer_id)
                              ->where('is_default_shipping', true)
                              ->exists();
            
            $hasBilling = self::where('customer_id', $address->customer_id)
                             ->where('is_default_billing', true)
                             ->exists();
            
            if (!$hasShipping) {
                $address->is_default_shipping = true;
            }
            
            if (!$hasBilling) {
                $address->is_default_billing = true;
            }
        });
    }
}