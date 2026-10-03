<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class DeliveryItem extends Model
{
    protected $fillable = [
        'manifest_id',
        'order_id',          // old manifests only; new stops use their Delivery Notes
        'customer_id',
        'contact_name',
        'contact_phone',
        'address',
        'stop_key',
        'cod_amount',
        'cod_voucher_id',
        'cod_at',
        'status',
        'sort_order',
        'estimated_arrival',
        'delivery_latitude',      
        'delivery_longitude', 
        'arrival_latitude',
        'arrival_longitude',
        'distance_from_prev_km',
        'time_from_prev_minutes',
        'delivery_notes',
        'proof_of_delivery',
        'failed_reason',
        'attempted_at',
        'delivered_at',
        'returned_at',
    ];

    protected $casts = [
        'estimated_arrival'      => 'datetime',
        'attempted_at'           => 'datetime',
        'delivered_at'           => 'datetime',
        'returned_at'            => 'datetime',
        'delivery_latitude'      => 'decimal:7',  
        'delivery_longitude'     => 'decimal:7',  
        'arrival_latitude'       => 'decimal:7',
        'arrival_longitude'      => 'decimal:7',
        'distance_from_prev_km'  => 'decimal:2',
        'time_from_prev_minutes' => 'integer',
        'sort_order'             => 'integer',
        'cod_amount'             => 'decimal:2',
        'cod_at'                 => 'datetime',
    ];

    protected $appends = [
        'status_label',
        'proof_of_delivery_url',
        'is_on_time',
        'minutes_late',
        'order',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function manifest(): BelongsTo
    {
        return $this->belongsTo(DeliveryManifest::class, 'manifest_id');
    }

    /** The Delivery Notes on this stop. */
    public function notes(): HasMany
    {
        return $this->hasMany(DeliveryItemVoucher::class, 'delivery_item_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    /**
     * What the screens used to read as `item.order`: the stop described as one document. A stop carries one or more
     * Delivery Notes, so the number is all of them, the lines are all of their lines, and the totals add up.
     * Only built when `notes.voucher.items` was loaded (no hidden queries per stop).
     */
    public function getOrderAttribute(): ?array
    {
        if (! $this->relationLoaded('notes')) {
            return null;
        }
        $vouchers = $this->notes->map->voucher->filter();
        $first    = $vouchers->first();
        $c        = $this->relationLoaded('customer') ? $this->customer : null;

        return [
            'id'               => $first?->id,
            'order_number'     => $vouchers->pluck('voucher_number')->join(', '),
            'number'           => $vouchers->pluck('voucher_number')->join(', '),
            'status'           => $this->status,
            'priority'         => null,
            'customer'         => $c ?? ($this->contact_name ? ['first_name' => $this->contact_name, 'last_name' => '', 'phone' => $this->contact_phone] : null),
            'customer_id'      => $this->customer_id,
            'shipping_address' => $this->address,
            'notes'            => $vouchers->map(fn ($v) => ['id' => $v->id, 'voucher_number' => $v->voucher_number, 'date' => $v->date?->toDateString()])->values(),
            'items'            => $vouchers->flatMap(fn ($v) => $v->relationLoaded('items') ? $v->items->where('is_header', false)->map(fn ($i) => [
                'id' => $i->id, 'voucher_number' => $v->voucher_number, 'quantity' => (float) $i->quantity, 'unit_price' => (float) $i->rate,
                'name' => $i->description, 'display_name' => $i->description, 'product' => ['name' => $i->description],
            ]) : collect())->values(),
            'total'            => (float) $vouchers->sum('total_amount'),
            'total_kes'        => (float) $vouchers->sum('base_total'),
            'subtotal'         => (float) $vouchers->sum('subtotal'),
            'tax'              => (float) $vouchers->sum('tax_total'),
            'delivery_method'  => $this->relationLoaded('manifest') ? $this->manifest?->delivery_method : null,
        ];
    }

    public function rating(): HasOne
    {
        return $this->hasOne(DeliveryRating::class, 'delivery_item_id');
    }

    public function incidents(): HasMany
    {
        return $this->hasMany(DeliveryIncident::class, 'delivery_item_id');
    }

    // ========================================
    // ACCESSORS
    // ========================================

    public function getStatusLabelAttribute(): string
    {
        return match ($this->status) {
            'pending'          => 'Pending',
            'out_for_delivery' => 'Out for Delivery',
            'delivered'        => 'Delivered',
            'failed'           => 'Failed',
            'returned'         => 'Returned',
            default            => ucfirst($this->status),
        };
    }

    public function getProofOfDeliveryUrlAttribute(): ?string
    {
        if (! $this->proof_of_delivery) return null;

        if (str_starts_with($this->proof_of_delivery, 'http')) {
            return $this->proof_of_delivery;
        }

        return url(Storage::url($this->proof_of_delivery));
    }

    public function getIsOnTimeAttribute(): ?bool
    {
        if (! $this->delivered_at || ! $this->estimated_arrival) return null;
        return $this->delivered_at->lte($this->estimated_arrival);
    }

    public function getMinutesLateAttribute(): ?int
    {
        if (! $this->delivered_at || ! $this->estimated_arrival) return null;
        $diff = $this->estimated_arrival->diffInMinutes($this->delivered_at, false);
        return $diff > 0 ? $diff : 0;
    }

    // ========================================
    // HELPERS
    // ========================================

    /**
     * Mark this stop as delivered. The Delivery Notes are not touched: they show as delivered through this stop.
     */
    public function markDelivered(
        ?float  $lat   = null,
        ?float  $lng   = null,
        ?string $notes = null,
        ?string $proof = null,
    ): void {
        $this->update([
            'status'            => 'delivered',
            'delivered_at'      => now(),
            'attempted_at'      => now(),
            'arrival_latitude'  => $lat,
            'arrival_longitude' => $lng,
            'delivery_notes'    => $notes ?? $this->delivery_notes,
            'proof_of_delivery' => $proof ?? $this->proof_of_delivery,
        ]);
    }

    /**
     * Mark this stop as failed — order stays shipped, logistics decides.
     */
    public function markFailed(string $reason, ?float $lat = null, ?float $lng = null): void
    {
        $this->update([
            'status'            => 'failed',
            'attempted_at'      => now(),
            'failed_reason'     => $reason,
            'arrival_latitude'  => $lat,
            'arrival_longitude' => $lng,
        ]);
        // The Delivery Notes are untouched: they are free for another manifest
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeDelivered($query)
    {
        return $query->where('status', 'delivered');
    }

    public function scopeFailed($query)
    {
        return $query->where('status', 'failed');
    }
}
