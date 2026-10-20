<?php

namespace App\Models\Extras;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Models\User;
use App\Models\Vendor;

class Prequalification extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'template_id',
        'vendor_id',
        'pq_number',
        'responses',
        'status',
        'submitted_at',
        'reviewed_by',
        'reviewed_at',
        'qualified_at',
        'expires_at',
        'score',
        'review_notes',
        'rejection_reason',
        'categories_qualified',
    ];

    protected $casts = [
        'responses'            => 'array',
        'categories_qualified' => 'array',
        'score'                => 'decimal:2',
        'submitted_at'         => 'datetime',
        'reviewed_at'          => 'datetime',
        'qualified_at'         => 'datetime',
        'expires_at'           => 'date',
    ];

    // =========================================================================
    // RELATIONSHIPS
    // =========================================================================

    public function template()
    {
        return $this->belongsTo(PrequalificationTemplate::class, 'template_id');
    }

    public function vendor()
    {
        return $this->belongsTo(Vendor::class);
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function documents()
    {
        return $this->hasMany(PrequalificationDocument::class);
    }

    // =========================================================================
    // SCOPES
    // =========================================================================

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    public function scopeQualified($query)
    {
        return $query->where('status', 'qualified')
            ->where(function ($q) {
                $q->whereNull('expires_at')
                  ->orWhere('expires_at', '>', now());
            });
    }

    public function scopeForVendor($query, int $vendorId)
    {
        return $query->where('vendor_id', $vendorId);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    public static function generatePqNumber(): string
    {
        $nextId = (static::withTrashed()->max('id') ?? 0) + 1;
        return 'PQ-' . date('Y') . '-' . str_pad($nextId, 4, '0', STR_PAD_LEFT);
    }

    public function isQualified(): bool
    {
        return $this->status === 'qualified'
            && ($this->expires_at === null || $this->expires_at->isFuture());
    }
}
