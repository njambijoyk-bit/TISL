<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Stock sent from one branch to another. */
class Transfer extends Model
{
    protected $table = 'menus_transfers';

    protected $fillable = ['number', 'from_location_id', 'to_location_id', 'transferred_on', 'note', 'created_by'];

    protected $casts = ['transferred_on' => 'date'];

    public function lines(): HasMany
    {
        return $this->hasMany(TransferLine::class, 'transfer_id');
    }
}
