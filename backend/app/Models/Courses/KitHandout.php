<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

class KitHandout extends Model
{
    protected $table = 'course_kit_handouts';

    protected $guarded = [];

    protected $casts = ['published_at' => 'datetime', 'handed_at' => 'datetime', 'quantity' => 'decimal:3'];
}
