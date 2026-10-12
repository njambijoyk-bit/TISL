<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

class RecipeSource extends Model
{
    protected $table = 'course_recipe_sources';

    protected $guarded = [];

    protected $casts = ['published_at' => 'datetime', 'handed_at' => 'datetime', 'quantity' => 'decimal:3'];
}
