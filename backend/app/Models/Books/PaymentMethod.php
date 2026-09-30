<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A way of being paid, mapped to whichever ledger the admin chooses. */
class PaymentMethod extends Model
{
    protected $table = 'payment_methods';

    protected $fillable = ['name', 'code', 'kind', 'ledger_id', 'is_online', 'gateway', 'requires_reference', 'instructions', 'sort_order', 'is_active'];

    protected $casts = [
        'is_online'          => 'boolean',
        'requires_reference' => 'boolean',
        'is_active'          => 'boolean',
    ];

    public const KINDS = ['cash', 'mobile_money', 'bank', 'card', 'other'];

    /**
     * What the storefront charges automatically: an active online method with a gateway (M-Pesa prompt, card) — and, when it is backed by a money ledger, only if that ledger
     * is ticked "offer at checkout". A method with no ledger behind it is offered as before. Bank, till and cash-on-delivery choices come from the ledgers instead.
     */
    public function scopeOfferedAtCheckout($q)
    {
        return $q->where('is_active', true)->where('is_online', true)->whereNotNull('gateway')->where(function ($w) {
            $w->whereNull('ledger_id')->orWhereIn('ledger_id', fn ($s) => $s->select('id')->from('ledgers')->where('offer_at_checkout', true)->whereNull('deleted_at'));
        });
    }

    public function ledger(): BelongsTo
    {
        return $this->belongsTo(Ledger::class);
    }
}
