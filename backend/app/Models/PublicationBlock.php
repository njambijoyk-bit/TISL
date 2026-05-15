<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PublicationBlock extends Model
{
    protected $fillable = [
        'publication_id', 'type', 'block_order', 'content', 'style'
    ];

    protected $casts = [
        'content' => 'array',
        'style'   => 'array',
    ];

    public function publication(): BelongsTo
    {
        return $this->belongsTo(Publication::class);
    }
}
