<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** One knowledge entry Mimi can answer from (script 105). The list fields are space separated, as in the HTML file. */
class MimiKbEntry extends Model
{
    protected $table = 'mimi_kb_entries';

    protected $fillable = ['entry_key', 'title', 'audience', 'requires', 'sensitivity', 'resolver', 'keywords', 'follow', 'answer_md', 'more_md', 'denied_text', 'empty_text',
        'status', 'reviewed_at', 'reviewed_by', 'version', 'updated_by'];

    protected $casts = ['reviewed_at' => 'datetime', 'version' => 'integer'];

    public function questions(): HasMany
    {
        return $this->hasMany(MimiKbQuestion::class, 'entry_id')->orderBy('sort')->orderBy('id');
    }
}
