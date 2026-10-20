<?php

namespace App\Models\Extras;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Models\User;
use App\Models\Vendor;

class Tender extends Model
{
    use HasFactory, SoftDeletes;

    public const PROCUREMENT_METHODS = [
        'open_tender', 'restricted_tender', 'request_for_quotation', 'request_for_proposal',
        'expression_of_interest', 'direct_procurement', 'framework_agreement',
    ];

    public const SUBMISSION_METHODS = ['electronic', 'physical', 'both'];

    /** The notice details an admin sets on a tender (script 217). */
    public const NOTICE_FIELDS = [
        'ocid', 'procurement_method', 'submission_method', 'reservation_scheme', 'has_preference_scheme',
        'opening_venue', 'tender_fee', 'validity_days', 'financial_year', 'public_link',
    ];

    protected $fillable = [
        'tender_number',
        'ocid',
        'procurement_method',
        'submission_method',
        'reservation_scheme',
        'has_preference_scheme',
        'opening_venue',
        'tender_fee',
        'validity_days',
        'financial_year',
        'public_link',
        'title',
        'description',
        'category',
        'branch_id',
        'budget_min',
        'budget_max',
        'currency',
        'requirements',
        'evaluation_criteria',
        'status',
        'visibility',
        'published_at',
        'submission_deadline',
        'opening_date',
        'created_by',
        'approved_by',
        'awarded_vendor_id',
        'awarded_at',
        'metadata',
    ];

    protected $casts = [
        'requirements'        => 'array',
        'evaluation_criteria' => 'array',
        'metadata'            => 'array',
        'budget_min'          => 'decimal:2',
        'budget_max'          => 'decimal:2',
        'tender_fee'          => 'decimal:2',
        'validity_days'       => 'integer',
        'has_preference_scheme' => 'boolean',
        'published_at'        => 'datetime',
        'submission_deadline' => 'datetime',
        'opening_date'        => 'datetime',
        'awarded_at'          => 'datetime',
    ];

    // =========================================================================
    // RELATIONSHIPS
    // =========================================================================

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function awardedVendor()
    {
        return $this->belongsTo(Vendor::class, 'awarded_vendor_id');
    }

    public function documents()
    {
        return $this->hasMany(TenderDocument::class);
    }

    public function invitations()
    {
        return $this->hasMany(TenderInvitation::class);
    }

    public function bids()
    {
        return $this->hasMany(TenderBid::class);
    }

    // =========================================================================
    // SCOPES
    // =========================================================================

    public function scopePublished($query)
    {
        return $query->where('status', 'published');
    }

    /** What the public may see: published, closed and awarded notices, never invite-only ones. */
    public function scopePublicNotice($query)
    {
        return $query->whereIn('status', ['published', 'closed', 'awarded'])
            ->where('visibility', '!=', 'invited');
    }

    public function scopeOpen($query)
    {
        return $query->where('status', 'published')
            ->where('submission_deadline', '>', now());
    }

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    public function scopeByCategory($query, string $category)
    {
        return $query->where('category', $category);
    }

    public function scopeVisibleTo($query, Vendor $vendor)
    {
        return $query->where(function ($q) use ($vendor) {
            $q->where('visibility', 'all_vendors')
              ->orWhere(function ($q2) use ($vendor) {
                  $q2->where('visibility', 'invited')
                     ->whereHas('invitations', fn ($inv) => $inv->where('vendor_id', $vendor->id));
              })
              ->orWhere(function ($q2) use ($vendor) {
                  $q2->where('visibility', 'prequalified')
                     ->whereExists(function ($sub) use ($vendor) {
                         $sub->select(\Illuminate\Support\Facades\DB::raw(1))
                             ->from('prequalifications')
                             ->where('vendor_id', $vendor->id)
                             ->where('status', 'qualified')
                             ->where(function ($exp) {
                                 $exp->whereNull('expires_at')
                                     ->orWhere('expires_at', '>', now());
                             });
                     });
              });
        });
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    public static function generateTenderNumber(): string
    {
        $nextId = (static::withTrashed()->max('id') ?? 0) + 1;
        return 'TND-' . date('Y') . '-' . str_pad($nextId, 4, '0', STR_PAD_LEFT);
    }

    public function isOpen(): bool
    {
        return $this->status === 'published'
            && $this->submission_deadline
            && $this->submission_deadline->isFuture();
    }
}
