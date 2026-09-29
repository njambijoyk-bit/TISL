<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;

class VoucherEditLimit extends Model
{
    public $timestamps = false;

    protected $table = 'voucher_edit_limits';

    protected $fillable = ['role', 'voucher_type_id', 'max_days_back', 'can_cancel', 'can_edit'];

    protected $casts = ['can_cancel' => 'boolean', 'can_edit' => 'boolean'];
}
