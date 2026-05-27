<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PolicyChangeLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'policy_id', 'policy_key', 'changed_by', 'changed_by_name',
        'previous_version', 'new_version', 'is_major_bump', 'major_bump_note',
        'previous_content', 'new_content', 'changed_at',
    ];

    protected $casts = ['is_major_bump' => 'boolean', 'changed_at' => 'datetime'];

    public function policy() { return $this->belongsTo(Policy::class); }
}