<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A customer's request for a made-to-order cake or a catering job: the quote, the deposit and the job itself. It points at the Sales Order (and the invoice it becomes) in the books. */
class CookingRequest extends Model
{
    public const KINDS = ['cake' => 'Custom cake', 'catering' => 'Catering', 'private_chef' => 'Private chef'];

    /** The shopping for a private chef job: the chef buys it, the client has it, or it comes from our stock. */
    public const SHOPPING = ['chef' => 'The chef shops for the ingredients', 'client' => 'I will have the ingredients ready', 'stock' => 'From the kitchen\'s stock'];

    public const STATUSES = ['requested' => 'Requested', 'quoted' => 'Quoted', 'accepted' => 'Waiting for the deposit', 'confirmed' => 'Confirmed', 'preparing' => 'Being prepared', 'ready' => 'Ready',
        'completed' => 'Completed', 'declined' => 'Declined', 'expired' => 'Expired', 'cancelled' => 'Cancelled'];

    /** The next steps staff may take on a job once its deposit is in. */
    public const NEXT = ['confirmed' => ['preparing', 'ready'], 'preparing' => ['ready'], 'ready' => ['completed']];

    protected $table = 'menus_requests';

    protected $guarded = [];

    protected $casts = ['event_at' => 'datetime', 'quoted_at' => 'datetime', 'valid_until' => 'date:Y-m-d', 'accepted_at' => 'datetime', 'confirmed_at' => 'datetime', 'completed_at' => 'datetime',
        'cancelled_at' => 'datetime', 'details' => 'array', 'subtotal' => 'decimal:2', 'tax_total' => 'decimal:2', 'total' => 'decimal:2', 'deposit_pct' => 'decimal:2', 'deposit_amount' => 'decimal:2',
        'paid_total' => 'decimal:2', 'headcount' => 'integer', 'duration_minutes' => 'integer'];

    protected $hidden = ['track_token'];

    public function lines(): HasMany
    {
        return $this->hasMany(CookingRequestLine::class, 'request_id')->orderBy('id');
    }

    /** Still going: not finished, not turned down, not lapsed. */
    public function open(): bool
    {
        return ! in_array($this->status, ['completed', 'cancelled', 'declined', 'expired'], true);
    }

    public function balance(): float
    {
        return round(max(0.0, (float) $this->total - (float) $this->paid_total), 2);
    }

    /** Cancelled after money came in: someone has to give it back. */
    public function refundDue(): bool
    {
        return $this->status === 'cancelled' && (float) $this->paid_total > 0;
    }
}
