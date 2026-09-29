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

    public function ledger(): BelongsTo
    {
        return $this->belongsTo(Ledger::class);
    }
}
