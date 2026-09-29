<?php

namespace App\Models\Books;

use App\Models\Currency;
use App\Models\Customer;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A coded, spendable balance (what "store credit" used to be). The money it
 * represents sits in one liability ledger; this row is the sub-ledger — who
 * holds it, in what currency, until when.
 */
class GiftVoucher extends Model
{
    protected $table = 'gift_vouchers';

    public const ACTIVE = 'active';
    public const USED = 'used';
    public const EXPIRED = 'expired';
    public const CANCELLED = 'cancelled';

    public const SOURCES = ['sale', 'customer_account', 'loyalty', 'referral', 'promo', 'manual', 'migration'];

    protected $fillable = ['code', 'customer_id', 'currency_id', 'initial_amount', 'balance', 'expires_at', 'status', 'source', 'issued_voucher_id', 'note', 'created_by'];

    protected $casts = ['initial_amount' => 'decimal:2', 'balance' => 'decimal:2', 'expires_at' => 'date:Y-m-d'];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(GiftVoucherTransaction::class)->orderBy('id');
    }

    public function isSpendable(): bool
    {
        return $this->status === self::ACTIVE && (float) $this->balance > 0 && (! $this->expires_at || $this->expires_at->endOfDay()->isFuture());
    }
}
