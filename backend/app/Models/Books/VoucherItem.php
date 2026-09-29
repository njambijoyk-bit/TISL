<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An item line. A hamper is a header line (is_header, display only) whose
 * components are child lines; accounting, tax and stock use the components.
 */
class VoucherItem extends Model
{
    protected $table = 'voucher_items';

    protected $fillable = [
        'voucher_id', 'parent_item_id', 'line_no', 'item_type', 'is_header', 'product_id', 'variant_id',
        'variant_unit_id', 'service_id', 'service_variant_id', 'hamper_id', 'description', 'variant_label',
        'sku', 'unit_code', 'unit_factor', 'quantity', 'base_quantity', 'rate', 'discount_amount', 'amount',
        'tax_rate_id', 'tax_rate_percent', 'tax_amount', 'ledger_id', 'location_id', 'delivered_quantity',
        'invoiced_quantity', 'source_item_id', 'notes', 'discount_ledger_id', 'discount_source', 'discount_ref', 'shipping_option_id', 'pending_price',
    ];

    protected $casts = [
        'is_header'          => 'boolean',
        'pending_price'      => 'boolean',
        'unit_factor'        => 'decimal:6',
        'quantity'           => 'decimal:4',
        'base_quantity'      => 'decimal:4',
        'rate'               => 'decimal:4',
        'discount_amount'    => 'decimal:2',
        'amount'             => 'decimal:2',
        'tax_rate_percent'   => 'decimal:4',
        'tax_amount'         => 'decimal:2',
        'delivered_quantity' => 'decimal:4',
        'invoiced_quantity'  => 'decimal:4',
    ];

    public function voucher(): BelongsTo
    {
        return $this->belongsTo(Voucher::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_item_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_item_id')->orderBy('line_no');
    }

    public function taxes(): HasMany
    {
        return $this->hasMany(VoucherItemTax::class, 'item_id');
    }

    public function ledger(): BelongsTo
    {
        return $this->belongsTo(Ledger::class);
    }
}
