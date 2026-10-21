<?php

namespace App\Models\Extras;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/** Addendum 1, 2...: what changed in a tender after it was published, with its files and, when it moved, the new closing date. */
class TenderAddendum extends Model
{
    protected $table = 'tender_addenda';

    protected $fillable = ['tender_id', 'number', 'title', 'note', 'previous_deadline', 'new_deadline', 'created_by'];

    protected $casts = ['previous_deadline' => 'datetime', 'new_deadline' => 'datetime'];

    public function tender()
    {
        return $this->belongsTo(Tender::class);
    }

    public function documents()
    {
        return $this->hasMany(TenderDocument::class, 'addendum_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
