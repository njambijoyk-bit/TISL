<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** How money moved through a bank on one voucher: transfer reference, cheque, or a deposit / withdrawal slip. */
class VoucherInstrument extends Model
{
    protected $table = 'voucher_instruments';

    protected $fillable = ['voucher_id', 'ledger_id', 'direction', 'type', 'number', 'instrument_date', 'bank_name', 'deposited_by', 'reference', 'amount', 'status', 'status_at'];

    protected $casts = ['amount' => 'decimal:2', 'instrument_date' => 'date:Y-m-d', 'status_at' => 'datetime'];

    public function voucher(): BelongsTo
    {
        return $this->belongsTo(Voucher::class);
    }

    public function ledger(): BelongsTo
    {
        return $this->belongsTo(Ledger::class);
    }
}
