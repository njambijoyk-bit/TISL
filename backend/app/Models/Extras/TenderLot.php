<?php

namespace App\Models\Extras;

use Illuminate\Database\Eloquent\Model;

/** One part of a tender (Lot A cups, Lot B plates), optionally reserved to one people category. Bidding is offline, so a lot only describes and records. */
class TenderLot extends Model
{
    protected $fillable = ['tender_id', 'code', 'title', 'description', 'reservation_group', 'sort_order'];

    public function tender()
    {
        return $this->belongsTo(Tender::class);
    }
}
