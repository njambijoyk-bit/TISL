<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** One thing that happened to a tip: handed over, or undone (script 212). Never edited. */
class TipEvent extends Model
{
    public const ISSUED = 'issued';

    public const REVERSED = 'reversed';

    protected $table = 'menus_tip_events';

    protected $guarded = [];

    protected $casts = ['amount' => 'decimal:2', 'done_at' => 'datetime'];
}
