<?php

namespace App\Models\Extras;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Models\User;
use App\Models\Vendor;

/**
 * A tender or pre-qualification call published on the website (the notice board): the website tells people about it and controls who may see it;
 * bids, evaluation and awards happen offline.
 */
class Tender extends Model
{
    use HasFactory, SoftDeletes;

    /** Who may see it: everyone | any signed-in vendor | pre-qualified vendors | invited vendors. */
    public const VISIBILITIES = ['public', 'all_vendors', 'prequalified', 'invited'];

    /** The people categories a tender (or one of its lots) can be reserved to. Blank means open to everyone. */
    public const RESERVATION_GROUPS = ['youth', 'women', 'pwd', 'sme'];

    public const NOTICE_TYPES = ['tender', 'prequalification', 'expression_of_interest'];

    public const DOCUMENT_TYPES = ['tender_document', 'tender_notice', 'advertisement', 'addendum', 'clarification', 'award_notice', 'other'];

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
        'notice_type',
        'procuring_entity',
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
        return $this->hasMany(TenderDocument::class)->orderBy('created_at');
    }

    public function invitations()
    {
        return $this->hasMany(TenderInvitation::class);
    }

    public function lots()
    {
        return $this->hasMany(TenderLot::class)->orderBy('sort_order')->orderBy('code');
    }

    public function mailings()
    {
        return $this->hasMany(TenderMailing::class)->latest();
    }

    // =========================================================================
    // SCOPES
    // =========================================================================

    /** What the public website may list: published, closed, awarded and terminated notices that are marked Public. Never drafts, never restricted ones. */
    public function scopePublicNotice($query)
    {
        return $query->whereIn('status', ['published', 'closed', 'awarded', 'cancelled'])
            ->where('visibility', 'public');
    }

    /** The tabs of the tender list. 'restricted' is only used for a signed-in vendor (see scopeVisibleTo). */
    public function scopeTab($query, ?string $tab)
    {
        return match ($tab) {
            'active'     => $query->where('status', 'published')->where('submission_deadline', '>', now()),
            'closed'     => $query->where(fn ($q) => $q->whereIn('status', ['closed', 'awarded'])
                                ->orWhere(fn ($p) => $p->where('status', 'published')->where(fn ($d) => $d->whereNull('submission_deadline')->orWhere('submission_deadline', '<=', now())))),
            'agpo'       => $query->where(fn ($q) => $q->whereNotNull('reservation_scheme')
                                ->orWhereHas('lots', fn ($l) => $l->whereNotNull('reservation_group'))),
            'terminated' => $query->where('status', 'cancelled'),
            'restricted' => $query->where('visibility', '!=', 'public'),
            default      => $query,
        };
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

    /** Published, closed, awarded and terminated tenders this vendor may see: public ones, vendors-only ones, ones they are invited to, and pre-qualified ones they qualify for. */
    public function scopeVisibleTo($query, Vendor $vendor)
    {
        return $query->whereIn('status', ['published', 'closed', 'awarded', 'cancelled'])
            ->where(function ($q) use ($vendor) {
                $q->whereIn('visibility', ['public', 'all_vendors'])
                  ->orWhere(function ($q2) use ($vendor) {
                      $q2->where('visibility', 'invited')
                         ->whereHas('invitations', fn ($inv) => $inv->where('vendor_id', $vendor->id));
                  })
                  ->orWhere(function ($q2) use ($vendor) {
                      $q2->where('visibility', 'prequalified')
                         ->whereExists(function ($sub) use ($vendor) {
                             $sub->select(\Illuminate\Support\Facades\DB::raw(1))
                                 ->from('vendor_prequalifications')
                                 ->where('vendor_prequalifications.vendor_id', $vendor->id)
                                 ->where('vendor_prequalifications.status', 'qualified')
                                 ->whereColumn('vendor_prequalifications.category', 'tenders.category')
                                 ->where(fn ($exp) => $exp->whereNull('vendor_prequalifications.valid_until')->orWhere('vendor_prequalifications.valid_until', '>=', now()->toDateString()));
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

    /** What the list shows: open | closed | awarded | terminated | draft. A published tender whose time has passed is closed without anyone pressing a button. */
    public function displayStatus(): string
    {
        return match (true) {
            $this->status === 'cancelled' => 'terminated',
            $this->status === 'awarded'   => 'awarded',
            $this->status === 'draft'     => 'draft',
            $this->isOpen()               => 'open',
            default                       => 'closed',
        };
    }

    /** Every reservation group this tender or one of its lots is limited to (empty = open to everyone). */
    public function reservedGroups(): array
    {
        $groups = $this->relationLoaded('lots') ? $this->lots->pluck('reservation_group') : $this->lots()->pluck('reservation_group');

        return $groups->push($this->reservation_scheme)->filter()->unique()->values()->all();
    }
}
