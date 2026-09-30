<?php

namespace App\Models\Books;

use App\Models\Customer;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Ledger extends Model
{
    protected $table = 'ledgers';

    protected $fillable = [
        'group_id', 'name', 'code', 'opening_balance', 'opening_side',
        'customer_id', 'supplier_id', 'address', 'currency_id', 'is_system', 'is_active', 'notes',
        'rate_type', 'rate_value', 'valid_from', 'valid_until', 'min_amount', 'max_amount', 'free_above', 'transit_days', 'side', 'settings',
        'classification', 'unit_of_measure_id', 'calculation_base', 'calculation_sequence', 'requires_certificate',
        'tax_nature', 'tax_rate_ledger_id', 'affects_stock', 'bank_name', 'account_number', 'branch',
        'account_name', 'swift_code', 'branch_code', 'accepts', 'mobile_kind', 'mobile_number', 'cash_kind', 'offer_at_checkout', 'checkout_label', 'checkout_instructions', 'checkout_sort',
    ];

    protected $casts = [
        'opening_balance' => 'decimal:2',
        'is_system'       => 'boolean',
        'is_active'       => 'boolean',
        'offer_at_checkout' => 'boolean',
        'rate_value'      => 'decimal:4',
        'min_amount'      => 'decimal:2',
        'max_amount'      => 'decimal:2',
        'free_above'      => 'decimal:2',
        'valid_from'      => 'date:Y-m-d',
        'valid_until'     => 'date:Y-m-d',
        'settings'        => 'array',
        'requires_certificate' => 'boolean',
        'affects_stock'    => 'boolean',
        'calculation_sequence' => 'integer',
    ];

    public const RATE_TYPES = ['percent', 'fixed', 'per_unit'];

    /** What a sales / purchase account does about tax (Tally: the ledger carries the tax nature). */
    public const TAX_NATURES = ['taxable', 'zero_rated', 'exempt', 'out_of_scope'];

    public function group(): BelongsTo
    {
        return $this->belongsTo(LedgerGroup::class, 'group_id');
    }

    /** The tax rate a sales / purchase account uses (itself a ledger). */
    public function taxRateLedger(): BelongsTo
    {
        return $this->belongsTo(self::class, 'tax_rate_ledger_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function entries(): HasMany
    {
        return $this->hasMany(VoucherEntry::class, 'ledger_id');   // explicit: TaxRate / ShippingOption extend Ledger and would otherwise look for tax_rate_id / shipping_option_id
    }
}
