<?php

namespace App\Models\Pos;

use Illuminate\Database\Eloquent\Model;

class Station extends Model
{
    protected $table = 'pos_stations';

    protected $guarded = [];

    protected $hidden = ['token_hash'];

    protected $casts = ['is_default' => 'boolean', 'is_active' => 'boolean', 'last_seen_at' => 'datetime'];
}
