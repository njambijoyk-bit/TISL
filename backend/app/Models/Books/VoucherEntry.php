<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VoucherEntry extends Model
{
    public $timestamps = false;

    protected $table = 'voucher_entries';

    protected $fillable = ['voucher_id', 'line_no', 'ledger_id', 'side', 'amount', 'base_amount', 'is_party', 'is_tax', 'narration', 'cost_centre_id', 'location_id', 'created_at'];

    protected $casts = [
        'amount'      => 'decimal:2',
        'base_amount' => 'decimal:2',
        'is_party'    => 'boolean',
        'is_tax'      => 'boolean',
    ];

    public function voucher(): BelongsTo
    {
        return $this->belongsTo(Voucher::class);
    }

    public function ledger(): BelongsTo
    {
        return $this->belongsTo(Ledger::class);
    }
}
