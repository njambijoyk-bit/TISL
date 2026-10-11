<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** A chef asking a colleague to take a shift (or to trade shifts). The colleague agrees, then a manager approves (unless the settings let agreed swaps through). */
class Swap extends Model
{
    public const STATUSES = ['asked' => 'Waiting for the colleague', 'agreed' => 'Waiting for a manager', 'approved' => 'Done', 'declined' => 'Declined', 'cancelled' => 'Cancelled', 'expired' => 'Ran out'];

    protected $table = 'menus_swaps';

    protected $guarded = [];

    protected $casts = ['answered_at' => 'datetime', 'decided_at' => 'datetime'];

    public function open(): bool
    {
        return in_array($this->status, ['asked', 'agreed'], true);
    }
}
