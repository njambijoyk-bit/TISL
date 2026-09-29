<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VoucherType extends Model
{
    protected $table = 'voucher_types';

    protected $fillable = [
        'code', 'name', 'base_type', 'posts_accounts', 'stock_effect', 'has_items',
        'party_kind', 'default_ledger_id', 'is_system', 'is_active',
    ];

    protected $casts = [
        'posts_accounts' => 'boolean',
        'has_items'      => 'boolean',
        'is_system'      => 'boolean',
        'is_active'      => 'boolean',
    ];

    public const QUOTATION     = 'quotation';
    public const PURCHASE_ORDER = 'purchase_order';
    public const SALES_ORDER   = 'sales_order';
    public const DELIVERY_NOTE = 'delivery_note';
    public const SALES         = 'sales';
    public const CASH_SALE     = 'cash_sale';
    public const CREDIT_NOTE   = 'credit_note';
    public const RECEIPT_NOTE  = 'receipt_note';
    public const PURCHASE      = 'purchase';
    public const DEBIT_NOTE    = 'debit_note';
    public const RECEIPT       = 'receipt';
    public const PAYMENT       = 'payment';
    public const JOURNAL       = 'journal';
    public const CONTRA        = 'contra';
    public const OPENING_STOCK = 'opening_stock';

    public function series(): HasMany
    {
        return $this->hasMany(VoucherSeries::class)->orderByDesc('is_default')->orderBy('id');
    }

    public function defaultLedger(): BelongsTo
    {
        return $this->belongsTo(Ledger::class, 'default_ledger_id');
    }

    public static function byBase(string $base): ?self
    {
        return static::where('base_type', $base)->where('is_active', true)->orderBy('id')->first();
    }

    /** Sales-side types put revenue on the credit side of the line ledger; purchase-side on the debit side. */
    public function isSalesSide(): bool
    {
        return in_array($this->base_type, [self::QUOTATION, self::SALES_ORDER, self::DELIVERY_NOTE, self::SALES, self::CASH_SALE, self::CREDIT_NOTE], true);
    }
}
