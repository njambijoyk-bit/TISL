<?php

namespace App\Models\Access;

use Illuminate\Database\Eloquent\Model;

class Permission extends Model
{
    protected $table = 'permissions';
    protected $primaryKey = 'key';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = ['key', 'module_key', 'group_name', 'label', 'is_write', 'sort_order'];
    protected $casts = ['is_write' => 'boolean'];
}
