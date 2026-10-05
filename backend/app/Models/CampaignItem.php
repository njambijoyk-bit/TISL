<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Something a campaign features, by reference (a product, service, hamper or auction). Names, prices and stock are always read live, never copied. */
class CampaignItem extends Model
{
    public const TYPES = ['product', 'service', 'hamper', 'auction'];

    protected $fillable = ['campaign_id', 'section_id', 'item_type', 'item_id', 'position', 'available_from', 'label_override'];

    protected $casts = ['available_from' => 'datetime'];
}
