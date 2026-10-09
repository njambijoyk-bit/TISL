<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Which offer (and promised date) a preorder, a Sales Order, was taken under. The order's own lines carry the quantity and the money. */
class PreorderLine extends Model
{
    public $timestamps = false;

    protected $fillable = ['voucher_id', 'offer_id', 'variant_id', 'location_id', 'promised_date', 'created_at'];

    protected $casts = ['promised_date' => 'date:Y-m-d'];
}
