<?php

namespace App\Models\Access;

use Illuminate\Database\Eloquent\Model;

class ClearanceLevel extends Model
{
    protected $table = 'clearance_levels';
    protected $primaryKey = 'level';
    public $incrementing = false;
    protected $fillable = ['level', 'name', 'description'];
}
