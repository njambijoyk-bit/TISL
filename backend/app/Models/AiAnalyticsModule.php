<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiAnalyticsModule extends Model
{
    protected $fillable = [
        'key', 'label', 'description',
        'icon', 'is_enabled', 'sort_order',
    ];

    protected $casts = [
        'is_enabled' => 'boolean',
    ];

    public function sessions()
    {
        return $this->hasMany(AiAnalyticsSession::class, 'module_key', 'key');
    }
}