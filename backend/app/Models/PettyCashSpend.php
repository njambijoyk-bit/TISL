<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One payment out of petty cash: who, what for, which expense, the receipt, and the journal that booked it. */
class PettyCashSpend extends Model
{
    protected $fillable = ['number', 'ledger_id', 'expense_ledger_id', 'voucher_id', 'spent_on', 'payee', 'purpose', 'amount', 'receipt_path', 'spent_by', 'cancelled_at'];

    protected $casts = ['spent_on' => 'date', 'amount' => 'decimal:2', 'cancelled_at' => 'datetime'];
}
