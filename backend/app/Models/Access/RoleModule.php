<?php

namespace App\Models\Access;

use Illuminate\Database\Eloquent\Model;

class RoleModule extends Model
{
    protected $table = 'role_modules';
    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = null;
    protected $fillable = ['role_id', 'module_key'];
}
