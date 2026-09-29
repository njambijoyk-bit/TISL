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
        'customer_id', 'supplier_id', 'currency_id', 'is_system', 'is_active', 'notes',
        'rate_type', 'rate_value', 'valid_from', 'valid_until', 'min_amount', 'max_amount', 'free_above', 'transit_days', 'side', 'settings',
    ];

    protected $casts = [
        'opening_balance' => 'decimal:2',
        'is_system'       => 'boolean',
        'is_active'       => 'boolean',
        'rate_value'      => 'decimal:4',
        'min_amount'      => 'decimal:2',
        'max_amount'      => 'decimal:2',
        'free_above'      => 'decimal:2',
        'valid_from'      => 'date:Y-m-d',
        'valid_until'     => 'date:Y-m-d',
        'settings'        => 'array',
    ];

    public const RATE_TYPES = ['percent', 'fixed', 'per_unit'];

    public function group(): BelongsTo
    {
        return $this->belongsTo(LedgerGroup::class, 'group_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function entries(): HasMany
    {
        return $this->hasMany(VoucherEntry::class);
    }
}
