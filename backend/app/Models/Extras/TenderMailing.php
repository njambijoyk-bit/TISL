<?php

namespace App\Models\Extras;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/** A record that a tender (or an addendum to it) was emailed to vendors, and to how many. */
class TenderMailing extends Model
{
    protected $fillable = ['tender_id', 'kind', 'note', 'recipient_count', 'sent_by'];

    public function sender()
    {
        return $this->belongsTo(User::class, 'sent_by');
    }
}
