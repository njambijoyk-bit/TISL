<?php

namespace App\Models\Memberships;

use Illuminate\Database\Eloquent\Model;

/** One line of a member's credit ledger. */
class CreditEntry extends Model
{
    public $timestamps = false;

    protected $table = 'membership_credits';

    protected $guarded = [];

    protected $casts = ['expires_at' => 'datetime', 'created_at' => 'datetime', 'allocations' => 'array', 'delta' => 'integer', 'remaining' => 'integer'];
}
