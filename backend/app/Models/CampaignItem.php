<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Something a campaign features, by reference (a product, service, hamper or auction). Names, prices and stock are always read live, never copied. */
class CampaignItem extends Model
{
    public const TYPES = ['product', 'service', 'hamper', 'auction'];

    protected $fillable = ['campaign_id', 'section_id', 'item_type', 'item_id', 'position', 'available_from', 'label_override'];

    protected $casts = ['available_from' => 'datetime'];

    /** Dates go out in the site's own time with its offset (2026-10-18T09:00:00+03:00), so what staff typed is what they see again and a browser reads it correctly. */
    protected function serializeDate(\DateTimeInterface $date): string
    {
        return \Carbon\Carbon::instance($date)->setTimezone(config('app.timezone'))->format('Y-m-d\TH:i:sP');
    }
}
