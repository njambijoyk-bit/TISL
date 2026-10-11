<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** One customer order for food: who, how it is fetched, when, where it stands. It points at the Sales Order in the books. */
class MenuOrder extends Model
{
    public const STATUSES = ['placed' => 'Placed', 'accepted' => 'Accepted', 'preparing' => 'Preparing', 'ready' => 'Ready', 'out' => 'Out for delivery', 'completed' => 'Completed', 'cancelled' => 'Cancelled'];

    protected $table = 'menus_orders';

    protected $guarded = [];

    protected $casts = ['asap' => 'boolean', 'fulfil_at' => 'datetime', 'placed_at' => 'datetime', 'accepted_at' => 'datetime', 'ready_at' => 'datetime', 'completed_at' => 'datetime', 'cancelled_at' => 'datetime',
        'subtotal' => 'decimal:2', 'tax_total' => 'decimal:2', 'total' => 'decimal:2', 'delivery_fee' => 'decimal:2', 'tip' => 'decimal:2', 'service_charge' => 'decimal:2', 'tendered' => 'decimal:2', 'change_due' => 'decimal:2',
        'tax_breakdown' => 'array', 'tenders' => 'array', 'settled_at' => 'datetime'];

    protected $hidden = ['track_token'];

    public function lines(): HasMany
    {
        return $this->hasMany(MenuOrderLine::class, 'order_id')->orderBy('id');
    }

    public function channel(): BelongsTo
    {
        return $this->belongsTo(Channel::class, 'channel_id');
    }

    /** A tab: ordered, not yet paid, can still be added to. */
    public function isTab(): bool
    {
        return $this->payment === 'open';
    }

    /** Is it still going (not finished, not cancelled)? */
    public function open(): bool
    {
        return ! in_array($this->status, ['completed', 'cancelled'], true);
    }

    /** Cancelled after the money came in: someone has to give it back. */
    public function refundDue(): bool
    {
        return $this->status === 'cancelled' && $this->payment === 'paid';
    }
}
