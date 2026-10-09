<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A pointer from a preorder offer to a purchase order that will bring its stock (script 111). Quantities and dates are read from the purchase order itself. */
class PreorderOfferSupply extends Model
{
    protected $table = 'preorder_offer_supply';

    public const UPDATED_AT = null;

    protected $guarded = [];
}
