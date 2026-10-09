<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MimiKbQuestion extends Model
{
    protected $table = 'mimi_kb_questions';

    public $timestamps = false;

    protected $fillable = ['entry_id', 'lang', 'question', 'sort'];
}
