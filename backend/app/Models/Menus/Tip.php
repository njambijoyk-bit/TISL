<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A tip taken with an order, waiting in the tips box until a person hands it over (script 212). */
class Tip extends Model
{
    public const PENDING = 'pending';

    public const ISSUED = 'issued';

    protected $table = 'menus_tips';

    protected $guarded = [];

    protected $casts = ['amount' => 'decimal:2', 'issued_at' => 'datetime'];

    public function events(): HasMany
    {
        return $this->hasMany(TipEvent::class, 'tip_id')->orderBy('id');
    }

    public function pending(): bool
    {
        return $this->status === self::PENDING;
    }

    /** Has script 212 been run? */
    public static function installed(): bool
    {
        return \Illuminate\Support\Facades\Schema::hasTable('menus_tips') && \Illuminate\Support\Facades\Schema::hasTable('menus_tip_events');
    }
}
