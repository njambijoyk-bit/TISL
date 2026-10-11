<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** What one station has to make for one order. */
class Ticket extends Model
{
    protected $table = 'menus_tickets';

    protected $guarded = [];

    protected $casts = ['due_at' => 'datetime', 'started_at' => 'datetime', 'ready_at' => 'datetime', 'cancelled_at' => 'datetime'];

    public function order(): BelongsTo
    {
        return $this->belongsTo(MenuOrder::class, 'order_id');
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class, 'station_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(MenuOrderLine::class, 'ticket_id')->orderBy('id');
    }
}
