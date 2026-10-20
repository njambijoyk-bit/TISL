<?php

namespace App\Models\Extras;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Models\Vendor;

class TenderBid extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'tender_id',
        'vendor_id',
        'bid_number',
        'total_amount',
        'currency',
        'delivery_timeline_days',
        'cover_letter',
        'technical_proposal',
        'status',
        'submitted_at',
        'evaluation_score',
        'evaluation_notes',
        'metadata',
    ];

    protected $casts = [
        'total_amount'          => 'decimal:2',
        'evaluation_score'      => 'decimal:2',
        'delivery_timeline_days' => 'integer',
        'metadata'              => 'array',
        'submitted_at'          => 'datetime',
    ];

    // =========================================================================
    // RELATIONSHIPS
    // =========================================================================

    public function tender()
    {
        return $this->belongsTo(Tender::class);
    }

    public function vendor()
    {
        return $this->belongsTo(Vendor::class);
    }

    public function items()
    {
        return $this->hasMany(TenderBidItem::class);
    }

    public function documents()
    {
        return $this->hasMany(TenderBidDocument::class);
    }

    // =========================================================================
    // SCOPES
    // =========================================================================

    public function scopeSubmitted($query)
    {
        return $query->where('status', 'submitted');
    }

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    public static function generateBidNumber(): string
    {
        $nextId = (static::withTrashed()->max('id') ?? 0) + 1;
        return 'BID-' . date('Y') . '-' . str_pad($nextId, 4, '0', STR_PAD_LEFT);
    }

    public function recalculateTotal(): void
    {
        $this->update([
            'total_amount' => round($this->items()->sum('line_total'), 2),
        ]);
    }
}
