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
        'customer_id', 'supplier_id', 'is_system', 'is_active', 'notes',
    ];

    protected $casts = [
        'opening_balance' => 'decimal:2',
        'is_system'       => 'boolean',
        'is_active'       => 'boolean',
    ];

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
