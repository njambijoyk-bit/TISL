<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** The one row of LIVE payment settings (script 116). Read and changed only through App\Services\Payments\PaymentSettings, which keeps a version and a log line for every change. */
class PaymentSetting extends Model
{
    public $incrementing = false;

    protected $guarded = [];

    protected $casts = ['versions' => 'array'];

    protected $hidden = ['mpesa_enc'];
}
