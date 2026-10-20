<?php

namespace App\Models\Extras;

use App\Models\Vendor;
use Illuminate\Database\Eloquent\Model;

/** Who won what, recorded after the offline decision. lot_code null = the whole tender. */
class TenderAward extends Model
{
    protected $fillable = ['tender_id', 'lot_code', 'vendor_id', 'winner_name', 'amount', 'currency', 'awarded_on', 'notes', 'created_by'];

    protected $casts = ['amount' => 'decimal:2', 'awarded_on' => 'date'];

    public function vendor()
    {
        return $this->belongsTo(Vendor::class);
    }
}
