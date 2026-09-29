<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A numbering series for one voucher type: prefix / suffix / start / width / reset, optionally per branch. */
class VoucherSeries extends Model
{
    protected $table = 'voucher_series';

    protected $fillable = [
        'voucher_type_id', 'name', 'prefix', 'suffix', 'number_width', 'start_number', 'next_number',
        'reset_period', 'last_reset_key', 'location_id', 'allow_manual', 'is_default', 'is_active',
    ];

    protected $casts = [
        'allow_manual' => 'boolean',
        'is_default'   => 'boolean',
        'is_active'    => 'boolean',
    ];

    public const RESETS = ['never', 'yearly', 'monthly', 'financial_year'];

    public function type(): BelongsTo
    {
        return $this->belongsTo(VoucherType::class, 'voucher_type_id');
    }
}
