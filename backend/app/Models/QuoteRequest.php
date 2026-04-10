<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class QuoteRequest extends Model
{
    use HasFactory, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'request_number',
        'customer_id',
        'request_type',
        'request_title',
        'request_description',
        'requested_items',
        'budget_range',
        'timeline_needed',
        'delivery_location',
        'attachments',
        'status',
        'priority',
        'assigned_to',
        'assigned_at',
        'quote_id',
        'quoted_at',
        'customer_notes',
        'admin_notes',
        'rejection_reason',
        'requires_clarification',
        'clarification_notes',
        'clarification_response',
        'customer_responded_at',
        'expires_at',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'requested_items' => 'array',
        'attachments' => 'array',
        'requires_clarification' => 'boolean',
        'assigned_at' => 'datetime',
        'quoted_at' => 'datetime',
        'clarification_response' => 'array',
        'customer_responded_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    /**
     * Append custom attributes.
     */
    protected $appends = [
        'status_label',
        'priority_label',
        'is_expired',
        'is_pending',
        'has_quote',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get the customer who made this request.
     */
    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Get the admin assigned to this request.
     */
    public function assignedTo()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    /**
     * Get the quote created from this request.
     */
    public function quote()
    {
        return $this->belongsTo(Quote::class);
    }

    // ========================================
    // ACCESSORS (Computed Properties)
    // ========================================

    /**
     * Get human-readable status label.
     */
    public function getStatusLabelAttribute(): string
    {
        return match($this->status) {
            'pending' => 'Pending',
            'reviewing' => 'Under Review',
            'quoted' => 'Quote Created',
            'rejected' => 'Rejected',
            'expired' => 'Expired',
            default => ucfirst($this->status),
        };
    }

    /**
     * Get human-readable priority label.
     */
    public function getPriorityLabelAttribute(): string
    {
        return match($this->priority) {
            'low' => 'Low',
            'medium' => 'Medium',
            'high' => 'High',
            'urgent' => 'Urgent',
            default => ucfirst($this->priority),
        };
    }

    /**
     * Check if request is expired.
     */
    public function getIsExpiredAttribute(): bool
    {
        return $this->expires_at && $this->expires_at < now();
    }

    /**
     * Check if request is pending.
     */
    public function getIsPendingAttribute(): bool
    {
        return $this->status === 'pending';
    }

    /**
     * Check if request has a quote.
     */
    public function getHasQuoteAttribute(): bool
    {
        return $this->quote_id !== null;
    }

    // ========================================
    // SCOPES (Query Filters)
    // ========================================

    /**
     * Scope to get requests by status.
     */
    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    /**
     * Scope to get pending requests.
     */
    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    /**
     * Scope to get reviewing requests.
     */
    public function scopeReviewing($query)
    {
        return $query->where('status', 'reviewing');
    }

    /**
     * Scope to get quoted requests.
     */
    public function scopeQuoted($query)
    {
        return $query->where('status', 'quoted');
    }

    /**
     * Scope to get expired requests.
     */
    public function scopeExpired($query)
    {
        return $query->where('status', 'expired')
                     ->orWhere(function ($q) {
                         $q->whereNotNull('expires_at')
                           ->where('expires_at', '<', now());
                     });
    }

    /**
     * Scope to get requests for a specific customer.
     */
    public function scopeForCustomer($query, int $customerId)
    {
        return $query->where('customer_id', $customerId);
    }

    /**
     * Scope to get assigned requests.
     */
    public function scopeAssigned($query)
    {
        return $query->whereNotNull('assigned_to');
    }

    /**
     * Scope to get unassigned requests.
     */
    public function scopeUnassigned($query)
    {
        return $query->whereNull('assigned_to');
    }

    /**
     * Scope to get requests by priority.
     */
    public function scopeByPriority($query, string $priority)
    {
        return $query->where('priority', $priority);
    }

    /**
     * Scope to search requests.
     */
    public function scopeSearch($query, ?string $search = null)
    {
        // Return early if search is empty
        if (empty($search)) {
            return $query;
        }
        
        return $query->where(function ($q) use ($search) {
            $q->where('request_number', 'like', "%{$search}%")
            ->orWhere('request_title', 'like', "%{$search}%")
            ->orWhere('request_description', 'like', "%{$search}%")
            ->orWhereHas('customer', function ($customerQuery) use ($search) {
                $customerQuery->where('first_name', 'like', "%{$search}%")
                            ->orWhere('last_name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%");
            });
        });
    }

    /**
     * Scope to get requests requiring clarification.
     */
    public function scopeRequiresClarification($query)
    {
        return $query->where('requires_clarification', true);
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Assign to admin.
     */
    public function assignTo(User $admin): void
    {
        $this->update([
            'assigned_to' => $admin->id,
            'assigned_at' => now(),
            'status' => 'reviewing',
        ]);
    }

    /**
     * Mark as quoted.
     */
    public function markAsQuoted(Quote $quote): void
    {
        $this->update([
            'status' => 'quoted',
            'quote_id' => $quote->id,
            'quoted_at' => now(),
        ]);
    }

    /**
     * Mark as rejected.
     */
    public function markAsRejected(string $reason): void
    {
        $this->update([
            'status' => 'rejected',
            'rejection_reason' => $reason,
        ]);
    }

    /**
     * Mark as requiring clarification.
     */
    public function requireClarification(string $notes): void
    {
        $this->update([
            'requires_clarification' => true,
            'clarification_notes' => $notes,
        ]);
    }

    /**
     * Mark clarification as received.
     */
    public function clarificationReceived(string $response): void
    {
        $clarificationResponse = $this->clarification_response ?? [];
        $clarificationResponse[] = [
            'response' => $response,
            'responded_at' => now()->toISOString(),
        ];
        
        $this->update([
            'requires_clarification' => false,
            'clarification_response' => $clarificationResponse,
            'customer_responded_at' => now(),
        ]);
    }

    /**
     * Mark as expired.
     */
    public function markAsExpired(): void
    {
        $this->update([
            'status' => 'expired',
        ]);
    }

    /**
     * Check if can be converted to quote.
     */
    public function canConvertToQuote(): bool
    {
        return $this->status === 'reviewing' && !$this->has_quote;
    }

    // ========================================
    // STATIC METHODS
    // ========================================

    /**
     * Generate unique request number.
     */
    public static function generateRequestNumber(): string
    {
        $year = date('Y');
        $lastRequest = self::whereYear('created_at', $year)
            ->orderBy('id', 'desc')
            ->first();
        
        $sequence = $lastRequest 
            ? (int) substr($lastRequest->request_number, -5) + 1 
            : 1;
        
        return 'QR-' . $year . '-' . str_pad($sequence, 5, '0', STR_PAD_LEFT);
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
        
        // Auto-generate request number before creating
        static::creating(function ($request) {
            if (!$request->request_number) {
                $request->request_number = self::generateRequestNumber();
            }

            // Set default expiry date (30 days from now)
            if (!$request->expires_at) {
                $request->expires_at = now()->addDays(30);
            }
        });
    }
}