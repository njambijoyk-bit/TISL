<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A person's own setting for a component: it applies to them (a loan, a union fee), their own amount, or an exemption. */
class PayrollEmployeeItem extends Model
{
    protected $fillable = ['user_id', 'component_id', 'amount', 'exempt', 'note'];

    protected $casts = ['amount' => 'float', 'exempt' => 'boolean'];
}
