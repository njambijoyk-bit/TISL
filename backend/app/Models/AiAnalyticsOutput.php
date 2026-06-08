<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiAnalyticsOutput extends Model
{
    protected $fillable = [
        'session_id', 'entity_type', 'entity_id',
        'output_type', 'content', 'is_dismissed',
    ];

    protected $casts = [
        'is_dismissed' => 'boolean',
    ];

    public function session()
    {
        return $this->belongsTo(AiAnalyticsSession::class, 'session_id');
    }
}