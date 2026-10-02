<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** How much a petty cash box should hold, and who looks after it. */
class PettyCashFloat extends Model
{
    protected $fillable = ['ledger_id', 'float_amount', 'custodian_user_id', 'updated_by'];

    protected $casts = ['float_amount' => 'decimal:2'];
}
