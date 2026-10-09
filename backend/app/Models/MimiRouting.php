<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** The owner's switches per kind of account (script 105). No row means the .env / config/mimi.php value applies. */
class MimiRouting extends Model
{
    protected $table = 'mimi_routing';

    protected $primaryKey = 'audience';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = ['audience', 'mode', 'fallback', 'updated_by', 'updated_at'];

    protected $casts = ['updated_at' => 'datetime'];
}
